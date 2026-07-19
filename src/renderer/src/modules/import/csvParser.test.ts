import { describe, expect, it } from 'vitest'
import { CsvImportError, parseWifiScanCsv } from './csvParser'

const HEADER =
  'Time Stamp|SSID|BSSID|Strength|Primary Channel|Primary Frequency|Center Channel|Center Frequency|Width (Range)|Distance|802.11mc|Security|Standard|FastRoaming'

const VALID_ROW =
  '2026/07/04-11:50:58|TP-Link_32BB|50:91:E3:B0:32:BB|-89dBm|11|2462MHz|11|2462MHz|20MHz (2452 - 2472)|~273,0m|false|[WPA2-PSK-CCMP-128][RSN-PSK-CCMP-128][ESS][WPS]|802.11n|802.11k 802.11v'

describe('parseWifiScanCsv', () => {
  it('parses a valid reference file into normalized readings', () => {
    const readings = parseWifiScanCsv(`${HEADER}\n${VALID_ROW}`)
    expect(readings).toHaveLength(1)
    expect(readings[0]).toMatchObject({
      ssid: 'TP-Link_32BB',
      bssid: '50:91:e3:b0:32:bb',
      signalDbm: -89,
      signalSource: 'measured',
      primaryChannel: 11,
      primaryFrequencyMhz: 2462,
      widthMhz: 20,
      distanceMeters: 273,
      standard: '802.11n'
    })
    expect(readings[0].capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('keeps a literal "hidden" SSID as-is (network grouping decides how to display it)', () => {
    const hiddenRow = VALID_ROW.replace('TP-Link_32BB', 'hidden')
    const readings = parseWifiScanCsv(`${HEADER}\n${hiddenRow}`)
    expect(readings[0].ssid).toBe('hidden')
  })

  it('rejects a file with a mismatched header', () => {
    expect(() => parseWifiScanCsv('SSID|BSSID\nfoo|bar')).toThrow(CsvImportError)
  })

  it('rejects a row with fewer columns than the reference header', () => {
    expect(() => parseWifiScanCsv(`${HEADER}\ntoo|few|columns`)).toThrow(CsvImportError)
  })

  it('accepts extra trailing columns beyond the reference header, ignoring them (see csvExporter.ts)', () => {
    const enrichedHeader = `${HEADER}|Floor Plan|Point Label|Point X|Point Y`
    const enrichedRow = `${VALID_ROW}|Piso 1|Ponto 1|120|80`
    const readings = parseWifiScanCsv(`${enrichedHeader}\n${enrichedRow}`)
    expect(readings).toHaveLength(1)
    expect(readings[0]).toMatchObject({ ssid: 'TP-Link_32BB', bssid: '50:91:e3:b0:32:bb' })
  })

  it('rejects an empty file', () => {
    expect(() => parseWifiScanCsv('')).toThrow(CsvImportError)
  })
})
