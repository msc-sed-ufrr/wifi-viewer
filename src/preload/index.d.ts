import type { WifiViewerApi } from './index'

declare global {
  interface Window {
    wifiViewer: WifiViewerApi
  }
}
