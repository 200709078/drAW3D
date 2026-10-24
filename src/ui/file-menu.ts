import { attachMenu } from './view-menu'

const TABS_KEY = 'drAW3D.netTabs'

export interface FileMenuHandlers {
  onNew(): void
  onOpen(): void
  onSave(saveAs: boolean): void
  onExportImage(): void
  onNetSvg(tabs: boolean): void
  onNetPrint(tabs: boolean): void
  /** Only in the desktop app, which writes PDFs itself. */
  onNetPdf?(tabs: boolean): void
}

function loadTabs(): boolean {
  try {
    return localStorage.getItem(TABS_KEY) !== 'false'
  } catch {
    return true
  }
}

/** The toolbar's file menu: documents, the view as an image and the selected solid's net. */
export function createFileMenu(button: HTMLButtonElement, handlers: FileMenuHandlers): void {
  const { menu, setOpen } = attachMenu(button, 'fileMenu', 'Dosya')
  menu.classList.add('file-menu')
  const heading = (text: string) => {
    const title = document.createElement('h3')
    title.textContent = text
    menu.append(title)
  }
  const item = (id: string, caption: string, shortcut: string, action: () => void) => {
    const entry = document.createElement('button')
    entry.type = 'button'
    entry.id = id
    entry.className = 'menu-item'
    entry.setAttribute('role', 'menuitem')
    entry.append(caption)
    if (shortcut) {
      const hint = document.createElement('kbd')
      hint.textContent = shortcut
      entry.append(hint)
    }
    entry.addEventListener('click', () => {
      setOpen(false)
      action()
    })
    menu.append(entry)
  }
  heading('Belge')
  item('fileNew', 'Yeni', '', handlers.onNew)
  item('fileOpen', 'Aç…', 'Ctrl+O', handlers.onOpen)
  item('fileSave', 'Kaydet', 'Ctrl+S', () => handlers.onSave(false))
  item('fileSaveAs', 'Farklı Kaydet…', 'Ctrl+Shift+S', () => handlers.onSave(true))
  heading('Dışa Aktar')
  item('fileImage', 'Görüntüyü PNG olarak kaydet', '', handlers.onExportImage)
  heading('Açınım (seçili cisim)')
  const label = document.createElement('label')
  label.className = 'view-option'
  const tabs = document.createElement('input')
  tabs.type = 'checkbox'
  tabs.id = 'netTabs'
  tabs.checked = loadTabs()
  tabs.addEventListener('change', () => {
    try {
      localStorage.setItem(TABS_KEY, String(tabs.checked))
    } catch {
      // The choice then lasts for this visit.
    }
  })
  label.append(tabs, 'Yapıştırma payları')
  menu.append(label)
  item('netSvg', 'Gerçek ölçekte SVG olarak kaydet', '', () => handlers.onNetSvg(tabs.checked))
  item('netPrint', 'Yazdır', '', () => handlers.onNetPrint(tabs.checked))
  const pdf = handlers.onNetPdf
  if (pdf) item('netPdf', 'PDF olarak kaydet', '', () => pdf(tabs.checked))
}
