/**
 * Formato normalizado de uma leitura de rede, comum à importação de CSV
 * (docs/examples/import_wifi_analyzer.csv) e à captura ao vivo via IPC
 * (ver docs/02-arch.md, seção 3.1).
 */
export interface NetworkReading {
  /** null para redes com SSID "hidden"/oculto */
  ssid: string | null
  /** endereço MAC normalizado, minúsculo, separado por ":" */
  bssid: string
  /** força de sinal em dBm (inteiro negativo) */
  signalDbm: number
  /**
   * "measured": dBm real reportado pela fonte (CSV de referência, macOS airport -s).
   * "estimated": convertido a partir de qualidade percentual (Windows netsh, Linux nmcli).
   */
  signalSource: 'measured' | 'estimated'
  primaryChannel: number
  primaryFrequencyMhz?: number
  widthMhz?: number
  /** Piso de ruído em dBm — só disponível via macwifi-cli (macOS); Windows/Linux/CSV não reportam. */
  noise?: number
  /** string bruta reportada pela fonte, ex.: "[WPA2-PSK-CCMP-128][RSN-PSK-CCMP-128][ESS]" */
  security: string
  /** ex.: "802.11n", "802.11ac" */
  standard?: string
  /**
   * Estimativa de distância até o AP (metros), quando disponível na fonte.
   * Auxiliar/informativa apenas — nunca usada para posicionar o ponto ou o AP (ver PRD, regra de negócio "Pontos de medição").
   */
  distanceMeters?: number
  /** ISO 8601 UTC */
  capturedAt: string
}

export interface WifiScanResult {
  platform: NodeJS.Platform
  capturedAt: string
  readings: NetworkReading[]
}
