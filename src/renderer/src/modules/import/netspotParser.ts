import type { NetworkReading } from '@shared/networkReading'
import { CsvImportError } from './csvParser'

function detectDelimiter(headerLine: string): ',' | ';' {
  return headerLine.includes(';') ? ';' : ','
}

function splitCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const cells: string[] = []
  let currentCell = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index++) {
    const character = line[index]

    if (character === '"') {
      const nextCharacter = line[index + 1]

      if (insideQuotes && nextCharacter === '"') {
        currentCell += '"'
        index++
      } else {
        insideQuotes = !insideQuotes
      }

      continue
    }

    if (character === delimiter && !insideQuotes) {
      cells.push(currentCell.trim())
      currentCell = ''
      continue
    }

    currentCell += character
  }

  cells.push(currentCell.trim())

  return cells
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeBssid(value: string): string {
  return value.trim().replace(/-/g, ':').toLowerCase()
}

function parseSignalDbm(value: string): number {
  const signal = Number(value.trim().replace(/dBm$/i, ''))

  if (!Number.isFinite(signal)) {
    throw new CsvImportError(
      `Força de sinal inválida: "${value}"`,
      'error.csvStrengthInvalid',
      { value }
    )
  }

  return signal
}

function parseChannel(value: string): number {
  const channel = Number(value.trim())

  if (!Number.isFinite(channel)) {
    throw new CsvImportError(
      `Canal inválido: "${value}"`,
      'error.csvChannelInvalid',
      { value }
    )
  }

  return channel
}

function findColumnIndex(headers: string[], acceptedNames: string[]): number {
  return headers.findIndex((header) => acceptedNames.includes(header))
}

export function parseNetSpotCsv(content: string): NetworkReading[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    throw new CsvImportError('Arquivo vazio.', 'error.csvEmpty')
  }

  const delimiter = detectDelimiter(lines[0])
  const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader)

  const ssidIndex = findColumnIndex(headers, ['ssid', 'network name'])
  const bssidIndex = findColumnIndex(headers, ['bssid', 'mac address'])
  const signalIndex = findColumnIndex(headers, ['signal', 'signal level', 'signal level (dbm)'])
  const channelIndex = findColumnIndex(headers, ['channel', 'primary channel'])
  const securityIndex = findColumnIndex(headers, ['security', 'encryption'])
  const standardIndex = findColumnIndex(headers, ['standard', 'mode'])
  const frequencyIndex = findColumnIndex(headers, ['frequency', 'frequency (mhz)'])

  const requiredColumns = [
    { name: 'SSID', index: ssidIndex },
    { name: 'BSSID', index: bssidIndex },
    { name: 'Signal Level', index: signalIndex },
    { name: 'Channel', index: channelIndex }
  ]

  const missingColumns = requiredColumns
    .filter((column) => column.index < 0)
    .map((column) => column.name)

  if (missingColumns.length > 0) {
    throw new CsvImportError(
      `Colunas obrigatórias ausentes no arquivo NetSpot: ${missingColumns.join(', ')}.`,
      'error.csvMissingColumns',
      { columns: missingColumns.join(', ') }
    )
  }

  const readings: NetworkReading[] = []
  const capturedAt = new Date().toISOString()

  for (let index = 1; index < lines.length; index++) {
    const lineNumber = index + 1
    const cells = splitCsvLine(lines[index], delimiter)

    try {
      const ssidRaw = cells[ssidIndex] ?? ''
      const bssidRaw = cells[bssidIndex] ?? ''
      const signalRaw = cells[signalIndex] ?? ''
      const channelRaw = cells[channelIndex] ?? ''

      readings.push({
        ssid: ssidRaw.trim() || null,
        bssid: normalizeBssid(bssidRaw),
        signalDbm: parseSignalDbm(signalRaw),
        signalSource: 'measured',
        primaryChannel: parseChannel(channelRaw),
        primaryFrequencyMhz:
          frequencyIndex >= 0 && Number.isFinite(Number(cells[frequencyIndex]))
            ? Number(cells[frequencyIndex])
            : undefined,
        security: securityIndex >= 0 ? (cells[securityIndex] ?? '').trim() : '',
        standard:
          standardIndex >= 0
            ? (cells[standardIndex] ?? '').trim() || undefined
            : undefined,
        capturedAt
      })
    } catch (error) {
      if (error instanceof CsvImportError) {
        throw new CsvImportError(
          `Linha ${lineNumber}: ${error.message}`,
          'error.csvRowError',
          {
            line: lineNumber,
            reason: error.message
          }
        )
      }

      throw error
    }
  }

  return readings
}