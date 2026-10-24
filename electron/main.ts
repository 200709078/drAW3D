import { app, BrowserWindow, ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { fileURLToPath } from 'node:url'

const indexPath = fileURLToPath(new URL('../dist/index.html', import.meta.url))
const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url))
const devServerUrl = app.isPackaged ? undefined : process.env.DRAW3D_DEV_SERVER_URL
const iconPath = fileURLToPath(new URL(
  devServerUrl ? '../public/img/app-icon.png' : '../dist/img/app-icon.png',
  import.meta.url,
))

// Without a usable GPU (old driver, blocklist, VM) WebGL falls back to SwiftShader instead
// of failing. The window loads only the bundled app, never remote pages.
app.commandLine.appendSwitch('enable-unsafe-swiftshader')

function openExternal(url: string): void {
  const protocol = new URL(url).protocol
  if (protocol === 'https:' || protocol === 'http:') {
    void shell.openExternal(url).catch(console.error)
  }
}

function senderWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/** The renderer draws its own title bar; these channels back its window buttons. */
function registerWindowControls(): void {
  ipcMain.on('window:minimize', event => senderWindow(event)?.minimize())
  ipcMain.on('window:toggle-maximize', event => {
    const window = senderWindow(event)
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.on('window:toggle-fullscreen', event => {
    const window = senderWindow(event)
    window?.setFullScreen(!window.isFullScreen())
  })
  ipcMain.on('window:set-fullscreen', (event, enabled: unknown) => senderWindow(event)?.setFullScreen(enabled === true))
  ipcMain.on('window:close', event => senderWindow(event)?.close())
  ipcMain.handle('window:is-maximized', event => senderWindow(event)?.isMaximized() ?? false)
  ipcMain.handle('window:is-fullscreen', event => senderWindow(event)?.isFullScreen() ?? false)
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    title: 'drAW3D | mADEMatik',
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#f0f0f0',
    icon: iconPath,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    fullscreenable: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  window.on('maximize', () => window.webContents.send('window:maximize-changed', true))
  window.on('unmaximize', () => window.webContents.send('window:maximize-changed', false))
  window.on('enter-full-screen', () => window.webContents.send('window:fullscreen-changed', true))
  window.on('leave-full-screen', () => window.webContents.send('window:fullscreen-changed', false))
  // F11 is handled here so the renderer does not toggle a second time.
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault()
      window.setFullScreen(!window.isFullScreen())
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault()
      openExternal(url)
    }
  })

  if (devServerUrl) {
    await window.loadURL(devServerUrl)
  } else {
    await window.loadFile(indexPath)
  }
}

void app.whenReady().then(async () => {
  app.setAppUserModelId('com.madematik.draw3d')
  registerWindowControls()
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch(console.error)
    }
  })
}).catch((error: unknown) => {
  console.error(error)
  app.quit()
  process.exitCode = 1
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
