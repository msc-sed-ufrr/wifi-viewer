import { describe, expect, it } from 'vitest'
import { detectCsvFormat } from './csvFormat'

describe('detectCsvFormat', () => {
  it('detects the reference format', () => {
    const content =
      'Time Stamp|SSID|BSSID|Strength|Primary Channel|Primary Frequency\n' +
      '2026/07/04-11:50:58|Rede|00:11:22:33:44:55|-60dBm|6|2437MHz'

    expect(detectCsvFormat(content)).toBe('reference')
  })

  it('detects a NetSpot-like format', () => {
    const content =
      'SSID,BSSID,Signal Level,Channel\n' +
      'Rede,00:11:22:33:44:55,-60,6'

    expect(detectCsvFormat(content)).toBe('netspot')
  })

  it('detects an Acrylic-like format', () => {
    const content =
      'Network;MAC Address;RSSI;Channel\n' +
      'Rede;00:11:22:33:44:55;-60;6'

    expect(detectCsvFormat(content)).toBe('acrylic')
  })

  it('falls back to generic for an unknown format', () => {
    const content =
      'Name,Value,Other\n' +
      'Rede,-60,6'

    expect(detectCsvFormat(content)).toBe('generic')
  })

  it('falls back to generic for an empty file', () => {
    expect(detectCsvFormat('')).toBe('generic')
  })
})