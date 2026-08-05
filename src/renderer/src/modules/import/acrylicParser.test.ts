import { describe, expect, it } from 'vitest'
import { CsvImportError } from './csvParser'
import { parseAcrylicCsv } from './acrylicParser'

describe('parseAcrylicCsv', () => {
  it('parses an Acrylic CSV with semicolon delimiter', () => {
    const content = [
      'Network;MAC Address;RSSI;Channel;Security;Network Type;Frequency;Channel Width',
      'Rede CIT;00-11-22-33-44-55;-58;6;WPA2;802.11n;2437;20'
    ].join('\n')

    const readings = parseAcrylicCsv(content)

    expect(readings).toHaveLength(1)
    expect(readings[0]).toMatchObject({
      ssid: 'Rede CIT',
      bssid: '00:11:22:33:44:55',
      signalDbm: -58,
      signalSource: 'measured',
      primaryChannel: 6,
      primaryFrequencyMhz: 2437,
      widthMhz: 20,
      security: 'WPA2',
      standard: '802.11n'
    })
  })

  it('parses an Acrylic CSV with comma delimiter', () => {
    const content = [
      'SSID,BSSID,Signal,Channel',
      'Rede CIT,00:11:22:33:44:55,-70 dBm,11'
    ].join('\n')

    const readings = parseAcrylicCsv(content)

    expect(readings[0]).toMatchObject({
      ssid: 'Rede CIT',
      bssid: '00:11:22:33:44:55',
      signalDbm: -70,
      primaryChannel: 11
    })
  })

  it('supports quoted cells containing delimiters', () => {
    const content = [
      'Network;MAC Address;RSSI;Channel;Security',
      '"Rede; Visitantes";00:11:22:33:44:55;-65;1;"WPA2; Enterprise"'
    ].join('\n')

    const readings = parseAcrylicCsv(content)

    expect(readings[0]).toMatchObject({
      ssid: 'Rede; Visitantes',
      security: 'WPA2; Enterprise'
    })
  })

  it('uses null for an empty network name', () => {
    const content = [
      'Network;MAC Address;RSSI;Channel',
      ';00:11:22:33:44:55;-81;3'
    ].join('\n')

    const readings = parseAcrylicCsv(content)

    expect(readings[0].ssid).toBeNull()
  })

  it('rejects a file with missing required columns', () => {
    const content = [
      'Network;MAC Address;Channel',
      'Rede;00:11:22:33:44:55;6'
    ].join('\n')

    expect(() => parseAcrylicCsv(content)).toThrow(CsvImportError)
  })

  it('rejects an invalid channel value', () => {
    const content = [
      'Network;MAC Address;RSSI;Channel',
      'Rede;00:11:22:33:44:55;-60;invalid'
    ].join('\n')

    expect(() => parseAcrylicCsv(content)).toThrow(CsvImportError)
  })

  it('rejects an empty file', () => {
    expect(() => parseAcrylicCsv('')).toThrow(CsvImportError)
  })
})