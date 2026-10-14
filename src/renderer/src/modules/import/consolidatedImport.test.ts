import { describe, expect, it } from 'vitest'
import { parseConsolidatedCsv, resolveImportedPosition } from './consolidatedImport'
import { exportReadingsToCsv, type PointReadings } from '../export/csvExporter'
import { CsvImportError, parseWifiScanCsv } from './csvParser'
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
    ssid: 'Exemplo_32BB',
    bssid: '02:00:00:aa:32:bb',
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

function makePointReadings(overrides: Partial<PointReadings> = {}): PointReadings {
  return {
    floorPlanName: 'Piso 1',
    floorPlanWidth: 400,
    floorPlanHeight: 300,
    point: makePoint(),
    label: 'Ponto 1',
    readings: [makeReading()],
    ...overrides
  }
}

describe('parseConsolidatedCsv', () => {
  it('round-trips a multi-point export back into one group per point, at the original position', () => {
    const pointA = makePoint({ x: 10, y: 20 })
    const pointB = makePoint({ x: 300, y: 400 })
    const csv = exportReadingsToCsv([
      makePointReadings({ point: pointA, label: 'Ponto 1', readings: [makeReading(), makeReading()] }),
      makePointReadings({ point: pointB, label: 'Ponto 2', readings: [makeReading({ ssid: 'RedeB' })] })
    ])

    const groups = parseConsolidatedCsv(csv)
    expect(groups).toHaveLength(2)

    const groupA = groups.find((g) => g.label === 'Ponto 1')
    expect(groupA).toMatchObject({ floorPlanName: 'Piso 1', x: 10, y: 20 })
    expect(groupA?.readings).toHaveLength(2)

    const groupB = groups.find((g) => g.label === 'Ponto 2')
    expect(groupB).toMatchObject({ floorPlanName: 'Piso 1', x: 300, y: 400 })
    expect(groupB?.readings).toHaveLength(1)
    expect(groupB?.readings[0].ssid).toBe('RedeB')
  })

  it('groups rows by (floor plan, x, y) position, not by label', () => {
    const point = makePoint({ x: 50, y: 60 })
    const csv = exportReadingsToCsv([
      makePointReadings({ point, label: 'Ponto 1', readings: [makeReading()] }),
      makePointReadings({ point, label: 'Ponto 1', readings: [makeReading({ ssid: 'RedeB' })] })
    ])
    const groups = parseConsolidatedCsv(csv)
    expect(groups).toHaveLength(1)
    expect(groups[0].readings).toHaveLength(2)
  })

  it('keeps points at the same (x, y) in different floor plans as separate groups', () => {
    const point = makePoint({ x: 50, y: 60 })
    const csv = exportReadingsToCsv([
      makePointReadings({ floorPlanName: 'Piso 1', point, label: 'Ponto 1', readings: [makeReading()] }),
      makePointReadings({ floorPlanName: 'Piso 2', point, label: 'Ponto 1', readings: [makeReading({ ssid: 'RedeB' })] })
    ])
    const groups = parseConsolidatedCsv(csv)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.floorPlanName).sort()).toEqual(['Piso 1', 'Piso 2'])
  })

  it('produces readings that are individually valid NetworkReading objects re-parseable the normal way', () => {
    const csv = exportReadingsToCsv([makePointReadings()])
    const [group] = parseConsolidatedCsv(csv)
    const [reimportedViaPlainParser] = parseWifiScanCsv(csv)
    expect(group.readings[0]).toEqual(reimportedViaPlainParser)
  })

  it('rejects a plain reference-format file with no point location columns', () => {
    const plainCsv = exportReadingsToCsv([makePointReadings()])
      .split('\n')
      .map((line) => line.split('|').slice(0, 14).join('|'))
      .join('\n')
    expect(() => parseConsolidatedCsv(plainCsv)).toThrow(CsvImportError)
  })

  it('rejects a row with a non-numeric point position', () => {
    const csv = exportReadingsToCsv([makePointReadings()]).replace('|120|80', '|abc|80')
    expect(() => parseConsolidatedCsv(csv)).toThrow(CsvImportError)
  })

  it('returns an empty array for a header-only file', () => {
    const csv = exportReadingsToCsv([])
    expect(parseConsolidatedCsv(csv)).toEqual([])
  })

  it('extracts the floor plan dimension columns when present', () => {
    const csv = exportReadingsToCsv([makePointReadings({ floorPlanWidth: 800, floorPlanHeight: 600 })])
    const [group] = parseConsolidatedCsv(csv)
    expect(group.floorPlanWidth).toBe(800)
    expect(group.floorPlanHeight).toBe(600)
  })

  it('accepts a legacy CSV without the floor plan dimension columns (pre-ADR-036 export), leaving them undefined', () => {
    const legacyCsv = exportReadingsToCsv([makePointReadings()])
      .split('\n')
      .map((line) => line.split('|').slice(0, 18).join('|'))
      .join('\n')
    const [group] = parseConsolidatedCsv(legacyCsv)
    expect(group.floorPlanWidth).toBeUndefined()
    expect(group.floorPlanHeight).toBeUndefined()
    expect(group.x).toBe(120)
    expect(group.y).toBe(80)
  })

  it('rejects a row with a non-numeric floor plan dimension when dimension columns are present', () => {
    const csv = exportReadingsToCsv([makePointReadings()]).replace('|400|300', '|abc|300')
    expect(() => parseConsolidatedCsv(csv)).toThrow(CsvImportError)
  })
})

