import type { NetworkReading } from '@shared/networkReading'
import { clampToImage } from '../../lib/clampToImage'
import { CsvImportError, FLOOR_PLAN_DIMENSION_HEADER, POINT_LOCATION_HEADER, REFERENCE_HEADER, parseRow } from './csvParser'

const CONSOLIDATED_HEADER_BASE = [...REFERENCE_HEADER, ...POINT_LOCATION_HEADER]
const CONSOLIDATED_HEADER_WITH_DIMS = [...CONSOLIDATED_HEADER_BASE, ...FLOOR_PLAN_DIMENSION_HEADER]

export interface LocatedReadingGroup {
  floorPlanName: string
  /** Rótulo de exibição da fonte (ex.: "Ponto 1") — só informativo, o agrupamento é por planta+posição. */
  label: string
  x: number
  y: number
  /** Dimensões (px) da planta de origem — ausentes em CSVs exportados antes do ADR-036, o que desabilita a reescala proporcional em resolveImportedPosition (só resta o clamp). */
  floorPlanWidth?: number
  floorPlanHeight?: number
  readings: NetworkReading[]
}

/**
 * Inverso de exportReadingsToCsv (csvExporter.ts). Ao contrário de parseWifiScanCsv, que
 * aceita e ignora colunas de localização extras, esta função exige as de posição — sem
 * elas não há como recriar os pontos — mas trata as de dimensão como opcionais: aceita
 * tanto o cabeçalho completo (com FLOOR_PLAN_DIMENSION_HEADER) quanto o formato anterior
 * sem elas, já que exports feitos antes do ADR-036 não têm essa informação. Agrupa por
 * planta+posição (x, y), não pelo rótulo, que é só um índice de exibição e pode colidir
 * entre plantas diferentes. A planta entra na chave porque um export de projeto inteiro
 * (ver App.handleExportProject) consolida várias plantas, cujos pontos podem coincidir em
 * (x, y) por acaso.
 */
export function parseConsolidatedCsv(content: string): LocatedReadingGroup[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    throw new CsvImportError('Arquivo vazio.')
  }

  const header = lines[0].split('|').map((cell) => cell.trim())
  const hasDimensions =
    header.length === CONSOLIDATED_HEADER_WITH_DIMS.length &&
    CONSOLIDATED_HEADER_WITH_DIMS.every((cell, i) => header[i] === cell)
  const hasNoDimensions =
    !hasDimensions &&
    header.length === CONSOLIDATED_HEADER_BASE.length &&
    CONSOLIDATED_HEADER_BASE.every((cell, i) => header[i] === cell)
  if (!hasDimensions && !hasNoDimensions) {
    throw new CsvImportError(
      `Cabeçalho não tem as colunas de localização do ponto (${POINT_LOCATION_HEADER.join('/')}) — use um CSV exportado por esta ferramenta.\nEsperado: ${CONSOLIDATED_HEADER_BASE.join('|')} (opcionalmente seguido de ${FLOOR_PLAN_DIMENSION_HEADER.join('|')})\nEncontrado: ${lines[0]}`
    )
  }
  const expectedColumns = hasDimensions ? CONSOLIDATED_HEADER_WITH_DIMS.length : CONSOLIDATED_HEADER_BASE.length

  const groups = new Map<string, LocatedReadingGroup>()
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1
    const cells = lines[i].split('|')
    if (cells.length !== expectedColumns) {
      throw new CsvImportError(`Linha ${lineNumber}: esperado ${expectedColumns} colunas, encontrado ${cells.length}.`)
    }

    const [floorPlanName, label, xRaw, yRaw, widthRaw, heightRaw] = cells.slice(REFERENCE_HEADER.length)
    const x = Number(xRaw)
    const y = Number(yRaw)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new CsvImportError(`Linha ${lineNumber}: posição do ponto inválida (x="${xRaw}", y="${yRaw}").`)
    }

    let floorPlanWidth: number | undefined
    let floorPlanHeight: number | undefined
    if (hasDimensions) {
      floorPlanWidth = Number(widthRaw)
      floorPlanHeight = Number(heightRaw)
      if (!Number.isFinite(floorPlanWidth) || !Number.isFinite(floorPlanHeight)) {
        throw new CsvImportError(
          `Linha ${lineNumber}: dimensão da planta de origem inválida (width="${widthRaw}", height="${heightRaw}").`
        )
      }
    }

    let reading: NetworkReading
    try {
      reading = parseRow(cells)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new CsvImportError(`Linha ${lineNumber}: ${message}`)
    }

    const key = JSON.stringify([floorPlanName, x, y])
    const group = groups.get(key)
    if (group) {
      group.readings.push(reading)
    } else {
      groups.set(key, {
        floorPlanName: floorPlanName.trim(),
        label: label.trim() || `${x}, ${y}`,
        x,
        y,
        floorPlanWidth,
        floorPlanHeight,
        readings: [reading]
      })
    }
  }

  return Array.from(groups.values())
}

export type PositionAdjustment = 'none' | 'rescaled' | 'clamped'

export interface ResolvedPosition {
  x: number
  y: number
  adjustment: PositionAdjustment
}

/**
 * Resolve onde um grupo importado deve nascer na planta alvo (ver ADR-036). Se o CSV
 * carrega as dimensões da planta de origem (floorPlanWidth/Height, ausentes em exports
 * anteriores ao ADR-036) e elas diferem da planta alvo, reescala x/y proporcionalmente —
 * preserva a posição relativa mesmo numa imagem de tamanho diferente. Sem essa
 * informação (CSV antigo), a posição original é mantida como está. Em ambos os casos, o
 * resultado final sempre passa por clampToImage: se mesmo reescalado (ou por falta de
 * dado pra reescalar) o ponto ficar fora da planta alvo, ele nasce preso à borda — visível
 * ainda que na posição errada, em vez de desaparecer silenciosamente fora do canvas.
 */
export function resolveImportedPosition(
  group: Pick<LocatedReadingGroup, 'x' | 'y' | 'floorPlanWidth' | 'floorPlanHeight'>,
  targetWidth: number,
  targetHeight: number
): ResolvedPosition {
  let { x, y } = group
  let adjustment: PositionAdjustment = 'none'

  const { floorPlanWidth, floorPlanHeight } = group
  if (floorPlanWidth && floorPlanWidth > 0 && floorPlanHeight && floorPlanHeight > 0) {
    if (floorPlanWidth !== targetWidth || floorPlanHeight !== targetHeight) {
      x = x * (targetWidth / floorPlanWidth)
      y = y * (targetHeight / floorPlanHeight)
      adjustment = 'rescaled'
    }
  }

  const clamped = clampToImage(x, y, targetWidth, targetHeight)
  if (clamped.x !== x || clamped.y !== y) {
    adjustment = adjustment === 'rescaled' ? 'rescaled' : 'clamped'
  }

  return { x: clamped.x, y: clamped.y, adjustment }
}
