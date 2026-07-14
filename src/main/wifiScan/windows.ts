import type { NetworkReading } from '@shared/networkReading'
import { qualityPercentToDbm } from './signal'

/**
 * Parseia a saída de `netsh wlan show networks mode=bssid`.
 * Assume saída em inglês (rótulos "SSID"/"BSSID"/"Signal"/"Channel"/"Authentication"/"Radio type"):
 * o comando é localizado pelo idioma do Windows, então este parser não cobre outras línguas.
 */
export function parseNetshOutput(stdout: string, capturedAt: string): NetworkReading[] {
  const readings: NetworkReading[] = []
  let currentSsid: string | null = null
  let currentSecurity = ''
  let pending: { bssid: string; signalDbm?: number; primaryChannel?: number; standard?: string } | null = null

  const flush = (): void => {
    if (pending && typeof pending.signalDbm === 'number' && typeof pending.primaryChannel === 'number') {
      readings.push({
        ssid: currentSsid,
        bssid: pending.bssid.toLowerCase(),
        signalDbm: pending.signalDbm,
        signalSource: 'estimated',
        primaryChannel: pending.primaryChannel,
        security: currentSecurity,
        standard: pending.standard,
        capturedAt
      })
    }
    pending = null
  }

  for (const line of stdout.split(/\r?\n/)) {
    const ssidMatch = line.match(/^SSID \d+\s*:\s*(.*)$/)
    if (ssidMatch) {
      flush()
      currentSsid = ssidMatch[1].trim() || null
      currentSecurity = ''
      continue
    }

    const authMatch = line.match(/^\s*Authentication\s*:\s*(.*)$/)
    if (authMatch) {
      currentSecurity = authMatch[1].trim()
      continue
    }

    const bssidMatch = line.match(/^\s*BSSID \d+\s*:\s*([0-9a-fA-F:]{17})/)
    if (bssidMatch) {
      flush()
      pending = { bssid: bssidMatch[1] }
      continue
    }

    if (!pending) continue

    const signalMatch = line.match(/^\s*Signal\s*:\s*(\d+)%/)
    if (signalMatch) {
      pending.signalDbm = qualityPercentToDbm(Number(signalMatch[1]))
      continue
    }

    const radioMatch = line.match(/^\s*Radio type\s*:\s*(.*)$/)
    if (radioMatch) {
      pending.standard = radioMatch[1].trim()
      continue
    }

    const channelMatch = line.match(/^\s*Channel\s*:\s*(\d+)/)
    if (channelMatch) {
      pending.primaryChannel = Number(channelMatch[1])
      continue
    }
  }
  flush()

  return readings
}