describe('resolveImportedPosition', () => {
  it('passes the raw position through when no source dimensions are known and it already fits the target', () => {
    const result = resolveImportedPosition({ x: 100, y: 50, floorPlanWidth: undefined, floorPlanHeight: undefined }, 400, 300)
    expect(result).toEqual({ x: 100, y: 50, adjustment: 'none' })
  })

  it('clamps to the target bounds when no source dimensions are known and the raw position is out of bounds', () => {
    const result = resolveImportedPosition({ x: 900, y: -20, floorPlanWidth: undefined, floorPlanHeight: undefined }, 400, 300)
    expect(result).toEqual({ x: 400, y: 0, adjustment: 'clamped' })
  })

  it('passes the position through unchanged when source dimensions exactly match the target', () => {
    const result = resolveImportedPosition({ x: 100, y: 50, floorPlanWidth: 400, floorPlanHeight: 300 }, 400, 300)
    expect(result).toEqual({ x: 100, y: 50, adjustment: 'none' })
  })

  it('rescales proportionally per axis when source dimensions differ from the target', () => {
    // Dead center of a 1000x500 source lands dead center of a 400x300 target.
    const result = resolveImportedPosition({ x: 500, y: 250, floorPlanWidth: 1000, floorPlanHeight: 500 }, 400, 300)
    expect(result).toEqual({ x: 200, y: 150, adjustment: 'rescaled' })
  })

  it('clamps after rescaling if the source position was already inconsistent with its own declared dimensions', () => {
    // x=150 already exceeds the declared 100px source width (corrupt/hand-edited CSV) — rescale alone
    // can't fix that, so the clamp safety net still has to catch it after the rescale multiplies it up.
    const result = resolveImportedPosition({ x: 150, y: 50, floorPlanWidth: 100, floorPlanHeight: 100 }, 400, 300)
    expect(result).toEqual({ x: 400, y: 150, adjustment: 'rescaled' })
  })

  it('treats zero or negative source dimensions as unknown (no divide-by-zero rescale), falling back to clamp', () => {
    const result = resolveImportedPosition({ x: 900, y: 50, floorPlanWidth: 0, floorPlanHeight: 300 }, 400, 300)
    expect(result).toEqual({ x: 400, y: 50, adjustment: 'clamped' })
  })
})
