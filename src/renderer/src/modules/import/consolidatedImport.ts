import type { NetworkReading } from '@shared/networkReading'
import { CsvImportError, POINT_LOCATION_HEADER, REFERENCE_HEADER, parseRow } from './csvParser'

const CONSOLIDATED_HEADER = [...REFERENCE_HEADER, ...POINT_LOCATION_HEADER]

export interface LocatedReadingGroup {
  /** Rótulo de exibição da fonte (ex.: "Ponto 1") — só informativo, o agrupamento é por posição. */
  label: string
  x: number
  y: number
  readings: NetworkReading[]
}

/**
 * Inverso de exportReadingsToCsv (csvExporter.ts). Ao contrário de parseWifiScanCsv, que
 * aceita e ignora colunas de localização extras, esta função as exige — sem elas não há
 * como recriar os pontos — e agrupa as leituras por posição (x, y), não pelo rótulo, que
 * é só um índice de exibição e pode colidir entre plantas diferentes.
 */
export function parseConsolidatedCsv(content: string): LocatedReadingGroup[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    throw new CsvImportError('Arquivo vazio.')
  }

  const header = lines[0].split('|').map((cell) => cell.trim())
  const headerMatches =
    header.length === CONSOLIDATED_HEADER.length && CONSOLIDATED_HEADER.every((cell, i) => header[i] === cell)
  if (!headerMatches) {
    throw new CsvImportError(
      `Cabeçalho não tem as colunas de localização do ponto (${POINT_LOCATION_HEADER.join('/')}) — use um CSV exportado por esta ferramenta.\nEsperado: ${CONSOLIDATED_HEADER.join('|')}\nEncontrado: ${lines[0]}`
    )
  }

  const groups = new Map<string, LocatedReadingGroup>()
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1
    const cells = lines[i].split('|')
    if (cells.length !== CONSOLIDATED_HEADER.length) {
      throw new CsvImportError(
        `Linha ${lineNumber}: esperado ${CONSOLIDATED_HEADER.length} colunas, encontrado ${cells.length}.`
      )
    }

    const [label, xRaw, yRaw] = cells.slice(REFERENCE_HEADER.length)
    const x = Number(xRaw)
    const y = Number(yRaw)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new CsvImportError(`Linha ${lineNumber}: posição do ponto inválida (x="${xRaw}", y="${yRaw}").`)
    }

    let reading: NetworkReading
    try {
      reading = parseRow(cells)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new CsvImportError(`Linha ${lineNumber}: ${message}`)
    }

    const key = `${x}:${y}`
    const group = groups.get(key)
    if (group) {
      group.readings.push(reading)
    } else {
      groups.set(key, { label: label.trim() || `${x}, ${y}`, x, y, readings: [reading] })
    }
  }

  return Array.from(groups.values())
}
