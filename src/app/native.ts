import { App } from '@capacitor/app'
import { Capacitor, registerPlugin } from '@capacitor/core'

/** The Android app's file and print plugin (android/…/DrawFilesPlugin.java). */
interface DrawFilesPlugin {
  open(): Promise<{ uri: string; name: string; text: string } | { cancelled: true }>
  /** Ask where a new file goes (name and type only). */
  create(options: { name: string; mimeType: string }): Promise<{ uri: string; name: string } | { cancelled: true }>
  write(options: { uri: string; data: string; base64?: boolean }): Promise<{ uri: string; name: string }>
  print(options: { html: string; name: string }): Promise<void>
  /** A document handed over by another app (its address from the opening intent). */
  read(options: { uri: string }): Promise<{ uri: string; name: string; text: string }>
}

export const DrawFiles = registerPlugin<DrawFilesPlugin>('DrawFiles')

/**
 * Save on Android: into `uri` when given (the open document), else where the user picks.
 * The place is asked first and the contents written after, so the picker never holds them.
 */
export async function saveOnAndroid(options: { data: string; base64?: boolean; name: string; mimeType: string; uri?: string }):
  Promise<{ uri: string; name: string } | null> {
  const contents = { data: options.data, ...(options.base64 ? { base64: true } : {}) }
  if (options.uri) {
    try {
      return await DrawFiles.write({ uri: options.uri, ...contents })
    } catch {
      // The permission may be gone (file moved, app reinstalled): ask for a place instead.
    }
  }
  const place = await DrawFiles.create({ name: options.name, mimeType: options.mimeType })
  return 'cancelled' in place ? null : DrawFiles.write({ uri: place.uri, ...contents })
}

/** Running inside the Android (Capacitor) app, not in a browser or Electron. */
export function isAndroidApp(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export interface AndroidHandlers {
  /** Close the open menu, pop-up, tool or panel; false when nothing was open. */
  back(): boolean
  /** The app goes to the background (or may be closed by the system). */
  pause(): void
  /** A .drw3 file was tapped in another app: open it (at start or while running). */
  openFile(uri: string): void
}

/**
 * Android's back button first closes what is open, then sends the app to the background
 * (its state stays, as with the home button). Leaving the app saves the document.
 */
export function bindAndroid(handlers: AndroidHandlers): void {
  if (!isAndroidApp()) return
  void App.addListener('backButton', () => {
    if (!handlers.back()) void App.minimizeApp()
  })
  void App.addListener('pause', () => handlers.pause())
  void App.addListener('appUrlOpen', ({ url }) => handlers.openFile(url))
  // A tap that started the app arrives as its launch address, not as an event.
  void App.getLaunchUrl().then(launch => {
    if (launch?.url) handlers.openFile(launch.url)
  })
}
