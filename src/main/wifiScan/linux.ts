import type { NetworkReading } from '@shared/networkReading'
import { qualityPercentToDbm } from './signal'

/**
 * nmcli, em modo terse (`-t`), separa campos por ":" e escapa ":" literais como "\:"
 * (relevante porque o próprio BSSID contém ":"). Precisa de um split ciente do escape.
 */
function splitTerseLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === ':') {
      current += ':'
      i++
    } else if (line[i] === ':') {
      fields.push(current)
      current = ''
    } else {
      current += line[i]
    }
  }
  fields.push(current)
  return fields
}

/** Parseia a saída de `nmcli -t -f SSID,BSSID,SIGNAL,CHAN,SECURITY dev wifi list`. */
export function parseNmcliOutput(stdout: string, capturedAt: string): NetworkReading[] {
  const readings: NetworkReading[] = []

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [ssidRaw, bssidRaw, signalRaw, channelRaw, securityRaw] = splitTerseLine(line)
    if (!bssidRaw) continue

    const quality = Number(signalRaw)
    const channel = Number(channelRaw)
    if (!Number.isFinite(quality) || !Number.isFinite(channel)) continue

    readings.push({
      ssid: ssidRaw && ssidRaw !== '--' ? ssidRaw : null,
      bssid: bssidRaw.toLowerCase(),
      signalDbm: qualityPercentToDbm(quality),
      signalSource: 'estimated',
      primaryChannel: channel,
      security: securityRaw && securityRaw !== '--' ? securityRaw : '',
      capturedAt
    })
  }

  return readings
}
