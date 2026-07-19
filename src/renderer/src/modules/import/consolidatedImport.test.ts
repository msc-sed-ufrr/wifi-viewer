import { describe, expect, it } from 'vitest'
import { parseConsolidatedCsv } from './consolidatedImport'
import { exportReadingsToCsv } from '../export/csvExporter'
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

describe('parseConsolidatedCsv', () => {
  it('round-trips a multi-point export back into one group per point, at the original position', () => {
    const pointA = makePoint({ x: 10, y: 20 })
    const pointB = makePoint({ x: 300, y: 400 })
    const csv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point: pointA, label: 'Ponto 1', readings: [makeReading(), makeReading()] },
      { floorPlanName: 'Piso 1', point: pointB, label: 'Ponto 2', readings: [makeReading({ ssid: 'RedeB' })] }
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
      { floorPlanName: 'Piso 1', point, label: 'Ponto 1', readings: [makeReading()] },
      { floorPlanName: 'Piso 1', point, label: 'Ponto 1', readings: [makeReading({ ssid: 'RedeB' })] }
    ])
    const groups = parseConsolidatedCsv(csv)
    expect(groups).toHaveLength(1)
    expect(groups[0].readings).toHaveLength(2)
  })

  it('keeps points at the same (x, y) in different floor plans as separate groups', () => {
    const point = makePoint({ x: 50, y: 60 })
    const csv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point, label: 'Ponto 1', readings: [makeReading()] },
      { floorPlanName: 'Piso 2', point, label: 'Ponto 1', readings: [makeReading({ ssid: 'RedeB' })] }
    ])
    const groups = parseConsolidatedCsv(csv)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.floorPlanName).sort()).toEqual(['Piso 1', 'Piso 2'])
  })

  it('produces readings that are individually valid NetworkReading objects re-parseable the normal way', () => {
    const csv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point: makePoint(), label: 'Ponto 1', readings: [makeReading()] }
    ])
    const [group] = parseConsolidatedCsv(csv)
    const [reimportedViaPlainParser] = parseWifiScanCsv(csv)
    expect(group.readings[0]).toEqual(reimportedViaPlainParser)
  })

  it('rejects a plain reference-format file with no point location columns', () => {
    const plainCsv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point: makePoint(), label: 'Ponto 1', readings: [makeReading()] }
    ])
      .split('\n')
      .map((line) => line.split('|').slice(0, 14).join('|'))
      .join('\n')
    expect(() => parseConsolidatedCsv(plainCsv)).toThrow(CsvImportError)
  })

  it('rejects a row with a non-numeric point position', () => {
    const csv = exportReadingsToCsv([
      { floorPlanName: 'Piso 1', point: makePoint(), label: 'Ponto 1', readings: [makeReading()] }
    ]).replace('|120|80', '|abc|80')
    expect(() => parseConsolidatedCsv(csv)).toThrow(CsvImportError)
  })

  it('returns an empty array for a header-only file', () => {
    const csv = exportReadingsToCsv([])
    expect(parseConsolidatedCsv(csv)).toEqual([])
  })
})
