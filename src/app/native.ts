import { App } from '@capacitor/app'
import { Capacitor, registerPlugin } from '@capacitor/core'

/** The Android app's file and print plugin (android/…/DrawFilesPlugin.java). */
interface DrawFilesPlugin {
  open(): Promise<{ uri: string; name: string; text: string } | { cancelled: true }>
  save(options: { data: string; base64?: boolean; name: string; mimeType: string; uri?: string }):
    Promise<{ uri: string; name: string } | { cancelled: true }>
  print(options: { html: string; name: string }): Promise<void>
}

export const DrawFiles = registerPlugin<DrawFilesPlugin>('DrawFiles')

/** Running inside the Android (Capacitor) app, not in a browser or Electron. */
export function isAndroidApp(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export interface AndroidHandlers {
  /** Close the open menu, pop-up, tool or panel; false when nothing was open. */
  back(): boolean
  /** The app goes to the background (or may be closed by the system). */
  pause(): void
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
}
