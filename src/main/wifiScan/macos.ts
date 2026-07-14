import type { NetworkReading } from '@shared/networkReading'

/**
 * Formato de `macwifi-cli scan --json` (github.com/jaisonerick/macwifi-cli).
 * Entradas de redes "lembradas" mas fora de alcance vêm com bssid vazio e
 * valores zerados — não são leituras reais e são descartadas (ver PRD, regra
 * de negócio "Importação de dados" / conceito equivalente para captura ao vivo).
 */
interface MacwifiCliReading {
  ssid: string
  bssid: string
  rssi: number
  noise: number
  channel: number
  channel_width: number
  security: string
  phy_mode: string
}

export function parseMacwifiCliOutput(stdout: string, capturedAt: string): NetworkReading[] {
  const raw = JSON.parse(stdout) as MacwifiCliReading[]
  return raw
    .filter((reading) => reading.bssid.length > 0)
    .map((reading) => ({
      ssid: reading.ssid || null,
      bssid: reading.bssid.toLowerCase(),
      signalDbm: reading.rssi,
      signalSource: 'measured',
      primaryChannel: reading.channel,
      widthMhz: reading.channel_width || undefined,
      noise: reading.noise,
      security: reading.security,
      standard: reading.phy_mode || undefined,
      capturedAt
    }))
}
