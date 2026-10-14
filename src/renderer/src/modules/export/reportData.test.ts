import { describe, expect, it } from 'vitest'
import { buildReportFilename, buildReportRows } from './reportData'
import { wrapReportText } from './reportExporter'
import type { MeasurementPoint, StoredNetworkReading } from '../../types/domain'

const points: MeasurementPoint[] = [{ id: 'a', floorPlanId: 'f', x: 12.4, y: 20.6, createdAt: '' }, { id: 'b', floorPlanId: 'f', x: 100, y: 80, createdAt: '' }]
describe('report data and pagination text', () => {
  it('retains empty points and uses map point numbers', () => {
    const readings = new Map([['b', [{ ssid: 'UFRR', bssid: 'aa', signalDbm: -60, signalSource: 'estimated', primaryChannel: 6, widthMhz: 20 } as StoredNetworkReading]]])
    const rows = buildReportRows(points, readings)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ point: 1, position: '12, 21 px', signal: '-' })
    expect(rows[1]).toMatchObject({ point: 2, ssid: 'UFRR', signal: '-60 dBm *', channel: '6', width: '20 MHz' })
  })
  it('sorts readings within a point without mutating imported data', () => {
    const readings = [{ bssid: 'a', signalDbm: -80 }, { bssid: 'b', signalDbm: -30 }].map((value) => ({ ...value, ssid: null, primaryChannel: 1 } as StoredNetworkReading))
    expect(buildReportRows(points, new Map([['a', readings]]))[0].bssid).toBe('b')
    expect(readings[0].bssid).toBe('a')
  })
  it('uses the required report filename', () => {
    expect(buildReportFilename('Projeto', 'Planta', new Date(2026, 9, 12))).toBe('Projeto-Planta-relatorio-2026-10-12.pdf')
  })
  it('wraps long words, Unicode and explicit paragraphs without losing content', () => {
    const ctx = { measureText: (text: string) => ({ width: Array.from(text).length }) } as CanvasRenderingContext2D
    const text = 'ABCDEFGHIJKL\nRede São João 😀 com espaços'
    const lines = wrapReportText(ctx, text, 8)
    expect(lines.every((line) => Array.from(line).length <= 8)).toBe(true)
    expect(lines.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
  })
})
