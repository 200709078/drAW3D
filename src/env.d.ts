/** Window controls exposed by the Electron preload; absent in the browser. */
interface DesktopWindowControls {
  minimize(): void
  toggleMaximize(): void
  toggleFullscreen(): void
  setFullscreen(enabled: boolean): void
  close(): void
  isMaximized(): Promise<boolean>
  isFullscreen(): Promise<boolean>
  onMaximizeChanged(callback: (maximized: boolean) => void): void
  onFullscreenChanged(callback: (fullscreen: boolean) => void): void
}

/** Native open and save dialogs of the desktop app; writes go only to paths picked in them. */
interface DesktopFiles {
  open(): Promise<{ path: string; name: string; text: string } | null>
  /** Write to `current` when it came from a dialog, otherwise ask; null when cancelled. */
  save(text: string, current: string | null, name: string): Promise<{ path: string; name: string } | null>
  exportFile(data: string | Uint8Array, name: string, kind: 'png' | 'svg'): Promise<string | null>
  savePdf(html: string, name: string): Promise<string | null>
}

interface Window {
  drAW3DDesktop?: {
    windowControls?: DesktopWindowControls
    files?: DesktopFiles
  }
}
