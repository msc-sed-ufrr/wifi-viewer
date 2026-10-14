import { computeIdwGrid, type WeightedPoint } from './idw'
import { gridToRgba } from './colorScale'
import { interferenceGridToRgba, type HeatmapMode } from '../channels/interference'

export interface HeatmapWorkerRequest {
  width: number
  height: number
  cellSize: number
  sigma: number
  /** cor derivada do valor dBm (ver colorScale.dbmToColor) — o mesmo no modo "rede única" e "todas as redes" (melhor sinal disponível) */
  points: WeightedPoint[]
  mode?: HeatmapMode
  /** Echoed to reject stale responses when filters/mode change rapidly. */
  requestId?: number
}

export interface HeatmapWorkerResponse {
  cols: number
  rows: number
  rgba: Uint8ClampedArray
  requestId?: number
}

self.onmessage = (event: MessageEvent<HeatmapWorkerRequest>): void => {
  const { width, height, cellSize, sigma, points, mode, requestId } = event.data
  const grid = computeIdwGrid(points, width, height, cellSize, { sigma })
  const rgba = mode === 'interference' ? interferenceGridToRgba(grid) : gridToRgba(grid)

  const response: HeatmapWorkerResponse = { cols: grid.cols, rows: grid.rows, rgba, requestId }
  ;(self as unknown as Worker).postMessage(response, [rgba.buffer])
}
