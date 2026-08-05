import type { NetworkReading } from '@shared/networkReading'
import { CsvImportError } from './csvParser'

export interface GenericCsvColumnMapping {
  ssid?: string
  bssid: string
  signalDbm: string
  primaryChannel: string
  security?: string
  standard?: string
  frequencyMhz?: string
  widthMhz?: string
  capturedAt?: string
}

interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t', '|']

  let selected = ','
  let highestCount = -1

  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1

    if (count > highestCount) {
      selected = candidate
      highestCount = count
    }
  }

  return selected
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = []
  let current = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      const nextCharacter = line[index + 1]

      if (insideQuotes && nextCharacter === '"') {
        current += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }

      continue
    }

    if (character === delimiter && !insideQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  values.push(current.trim())

  return values
}

function parseCsv(content: string): ParsedCsv {
  const normalizedContent = content.replace(/^\uFEFF/, '').trim()

  if (!normalizedContent) {
    throw new CsvImportError('O arquivo CSV está vazio.', 'error.csvEmpty')
  }

  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  if (lines.length < 2) {
    throw new CsvImportError(
      'O arquivo CSV precisa possuir cabeçalho e pelo menos uma linha de dados.',
      'error.csvNoData'
    )
  }

  const delimiter = detectDelimiter(lines[0])
  const headers = splitCsvLine(lines[0], delimiter)

  if (headers.length < 2) {
    throw new CsvImportError(
      'Não foi possível identificar as colunas do arquivo CSV.',
      'error.csvInvalidHeader'
    )
  }

  return {
    headers,
    rows: lines.slice(1).map((line) => splitCsvLine(line, delimiter))
  }
}

function normalizeBssid(value: string): string {
  return value.trim().replace(/-/g, ':').toLowerCase()
}

function parseRequiredNumber(
  value: string,
  fieldName: string,
  rowNumber: number
): number {
  const normalized = value
    .trim()
    .replace(',', '.')
    .match(/-?\d+(?:\.\d+)?/)?.[0]

  const number = normalized === undefined ? Number.NaN : Number(normalized)

  if (!Number.isFinite(number)) {
    throw new CsvImportError(
      `Valor inválido para ${fieldName} na linha ${rowNumber}.`,
      'error.csvInvalidRow'
    )
  }

  return number
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined

  const normalized = value
    .trim()
    .replace(',', '.')
    .match(/-?\d+(?:\.\d+)?/)?.[0]

  if (normalized === undefined) return undefined

  const number = Number(normalized)

  return Number.isFinite(number) ? number : undefined
}

function getColumnIndex(headers: string[], columnName: string | undefined): number {
  if (!columnName) return -1
  return headers.indexOf(columnName)
}

function getCell(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? '').trim() : ''
}

export function getGenericCsvHeaders(content: string): string[] {
  return parseCsv(content).headers
}

export function parseGenericCsv(
  content: string,
  mapping: GenericCsvColumnMapping
): NetworkReading[] {
  const { headers, rows } = parseCsv(content)

  const indexes = {
    ssid: getColumnIndex(headers, mapping.ssid),
    bssid: getColumnIndex(headers, mapping.bssid),
    signalDbm: getColumnIndex(headers, mapping.signalDbm),
    primaryChannel: getColumnIndex(headers, mapping.primaryChannel),
    security: getColumnIndex(headers, mapping.security),
    standard: getColumnIndex(headers, mapping.standard),
    frequencyMhz: getColumnIndex(headers, mapping.frequencyMhz),
    widthMhz: getColumnIndex(headers, mapping.widthMhz),
    capturedAt: getColumnIndex(headers, mapping.capturedAt)
  }

  if (indexes.bssid < 0 || indexes.signalDbm < 0 || indexes.primaryChannel < 0) {
    throw new CsvImportError(
      'O mapeamento precisa incluir BSSID, sinal e canal.',
      'error.csvRequiredMapping'
    )
  }

  return rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 2
    const rawBssid = getCell(row, indexes.bssid)

    if (!rawBssid) {
      throw new CsvImportError(
        `BSSID não informado na linha ${rowNumber}.`,
        'error.csvInvalidRow'
      )
    }

    const rawSsid = getCell(row, indexes.ssid)
    const rawCapturedAt = getCell(row, indexes.capturedAt)

    return {
      ssid: rawSsid || null,
      bssid: normalizeBssid(rawBssid),
      signalDbm: parseRequiredNumber(
        getCell(row, indexes.signalDbm),
        'sinal',
        rowNumber
      ),
      signalSource: 'measured',
      primaryChannel: parseRequiredNumber(
        getCell(row, indexes.primaryChannel),
        'canal',
        rowNumber
      ),
      primaryFrequencyMhz: parseOptionalNumber(
        getCell(row, indexes.frequencyMhz)
      ),
      widthMhz: parseOptionalNumber(getCell(row, indexes.widthMhz)),
      security: getCell(row, indexes.security),
      standard: getCell(row, indexes.standard) || undefined,
      capturedAt: rawCapturedAt || new Date().toISOString()
    }
  })
}