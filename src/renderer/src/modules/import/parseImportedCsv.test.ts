import { describe, expect, it } from 'vitest'
import { CsvImportError } from './csvParser'
import { parseImportedCsv } from './parseImportedCsv'

describe('parseImportedCsv', () => {
  it('parses the reference format', () => {
    const content = [
      'Time Stamp|SSID|BSSID|Strength|Primary Channel|Primary Frequency|Center Channel|Center Frequency|Width (Range)|Distance|802.11mc|Security|Standard|FastRoaming',
      '2026/07/04-11:50:58|Rede|00:11:22:33:44:55|-60dBm|6|2437MHz|6|2437MHz|20MHz|~10m|false|WPA2|802.11n|'
    ].join('\n')

    const readings = parseImportedCsv(content)

    expect(readings).toHaveLength(1)
    expect(readings[0]).toMatchObject({
      ssid: 'Rede',
      bssid: '00:11:22:33:44:55',
      signalDbm: -60,
      primaryChannel: 6
    })
  })

  it('parses the NetSpot format', () => {
    const content = [
      'SSID,BSSID,Signal Level,Channel',
      'Rede,00:11:22:33:44:55,-61,6'
    ].join('\n')

    const readings = parseImportedCsv(content)

    expect(readings[0]).toMatchObject({
      ssid: 'Rede',
      signalDbm: -61,
      primaryChannel: 6
    })
  })

  it('parses the Acrylic format', () => {
    const content = [
      'Network;MAC Address;RSSI;Channel',
      'Rede;00:11:22:33:44:55;-62;11'
    ].join('\n')

    const readings = parseImportedCsv(content)

    expect(readings[0]).toMatchObject({
      ssid: 'Rede',
      signalDbm: -62,
      primaryChannel: 11
    })
  })

  it('rejects an unsupported generic format', () => {
    const content = [
      'Name,Value,Other',
      'Rede,-60,6'
    ].join('\n')

    expect(() => parseImportedCsv(content)).toThrow(CsvImportError)
  })
})