/** Package version, injected by Vite at build time. */
declare const __APP_VERSION__: string

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

interface Window {
  drAW3DDesktop?: {
    windowControls?: DesktopWindowControls
  }
}
