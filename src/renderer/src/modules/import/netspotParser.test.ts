import { describe, expect, it } from 'vitest'
import { CsvImportError } from './csvParser'
import { parseNetSpotCsv } from './netspotParser'

describe('parseNetSpotCsv', () => {
  it('parses a NetSpot CSV with comma delimiter', () => {
    const content = [
      'SSID,BSSID,Signal Level,Channel,Security,Standard,Frequency (MHz)',
      'Rede CIT,00:11:22:33:44:55,-61,6,WPA2,802.11n,2437'
    ].join('\n')

    const readings = parseNetSpotCsv(content)

    expect(readings).toHaveLength(1)
    expect(readings[0]).toMatchObject({
      ssid: 'Rede CIT',
      bssid: '00:11:22:33:44:55',
      signalDbm: -61,
      signalSource: 'measured',
      primaryChannel: 6,
      primaryFrequencyMhz: 2437,
      security: 'WPA2',
      standard: '802.11n'
    })
  })

  it('parses a NetSpot CSV with semicolon delimiter', () => {
    const content = [
      'SSID;BSSID;Signal;Channel',
      'Rede CIT;00-11-22-33-44-55;-72 dBm;11'
    ].join('\n')

    const readings = parseNetSpotCsv(content)

    expect(readings[0]).toMatchObject({
      ssid: 'Rede CIT',
      bssid: '00:11:22:33:44:55',
      signalDbm: -72,
      primaryChannel: 11
    })
  })

  it('supports quoted cells containing delimiters', () => {
    const content = [
      'SSID,BSSID,Signal Level,Channel,Security',
      '"Rede, Visitantes",00:11:22:33:44:55,-67,1,"WPA2, Enterprise"'
    ].join('\n')

    const readings = parseNetSpotCsv(content)

    expect(readings[0]).toMatchObject({
      ssid: 'Rede, Visitantes',
      security: 'WPA2, Enterprise'
    })
  })

  it('uses null for an empty SSID', () => {
    const content = [
      'SSID,BSSID,Signal Level,Channel',
      ',00:11:22:33:44:55,-80,3'
    ].join('\n')

    const readings = parseNetSpotCsv(content)

    expect(readings[0].ssid).toBeNull()
  })

  it('rejects a file with missing required columns', () => {
    const content = [
      'SSID,BSSID,Channel',
      'Rede,00:11:22:33:44:55,6'
    ].join('\n')

    expect(() => parseNetSpotCsv(content)).toThrow(CsvImportError)
  })

  it('rejects an invalid signal value', () => {
    const content = [
      'SSID,BSSID,Signal Level,Channel',
      'Rede,00:11:22:33:44:55,invalid,6'
    ].join('\n')

    expect(() => parseNetSpotCsv(content)).toThrow(CsvImportError)
  })

  it('rejects an empty file', () => {
    expect(() => parseNetSpotCsv('')).toThrow(CsvImportError)
  })
})