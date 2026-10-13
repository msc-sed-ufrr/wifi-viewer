import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildHeatmapFilename, canvasToPng, fitA4, renderHeatmap } from './heatmapExporter'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('heatmap export', () => {
  it('uses local date, cleans filenames and preserves Unicode names', () => {
    const date = new Date(2026, 9, 12, 23, 59)
    expect(buildHeatmapFilename(' Prédio / CIT ', '1º piso: norte', 'png', date)).toBe('Prédio-CIT-1º-piso-norte-2026-10-12.png')
    expect(buildHeatmapFilename('', '...', 'pdf', date)).toBe('wifi-viewer-wifi-viewer-2026-10-12.pdf')
  })

  it.each([[2400, 800], [800, 2400], [800, 800]])('fits %s × %s within A4 margins without cropping or distortion', (width, height) => {
    const layout = fitA4(width, height)
    const pageWidth = layout.orientation === 'landscape' ? 297 : 210
    const pageHeight = layout.orientation === 'landscape' ? 210 : 297
    expect(layout.x).toBeGreaterThanOrEqual(10 - 1e-9)
    expect(layout.y).toBeGreaterThanOrEqual(10 - 1e-9)
    expect(layout.x + layout.width).toBeLessThanOrEqual(pageWidth - 10 + 1e-9)
    expect(layout.y + layout.height).toBeLessThanOrEqual(pageHeight - 10 + 1e-9)
    expect(layout.width / layout.height).toBeCloseTo(width / height)
  })

  it('exports without a heatmap when no readings are selected', async () => {
    const Worker = vi.fn()
    vi.stubGlobal('Worker', Worker)
    expect(await renderHeatmap([], 800, 600)).toBeNull()
    expect(Worker).not.toHaveBeenCalled()
  })

  it('terminates failed and timed-out workers, allowing retry', async () => {
    vi.useFakeTimers()
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onerror: null as (() => void) | null }
    vi.stubGlobal('Worker', vi.fn(function () { return worker }))
    const points = [{ x: 20, y: 20, valueDbm: -50, sigma: 90 }]
    const failure = renderHeatmap(points, 800, 600)
    const assertion = expect(failure).rejects.toThrow('worker failed')
    worker.onerror?.()
    await assertion
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    const timeout = renderHeatmap(points, 800, 600)
    const timeoutAssertion = expect(timeout).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(60_000)
    await timeoutAssertion
    expect(worker.terminate).toHaveBeenCalledTimes(2)
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ points, width: 800, height: 600, cellSize: 8, sigma: 90 }))
  })

  it('rejects a failed PNG encoding instead of downloading an empty file', async () => {
    const canvas = { toBlob: (callback: BlobCallback) => callback(null) } as HTMLCanvasElement
    await expect(canvasToPng(canvas)).rejects.toThrow('PNG encoding failed')
  })
})
