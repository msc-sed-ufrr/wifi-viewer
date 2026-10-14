import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { isScanAvailable, scanNetworks } from './wifiScan'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('wifiViewer:isScanAvailable', () => isScanAvailable())
ipcMain.handle('wifiViewer:scanNetworks', () => scanNetworks())

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.setIcon(icon)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
