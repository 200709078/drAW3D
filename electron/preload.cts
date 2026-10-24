// Sandboxed preloads run as CommonJS and may only load Electron's renderer modules.
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

contextBridge.exposeInMainWorld('drAW3DDesktop', {
  windowControls: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
    toggleFullscreen: (): void => ipcRenderer.send('window:toggle-fullscreen'),
    setFullscreen: (enabled: boolean): void => ipcRenderer.send('window:set-fullscreen', enabled === true),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:is-fullscreen'),
    onMaximizeChanged: (callback: (maximized: boolean) => void): void => {
      ipcRenderer.on('window:maximize-changed', (_event, maximized: boolean) => callback(maximized === true))
    },
    onFullscreenChanged: (callback: (fullscreen: boolean) => void): void => {
      ipcRenderer.on('window:fullscreen-changed', (_event, fullscreen: boolean) => callback(fullscreen === true))
    },
  },
  files: {
    open: (): Promise<{ path: string; name: string; text: string } | null> => ipcRenderer.invoke('file:open'),
    save: (text: string, current: string | null, name: string): Promise<{ path: string; name: string } | null> =>
      ipcRenderer.invoke('file:save', text, current, name),
    exportFile: (data: string | Uint8Array, name: string, kind: 'png' | 'svg'): Promise<string | null> =>
      ipcRenderer.invoke('file:export', data, name, kind),
    savePdf: (html: string, name: string): Promise<string | null> => ipcRenderer.invoke('file:save-pdf', html, name),
  },
})
