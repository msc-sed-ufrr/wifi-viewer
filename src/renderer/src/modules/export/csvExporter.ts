import type { MeasurementPoint, StoredNetworkReading } from '../../types/domain'
import { POINT_LOCATION_HEADER, REFERENCE_HEADER } from '../import/csvParser'

/**
 * Colunas extras depois das de referência: sem elas, um export com vários pontos
 * (ver App.handleExportFloorPlan) perde a informação de qual ponto/posição gerou
 * cada leitura. parseWifiScanCsv aceita o cabeçalho de referência como prefixo,
 * então essas colunas extras não quebram a reimportação simples — e
 * consolidatedImport.ts as usa pra reconstruir os pontos.
 */
const EXPORT_HEADER = [...REFERENCE_HEADER, ...POINT_LOCATION_HEADER]

export interface PointReadings {
  point: MeasurementPoint
  /** Rótulo de exibição do ponto (ex.: "Ponto 1"), o mesmo usado na UI — não é um id estável. */
  label: string
  readings: StoredNetworkReading[]
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/** Inverso de parseTimestamp (csvParser.ts): usa hora local, já que o parser também interpreta "Time Stamp" como hora local. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())
  const second = pad(date.getSeconds())
  return `${year}/${month}/${day}-${hour}:${minute}:${second}`
}

/**
 * Uma linha por leitura, na ordem de EXPORT_HEADER. "Center Channel", "Center Frequency"
 * e "802.11mc" ficam em branco: não fazem parte de NetworkReading (csvParser.ts também os
 * ignora na importação), mas a posição é mantida para a contagem de colunas de referência bater.
 */
function formatRow(reading: StoredNetworkReading, point: MeasurementPoint, label: string): string {
  const cells = [
    formatTimestamp(reading.capturedAt),
    reading.ssid ?? '',
    reading.bssid,
    `${reading.signalDbm}dBm`,
    `${reading.primaryChannel}`,
    reading.primaryFrequencyMhz !== undefined ? `${reading.primaryFrequencyMhz}MHz` : '',
    '',
    '',
    reading.widthMhz !== undefined ? `${reading.widthMhz}MHz` : '',
    reading.distanceMeters !== undefined ? `${reading.distanceMeters}m` : '',
    '',
    reading.security,
    reading.standard ?? '',
    '',
    label,
    `${point.x}`,
    `${point.y}`
  ]
  return cells.join('|')
}

/**
 * Inverso de parseWifiScanCsv (csvParser.ts), estendido com a localização do ponto —
 * um único formato tanto para o export de um ponto (um item em pointReadings) quanto
 * para o de uma planta inteira (um item por ponto), ver PointPanel e Workspace.
 */
export function exportReadingsToCsv(pointReadings: PointReadings[]): string {
  const lines = [EXPORT_HEADER.join('|')]
  for (const { point, label, readings } of pointReadings) {
    for (const reading of readings) {
      lines.push(formatRow(reading, point, label))
    }
  }
  return lines.join('\n')
}

function sanitizeFilenamePart(value: string): string {
  return value.trim().replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, '-')
}

function todayDateStamp(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** `<parte>-<parte>-...-<data>.csv`, ex.: buildCsvFilename(project.name, floorPlan.name, 'Ponto 1'). */
export function buildCsvFilename(...parts: string[]): string {
  const segments = [...parts.map(sanitizeFilenamePart), todayDateStamp()]
  return `${segments.join('-')}.csv`
}
