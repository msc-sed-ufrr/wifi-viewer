import type { NetworkReading } from '@shared/networkReading'

/**
 * Formato de referência (ver PRD, regra de negócio "Importação de dados").
 * Contagem/ordem de colunas fora disso é rejeitada com erro explícito —
 * sem parsing heurístico.
 */
export const REFERENCE_HEADER = [
  'Time Stamp',
  'SSID',
  'BSSID',
  'Strength',
  'Primary Channel',
  'Primary Frequency',
  'Center Channel',
  'Center Frequency',
  'Width (Range)',
  'Distance',
  '802.11mc',
  'Security',
  'Standard',
  'FastRoaming'
]

/** Colunas extras que exportReadingsToCsv anexa depois de REFERENCE_HEADER (ver csvExporter.ts e consolidatedImport.ts). */
export const POINT_LOCATION_HEADER = ['Floor Plan', 'Point Label', 'Point X', 'Point Y']

/**
 * Colunas finais, sempre emitidas no export mas opcionais na importação consolidada —
 * arquivos exportados antes desta coluna existir continuam importáveis, só sem a
 * reescala proporcional que ela habilita (ver consolidatedImport.ts, ADR-036).
 */
export const FLOOR_PLAN_DIMENSION_HEADER = ['Floor Plan Width', 'Floor Plan Height']

/**
 * Erro carregando uma chave i18n (`errorKey`) + parâmetros pra interpolação.
 * O caller (componente React) traduz com `t(errorKey, params)` antes de exibir;
 * `lib/` permanece agnóstico ao i18next.
 */
export class CsvImportError extends Error {
  constructor(
    message: string,
    public readonly errorKey: string,
    public readonly params?: Record<string, string | number>
  ) {
    super(message)
  }
}

function parseTimestamp(raw: string): string {
  const match = raw.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})-(\d{2}):(\d{2}):(\d{2})$/)
  if (!match) {
    throw new CsvImportError(
      `Timestamp em formato inesperado: "${raw}"`,
      'error.csvTimestampFormat',
      { value: raw }
    )
  }
  const [, year, month, day, hour, minute, second] = match
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  )
  return date.toISOString()
}

function parseStrengthDbm(raw: string): number {
  const value = Number(raw.trim().replace(/dBm$/i, ''))
  if (!Number.isFinite(value)) {
    throw new CsvImportError(
      `Força de sinal inválida: "${raw}"`,
      'error.csvStrengthInvalid',
      { value: raw }
    )
  }
  return value
}

function parseChannel(raw: string): number {
  const value = Number(raw.trim())
  if (!Number.isFinite(value)) {
    throw new CsvImportError(`Canal inválido: "${raw}"`, 'error.csvChannelInvalid', { value: raw })
  }
  return value
}

function parseFrequencyMhz(raw: string): number | undefined {
  const value = Number(raw.trim().replace(/MHz$/i, ''))
  return Number.isFinite(value) ? value : undefined
}

function parseWidthMhz(raw: string): number | undefined {
  const match = raw.trim().match(/^(\d+)\s*MHz/i)
  return match ? Number(match[1]) : undefined
}

/** Campo auxiliar/informativo (ver PRD) — se não for parseável, fica undefined sem invalidar a linha. */
function parseDistanceMeters(raw: string): number | undefined {
  const cleaned = raw.trim().replace(/^~/, '').replace(',', '.').replace(/m$/i, '')
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : undefined
}

/** Só usa as 13 primeiras posições — colunas extras (ver POINT_LOCATION_HEADER) ficam disponíveis pra quem chamar, mas são ignoradas aqui. */
export function parseRow(cells: string[]): NetworkReading {
  const [
    timeStamp,
    ssidRaw,
    bssidRaw,
    strength,
    primaryChannel,
    primaryFrequency,
    ,
    ,
    width,
    distance,
    ,
    security,
    standard
  ] = cells

  return {
    ssid: ssidRaw.trim() || null,
    bssid: bssidRaw.trim().toLowerCase(),
    signalDbm: parseStrengthDbm(strength),
    signalSource: 'measured',
    primaryChannel: parseChannel(primaryChannel),
    primaryFrequencyMhz: parseFrequencyMhz(primaryFrequency),
    widthMhz: parseWidthMhz(width),
    distanceMeters: parseDistanceMeters(distance),
    security: security.trim(),
    standard: standard.trim() || undefined,
    capturedAt: parseTimestamp(timeStamp)
  }
}

export function parseWifiScanCsv(content: string): NetworkReading[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    throw new CsvImportError('Arquivo vazio.', 'error.csvEmpty')
  }

  const header = lines[0].split('|').map((cell) => cell.trim())
  /** Prefixo, não igualdade exata: exports enriquecidos (ver csvExporter.ts) anexam colunas extras depois das de referência. */
  const headerMatches =
    header.length >= REFERENCE_HEADER.length &&
    REFERENCE_HEADER.every((cell, i) => header[i] === cell)
  if (!headerMatches) {
    throw new CsvImportError(
      `Cabeçalho não corresponde ao formato de referência.\nEsperado: ${REFERENCE_HEADER.join('|')}\nEncontrado: ${lines[0]}`,
      'error.csvHeaderMismatch',
      { expected: REFERENCE_HEADER.join('|'), found: lines[0] }
    )
  }

  const readings: NetworkReading[] = []
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1
    const cells = lines[i].split('|')
    if (cells.length < REFERENCE_HEADER.length) {
      throw new CsvImportError(
        `Linha ${lineNumber}: esperado ao menos ${REFERENCE_HEADER.length} colunas, encontrado ${cells.length}.`,
        'error.csvRowColumns',
        { line: lineNumber, expected: REFERENCE_HEADER.length, found: cells.length }
      )
    }
    try {
      readings.push(parseRow(cells))
    } catch (error) {
      if (error instanceof CsvImportError) {
        throw new CsvImportError(
          `Linha ${lineNumber}: ${error.message}`,
          'error.csvRowError',
          { line: lineNumber, reason: error.message }
        )
      }
      throw error
    }
  }

  return readings
}
