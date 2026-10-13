import { useEffect, useRef, useState } from 'react'
import type { WeightedPoint } from './idw'
import type { HeatmapWorkerRequest, HeatmapWorkerResponse } from './heatmap.worker'
import { HEATMAP_CELL_SIZE, HEATMAP_SIGMA } from './renderSettings'
import type { HeatmapMode } from '../channels/interference'

export type HeatmapInput = { points: WeightedPoint[]; mode?: HeatmapMode }

function isEmpty(input: HeatmapInput): boolean {
  return input.points.length === 0
}

/** Recalcula o heatmap (via Web Worker) sempre que os pontos/dimensões mudam — ver ADR-002. */
export function useHeatmap(input: HeatmapInput, width: number, height: number): ImageBitmap | null {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => () => bitmap?.close(), [bitmap])

  useEffect(() => {
    const worker = new Worker(new URL('./heatmap.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    return () => worker.terminate()
  }, [])

  useEffect(() => {
    const worker = workerRef.current
    const requestId = ++requestIdRef.current
    setBitmap(null)
    if (!worker || isEmpty(input) || width === 0 || height === 0) {
      setBitmap(null)
      return
    }

    let cancelled = false
    worker.onmessage = (event: MessageEvent<HeatmapWorkerResponse>) => {
      if (event.data.requestId !== requestId || cancelled) return
      const { cols, rows, rgba } = event.data
      // rgba chega via postMessage (transferable); o buffer é sempre ArrayBuffer, nunca SharedArrayBuffer.
      const imageData = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, cols, rows)
      createImageBitmap(imageData).then((bmp) => {
        if (!cancelled && requestIdRef.current === requestId) {
          setBitmap(bmp)
        } else bmp.close()
      })
    }

    const request: HeatmapWorkerRequest = {
      ...input,
      requestId,
      width,
      height,
      cellSize: HEATMAP_CELL_SIZE,
      sigma: HEATMAP_SIGMA
    }
    worker.postMessage(request)

    return () => {
      cancelled = true
    }
  }, [input, width, height])

  return bitmap
}
