import { describe, expect, it } from 'vitest'
import { buildCsvFilename, exportReadingsToCsv, type PointReadings } from './csvExporter'
import { parseWifiScanCsv } from '../import/csvParser'
import type { MeasurementPoint, StoredNetworkReading } from '../../types/domain'

function makePoint(overrides: Partial<MeasurementPoint> = {}): MeasurementPoint {
  return {
    id: crypto.randomUUID(),
    floorPlanId: 'floor-plan-1',
    x: 120,
    y: 80,
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

function makeReading(overrides: Partial<StoredNetworkReading> = {}): StoredNetworkReading {
  return {
    id: crypto.randomUUID(),
    pointId: 'point-1',
    ssid: 'TP-Link_32BB',
    bssid: '50:91:e3:b0:32:bb',
    signalDbm: -89,
    signalSource: 'measured',
    primaryChannel: 11,
    primaryFrequencyMhz: 2462,
    widthMhz: 20,
    distanceMeters: 273,
    security: '[WPA2-PSK-CCMP-128][RSN-PSK-CCMP-128][ESS][WPS]',
    standard: '802.11n',
    capturedAt: new Date(2026, 6, 4, 11, 50, 58).toISOString(),
    ...overrides
  }
}

const HEADER =
  'Time Stamp|SSID|BSSID|Strength|Primary Channel|Primary Frequency|Center Channel|Center Frequency|Width (Range)|Distance|802.11mc|Security|Standard|FastRoaming|Floor Plan|Point Label|Point X|Point Y'

describe('exportReadingsToCsv', () => {
  it('exports a point with 3 readings as a header line plus one row per reading', () => {
    const point = makePoint()
    const readings = [makeReading(), makeReading(), makeReading()]
    const csv = exportReadingsToCsv([{ floorPlanName: 'Piso 1', point, label: 'Ponto 1', readings }])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe(HEADER)
    for (const line of lines.slice(1)) {
      expect(line.split('|')).toHaveLength(18)
    }
  })

  it('uses "|" as the field separator, not a comma', () => {
    const csv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point: makePoint(), label: 'Ponto 1', readings: [makeReading()] }
    ])
    expect(csv).not.toContain(',')
  })

  it('carries each reading\'s floor plan, point label and pixel position in the trailing columns', () => {
    const csv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point: makePoint(), label: 'Ponto 1', readings: [makeReading()] }
    ])
    const cells = csv.split('\n')[1].split('|')
    expect(cells.slice(14)).toEqual(['Piso 1', 'Ponto 1', '120', '80'])
  })

  it('consolidates readings from multiple points (floor-plan export), each row tagged with its own point', () => {
    const pointReadings: PointReadings[] = Array.from({ length: 5 }, (_, i) => ({
      floorPlanName: 'Piso 1',
      point: makePoint({ x: i * 10, y: i * 20 }),
      label: `Ponto ${i + 1}`,
      readings: [makeReading({ pointId: `point-${i}` })]
    }))
    const csv = exportReadingsToCsv(pointReadings)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(6)
    lines.slice(1).forEach((line, i) => {
      const cells = line.split('|')
      expect(cells.slice(14)).toEqual(['Piso 1', `Ponto ${i + 1}`, `${i * 10}`, `${i * 20}`])
    })
    expect(() => parseWifiScanCsv(csv)).not.toThrow()
  })

  it('consolidates readings across multiple floor plans (project export), each row tagged with its own floor plan', () => {
    const pointReadings: PointReadings[] = [
      { floorPlanName: 'Piso 1', point: makePoint({ x: 10, y: 20 }), label: 'Ponto 1', readings: [makeReading()] },
      { floorPlanName: 'Piso 2', point: makePoint({ x: 30, y: 40 }), label: 'Ponto 1', readings: [makeReading()] }
    ]
    const csv = exportReadingsToCsv(pointReadings)
    const lines = csv.split('\n').slice(1)
    expect(lines[0].split('|').slice(14)).toEqual(['Piso 1', 'Ponto 1', '10', '20'])
    expect(lines[1].split('|').slice(14)).toEqual(['Piso 2', 'Ponto 1', '30', '40'])
  })

  it('omits points with no readings from the output (no row, but no error either)', () => {
    const csv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point: makePoint(), label: 'Ponto 1', readings: [] },
      { floorPlanName: 'Piso 1', point: makePoint(), label: 'Ponto 2', readings: [makeReading()] }
    ])
    expect(csv.split('\n')).toHaveLength(2)
  })

  it('round-trips a fully populated reading through parseWifiScanCsv unchanged, ignoring the extra point columns', () => {
    const original = makeReading()
    const csv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point: makePoint(), label: 'Ponto 1', readings: [original] }
    ])
    const [reimported] = parseWifiScanCsv(csv)

    expect(reimported).toEqual({
      ssid: original.ssid,
      bssid: original.bssid,
      signalDbm: original.signalDbm,
      signalSource: 'measured',
      primaryChannel: original.primaryChannel,
      primaryFrequencyMhz: original.primaryFrequencyMhz,
      widthMhz: original.widthMhz,
      distanceMeters: original.distanceMeters,
      security: original.security,
      standard: original.standard,
      capturedAt: original.capturedAt
    })
  })

  it('round-trips a literal "hidden" SSID as-is', () => {
    const csv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point: makePoint(), label: 'Ponto 1', readings: [makeReading({ ssid: 'hidden' })] }
    ])
    const [reimported] = parseWifiScanCsv(csv)
    expect(reimported.ssid).toBe('hidden')
  })

  it('round-trips a null SSID as an empty cell', () => {
    const csv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point: makePoint(), label: 'Ponto 1', readings: [makeReading({ ssid: null })] }
    ])
    const lines = csv.split('\n')
    expect(lines[1].split('|')[1]).toBe('')
    const [reimported] = parseWifiScanCsv(csv)
    expect(reimported.ssid).toBeNull()
  })

  it('exports an empty point list as just the header line', () => {
    const csv = exportReadingsToCsv([])
    expect(csv.split('\n')).toHaveLength(1)
    expect(csv).toBe(HEADER)
  })
})

describe('buildCsvFilename', () => {
  it('joins parts with the export date and a .csv extension', () => {
    const filename = buildCsvFilename('CIT', 'Piso 1', 'Ponto 1')
    const today = new Date()
    const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(filename).toBe(`CIT-Piso-1-Ponto-1-${stamp}.csv`)
  })

  it('sanitizes filesystem-unsafe characters out of each part', () => {
    const filename = buildCsvFilename('Prédio A/B', 'Térreo:1')
    expect(filename).not.toMatch(/[/\\:*?"<>|]/)
  })
})
