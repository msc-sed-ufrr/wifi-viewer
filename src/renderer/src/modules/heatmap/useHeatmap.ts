import { useEffect, useRef, useState } from 'react'
import type { WeightedPoint } from './idw'
import type { HeatmapWorkerRequest, HeatmapWorkerResponse } from './heatmap.worker'

const DEFAULT_CELL_SIZE = 8
/** Distância característica (px) do blob de cada ponto — ver idw.ts. */
const DEFAULT_SIGMA = 90

export type HeatmapInput = { points: WeightedPoint[] }

function isEmpty(input: HeatmapInput): boolean {
  return input.points.length === 0
}

/** Recalcula o heatmap (via Web Worker) sempre que os pontos/dimensões mudam — ver ADR-002. */
export function useHeatmap(input: HeatmapInput, width: number, height: number): ImageBitmap | null {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('./heatmap.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    return () => worker.terminate()
  }, [])

  useEffect(() => {
    const worker = workerRef.current
    if (!worker || isEmpty(input) || width === 0 || height === 0) {
      setBitmap(null)
      return
    }

    let cancelled = false
    worker.onmessage = (event: MessageEvent<HeatmapWorkerResponse>) => {
      const { cols, rows, rgba } = event.data
      // rgba chega via postMessage (transferable); o buffer é sempre ArrayBuffer, nunca SharedArrayBuffer.
      const imageData = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, cols, rows)
      createImageBitmap(imageData).then((bmp) => {
        if (!cancelled) setBitmap(bmp)
      })
    }

    const request: HeatmapWorkerRequest = {
      ...input,
      width,
      height,
      cellSize: DEFAULT_CELL_SIZE,
      sigma: DEFAULT_SIGMA
    }
    worker.postMessage(request)

    return () => {
      cancelled = true
    }
  }, [input, width, height])

  return bitmap
}
