import type { MeasurementPoint, StoredNetworkReading } from '../../types/domain'
import { buildHeatmapFilename } from './heatmapExporter'

export interface ReportRow {
  point: number
  position: string
  ssid: string
  bssid: string
  signal: string
  channel: string
  width: string
}

/** Keep point numbering identical to the map; retain points with no readings. */
export function buildReportRows(points: MeasurementPoint[], readings: Map<string, StoredNetworkReading[]>): ReportRow[] {
  return points.flatMap((point, index) => {
    const base = { point: index + 1, position: `${Math.round(point.x)}, ${Math.round(point.y)} px` }
    const rows = readings.get(point.id) ?? []
    if (rows.length === 0) return [{ ...base, ssid: '-', bssid: '-', signal: '-', channel: '-', width: '-' }]
    return [...rows].sort((a, b) => b.signalDbm - a.signalDbm || a.bssid.localeCompare(b.bssid)).map((reading) => ({
      ...base, ssid: reading.ssid || '(hidden)', bssid: reading.bssid,
      signal: `${reading.signalDbm} dBm${reading.signalSource === 'estimated' ? ' *' : ''}`,
      channel: String(reading.primaryChannel), width: reading.widthMhz === undefined ? '-' : `${reading.widthMhz} MHz`
    }))
  })
}

export function buildReportFilename(project: string, plan: string, date = new Date()): string {
  return buildHeatmapFilename(project, `${plan}-relatorio`, 'pdf', date)
}
