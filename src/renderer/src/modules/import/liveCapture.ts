import type { NetworkReading } from '@shared/networkReading'

/** Erro com chave i18n; o caller (componente React) traduz com `t(errorKey)` antes de exibir. */
export class LiveCaptureError extends Error {
  constructor(message: string, public readonly errorKey: string) {
    super(message)
  }
}

export function isLiveCaptureAvailable(): Promise<boolean> {
  if (!window.wifiViewer) return Promise.resolve(false)
  return window.wifiViewer.isScanAvailable()
}

export function captureLive(): Promise<NetworkReading[]> {
  if (!window.wifiViewer) {
    return Promise.reject(
      new LiveCaptureError(
        'Captura ao vivo indisponível: preload não carregado.',
        'error.liveCaptureUnavailable'
      )
    )
  }
  return window.wifiViewer.scanNetworks()
}
