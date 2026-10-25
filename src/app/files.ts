import { FILE_EXTENSION } from '../document/file-format'
import { DrawFiles, isAndroidApp, saveOnAndroid } from './native'

/** Where the open document lives: a desktop path, an Android document or a browser file handle. */
export type FileTarget = { kind: 'desktop'; path: string } | { kind: 'android'; uri: string } | { kind: 'web'; handle: SaveHandle }

export interface OpenedFile {
  name: string
  text: string
  target: FileTarget | null
}

// The File System Access API (Chromium); other browsers download and upload instead.
interface SaveHandle {
  name: string
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>
}
interface OpenHandle extends SaveHandle {
  getFile(): Promise<File>
}
interface PickerType {
  description: string
  accept: Record<string, string[]>
}
interface FilePickers {
  showSaveFilePicker?(options: { suggestedName: string; types: PickerType[] }): Promise<SaveHandle>
  showOpenFilePicker?(options: { types: PickerType[]; multiple?: false }): Promise<OpenHandle[]>
}

const DOCUMENT_TYPE: PickerType = { description: 'drAW3D belgesi', accept: { 'application/json': [FILE_EXTENSION] } }
const EXPORT_TYPES = {
  png: { description: 'PNG görüntüsü', accept: { 'image/png': ['.png'] } },
  svg: { description: 'SVG çizimi', accept: { 'image/svg+xml': ['.svg'] } },
} satisfies Record<string, PickerType>

const pickers = () => window as unknown as FilePickers
const desktop = () => window.drAW3DDesktop?.files

const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

async function base64(data: Blob): Promise<string> {
  const bytes = new Uint8Array(await data.arrayBuffer())
  let binary = ''
  // In slices: one call with every byte would overflow the argument list.
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

function download(data: Blob, name: string): void {
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // The download has started by now; the URL is no longer needed.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A file from the browser's own chooser; null when nothing was picked. */
function chooseFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}

export async function openDocumentFile(): Promise<OpenedFile | null> {
  if (isAndroidApp()) {
    const opened = await DrawFiles.open()
    return 'cancelled' in opened ? null : { name: opened.name, text: opened.text, target: { kind: 'android', uri: opened.uri } }
  }
  const files = desktop()
  if (files) {
    const opened = await files.open()
    return opened && { name: opened.name, text: opened.text, target: { kind: 'desktop', path: opened.path } }
  }
  const { showOpenFilePicker } = pickers()
  if (showOpenFilePicker) {
    try {
      const [handle] = await showOpenFilePicker.call(window, { types: [DOCUMENT_TYPE] })
      if (!handle) return null
      const file = await handle.getFile()
      return { name: file.name, text: await file.text(), target: { kind: 'web', handle } }
    } catch (error) {
      if (cancelled(error)) return null
      throw error
    }
  }
  const file = await chooseFile(`${FILE_EXTENSION},application/json`)
  return file && { name: file.name, text: await file.text(), target: null }
}

/**
 * Save the document: into `target` when there is one and `saveAs` is off, otherwise to a
 * place the user picks (a download where the browser cannot ask). Null when cancelled.
 */
export async function saveDocumentFile(text: string, name: string, target: FileTarget | null, saveAs: boolean):
  Promise<{ name: string; target: FileTarget | null } | null> {
  if (isAndroidApp()) {
    const uri = !saveAs && target?.kind === 'android' ? target.uri : undefined
    // A typed (JSON) document would get ".json" appended by Android: name.drw3.json.
    const saved = await saveOnAndroid({ data: text, name, mimeType: 'application/octet-stream', ...(uri ? { uri } : {}) })
    return saved && { name: saved.name, target: { kind: 'android', uri: saved.uri } }
  }
  const files = desktop()
  if (files) {
    const saved = await files.save(text, !saveAs && target?.kind === 'desktop' ? target.path : null, name)
    return saved && { name: saved.name, target: { kind: 'desktop', path: saved.path } }
  }
  let handle = !saveAs && target?.kind === 'web' ? target.handle : null
  const { showSaveFilePicker } = pickers()
  try {
    if (!handle && showSaveFilePicker) handle = await showSaveFilePicker.call(window, { suggestedName: name, types: [DOCUMENT_TYPE] })
  } catch (error) {
    if (cancelled(error)) return null
    throw error
  }
  if (!handle) {
    download(new Blob([text], { type: 'application/json' }), name)
    return { name, target: null }
  }
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
  return { name: handle.name, target: { kind: 'web', handle } }
}

/** Save an export (PNG, SVG); the saved file's name, or null when cancelled. */
export async function exportFile(data: Blob, name: string, kind: 'png' | 'svg'): Promise<string | null> {
  if (isAndroidApp()) {
    const saved = kind === 'svg'
      ? await saveOnAndroid({ data: await data.text(), name, mimeType: 'image/svg+xml' })
      : await saveOnAndroid({ data: await base64(data), base64: true, name, mimeType: 'image/png' })
    return saved?.name ?? null
  }
  const files = desktop()
  if (files) {
    return files.exportFile(kind === 'svg' ? await data.text() : new Uint8Array(await data.arrayBuffer()), name, kind)
  }
  const { showSaveFilePicker } = pickers()
  if (!showSaveFilePicker) {
    download(data, name)
    return name
  }
  try {
    const handle = await showSaveFilePicker.call(window, { suggestedName: name, types: [EXPORT_TYPES[kind]] })
    const writable = await handle.createWritable()
    await writable.write(data)
    await writable.close()
    return handle.name
  } catch (error) {
    if (cancelled(error)) return null
    throw error
  }
}

/** Whether the app can write a PDF itself (the desktop app); browsers print to PDF. */
export function canSavePdf(): boolean {
  return Boolean(desktop()?.savePdf)
}

export function savePdf(html: string, name: string): Promise<string | null> {
  return desktop()!.savePdf(html, name)
}

/** Print a page through a hidden frame; the print dialog also offers saving as PDF. */
export function printHtml(html: string, name: string): void {
  // Android's WebView cannot print itself; the app's print service can (and saves PDFs).
  if (isAndroidApp()) {
    void DrawFiles.print({ html, name })
    return
  }
  const frame = document.createElement('iframe')
  frame.className = 'print-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
  frame.addEventListener('load', () => {
    const view = frame.contentWindow
    if (!view) return
    view.addEventListener('afterprint', () => frame.remove(), { once: true })
    view.focus()
    view.print()
  }, { once: true })
  frame.srcdoc = html
  document.body.append(frame)
}
