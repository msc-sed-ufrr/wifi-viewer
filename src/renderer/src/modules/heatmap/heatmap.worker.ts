import { computeIdwGrid, type WeightedPoint } from './idw'
import { gridToRgba } from './colorScale'

export interface HeatmapWorkerRequest {
  width: number
  height: number
  cellSize: number
  sigma: number
  /** cor derivada do valor dBm (ver colorScale.dbmToColor) — o mesmo no modo "rede única" e "todas as redes" (melhor sinal disponível) */
  points: WeightedPoint[]
}

export interface HeatmapWorkerResponse {
  cols: number
  rows: number
  rgba: Uint8ClampedArray
}

self.onmessage = (event: MessageEvent<HeatmapWorkerRequest>): void => {
  const { width, height, cellSize, sigma, points } = event.data
  const grid = computeIdwGrid(points, width, height, cellSize, { sigma })
  const rgba = gridToRgba(grid)

  const response: HeatmapWorkerResponse = { cols: grid.cols, rows: grid.rows, rgba }
  ;(self as unknown as Worker).postMessage(response, [rgba.buffer])
}
