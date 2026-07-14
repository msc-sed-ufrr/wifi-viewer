import { contextBridge, ipcRenderer } from 'electron'
import type { NetworkReading } from '@shared/networkReading'

/**
 * Única superfície exposta ao renderer (ver docs/02-arch.md, ADR-008).
 * Nunca expor ipcRenderer, require ou child_process diretamente.
 */
const wifiViewerApi = {
  isScanAvailable: (): Promise<boolean> => ipcRenderer.invoke('wifiViewer:isScanAvailable'),
  scanNetworks: (): Promise<NetworkReading[]> => ipcRenderer.invoke('wifiViewer:scanNetworks')
}

contextBridge.exposeInMainWorld('wifiViewer', wifiViewerApi)

export type WifiViewerApi = typeof wifiViewerApi
