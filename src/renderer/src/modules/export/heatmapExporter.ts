import type { FloorPlan, MeasurementPoint, StoredNetworkReading, Wall, WallShape, WallVertex } from '../../types/domain'
import type { HeatmapWorkerRequest, HeatmapWorkerResponse } from '../heatmap/heatmap.worker'
import type { WeightedPoint } from '../heatmap/idw'
import { COLOR_STOP_DBMS, dbmToColor } from '../heatmap/colorScale'
import { arcPathD } from '../walls/shapes'
import { HEATMAP_CELL_SIZE, HEATMAP_SIGMA } from '../heatmap/renderSettings'
import { INTERFERENCE_COLORS, type HeatmapMode } from '../channels/interference'

export type ExportFormat = 'png' | 'pdf'

export interface HeatmapExportInput {
  floorPlan: FloorPlan
  projectName: string
  filterLabel: string
  points: MeasurementPoint[]
  readings: Map<string, StoredNetworkReading>
  heatmapPoints: WeightedPoint[]
  showImage: boolean
  showPoints: boolean
  showWalls: boolean
  vertices: WallVertex[]
  walls: Wall[]
  shapes: WallShape[]
  mode?: HeatmapMode
  interferenceByPoint?: Map<string, number>
  interferenceLabels?: string[]
  interferencePointLabels?: Map<string, string>
}

export function buildHeatmapFilename(project: string, plan: string, format: ExportFormat, date = new Date()): string {
  const clean = (value: string): string => value.trim().replace(/[\u0000-\u001f/\\:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/[. -]+$/g, '') || 'wifi-viewer'
  const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
  return `${clean(project)}-${clean(plan)}-${stamp}.${format}`
}

/** Fit the complete image inside A4 margins, preserving its aspect ratio. */
export function fitA4(width: number, height: number): { orientation: 'landscape' | 'portrait'; x: number; y: number; width: number; height: number } {
  const landscape = width > height
  const pageWidth = landscape ? 297 : 210
  const pageHeight = landscape ? 210 : 297
  const scale = Math.min((pageWidth - 20) / width, (pageHeight - 20) / height)
  return { orientation: landscape ? 'landscape' : 'portrait', x: (pageWidth - width * scale) / 2, y: (pageHeight - height * scale) / 2, width: width * scale, height: height * scale }
}

/** A dedicated worker renders the requested snapshot, so a pending UI calculation cannot export stale filters. */
export function renderHeatmap(points: WeightedPoint[], width: number, height: number, mode: HeatmapMode = 'coverage'): Promise<ImageBitmap | null> {
  if (points.length === 0) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../heatmap/heatmap.worker.ts', import.meta.url), { type: 'module' })
    const finish = (): void => { clearTimeout(timeout); worker.terminate() }
    const timeout = setTimeout(() => { finish(); reject(new Error('Heatmap export timed out')) }, 60_000)
    worker.onerror = () => { finish(); reject(new Error('Heatmap worker failed')) }
    worker.onmessage = (event: MessageEvent<HeatmapWorkerResponse>) => {
      finish()
      const { rgba, cols, rows } = event.data
      try {
        const data = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, cols, rows)
        createImageBitmap(data).then(resolve, reject)
      } catch (error) { reject(error) }
    }
    const request: HeatmapWorkerRequest = { points, width, height, cellSize: HEATMAP_CELL_SIZE, sigma: HEATMAP_SIGMA, mode }
    try { worker.postMessage(request) } catch (error) { finish(); reject(error) }
  })
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Floor plan image failed to load')) }
    image.src = url
  })
}

export async function createHeatmapExportCanvas(input: HeatmapExportInput, date = new Date()): Promise<HTMLCanvasElement> {
  const { floorPlan } = input
  const image = input.showImage ? await loadImage(floorPlan.image) : null
  const bitmap = await renderHeatmap(input.heatmapPoints, floorPlan.imageWidth, floorPlan.imageHeight, input.mode)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(480, floorPlan.imageWidth)
    const unit = canvas.width / 900
    const header = Math.ceil(88 * unit)
    const footer = bitmap ? Math.ceil(84 * unit) : 0
    canvas.height = header + floorPlan.imageHeight + footer
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#111827'
    ctx.font = `bold ${22 * unit}px sans-serif`
    ctx.fillText(input.projectName, 20 * unit, 28 * unit, canvas.width - 40 * unit)
    ctx.font = `${18 * unit}px sans-serif`
    ctx.fillText(floorPlan.name, 20 * unit, 53 * unit, canvas.width - 40 * unit)
    ctx.font = `${14 * unit}px sans-serif`
    ctx.fillText(`${input.filterLabel} · ${date.toLocaleDateString()}`, 20 * unit, 76 * unit, canvas.width - 40 * unit)
    ctx.save()
    ctx.translate((canvas.width - floorPlan.imageWidth) / 2, header)
    ctx.beginPath()
    ctx.rect(0, 0, floorPlan.imageWidth, floorPlan.imageHeight)
    ctx.clip()
    if (image) ctx.drawImage(image, 0, 0, floorPlan.imageWidth, floorPlan.imageHeight)
    if (bitmap) ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, floorPlan.imageWidth, floorPlan.imageHeight)
    if (input.showPoints) input.points.forEach((point, index) => {
      ctx.beginPath()
      ctx.arc(point.x, point.y, 10, 0, Math.PI * 2)
      ctx.fillStyle = '#111827'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(index + 1), point.x, point.y)
      const reading = input.readings.get(point.id)
      const count = input.interferenceByPoint?.get(point.id)
      const label = input.mode === 'interference'
        ? (count === undefined ? null : input.interferencePointLabels?.get(point.id) ?? `${count} ${count === 1 ? 'radio' : 'radios'}`)
        : (reading ? `(${reading.signalDbm})` : null)
      if (label) {
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'left'
        ctx.lineWidth = 3
        ctx.strokeText(label, point.x + 14, point.y)
        ctx.fillStyle = '#111827'
        ctx.fillText(label, point.x + 14, point.y)
      }
    })
    if (input.showWalls) {
      const vertices = new Map(input.vertices.map((vertex) => [vertex.id, vertex]))
      ctx.strokeStyle = '#1f2937'
      ctx.lineCap = 'round'
      for (const wall of input.walls) {
        const start = vertices.get(wall.startVertexId)
        const end = vertices.get(wall.endVertexId)
        if (!start || !end) continue
        ctx.lineWidth = wall.strokeWidth ?? 3
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
      }
      ctx.lineWidth = 3
      for (const shape of input.shapes) {
        if (shape.kind === 'circle') {
          ctx.beginPath()
          ctx.arc(shape.center.x, shape.center.y, Math.hypot(shape.edge.x - shape.center.x, shape.edge.y - shape.center.y), 0, Math.PI * 2)
          ctx.stroke()
        } else {
          const path = arcPathD(shape.p1, shape.p2, shape.pMid)
          if (path) ctx.stroke(new Path2D(path))
        }
      }
    }
    ctx.restore()
    if (bitmap) {
      const stops = [...COLOR_STOP_DBMS].reverse()
      const left = 100 * unit
      const right = canvas.width - left
      const y = header + floorPlan.imageHeight + 24 * unit
      if (input.mode === 'interference') {
        ctx.font = `${14 * unit}px sans-serif`
        ctx.textAlign = 'center'
        INTERFERENCE_COLORS.forEach((color, index) => {
          const x = left + index * (right - left) / 3
          ctx.fillStyle = color
          ctx.fillRect(x, y, (right - left) / 3, 18 * unit)
          ctx.fillStyle = '#111827'
          ctx.fillText(input.interferenceLabels?.[index] ?? ['1-2 radios', '3-4 radios', '5+ radios'][index], x + (right - left) / 6, y + 42 * unit)
        })
      } else {
      const gradient = ctx.createLinearGradient(left, 0, right, 0)
      stops.forEach((dbm, index) => gradient.addColorStop(index / (stops.length - 1), `rgb(${dbmToColor(dbm).join(',')})`))
      ctx.fillStyle = gradient
      ctx.fillRect(left, y, right - left, 18 * unit)
      ctx.fillStyle = '#111827'
      ctx.font = `${14 * unit}px sans-serif`
      ctx.textAlign = 'center'
      stops.forEach((dbm, index) => ctx.fillText(`${dbm} dBm`, left + index / (stops.length - 1) * (right - left), y + 42 * unit))
      }
    }
    return canvas
  } finally { bitmap?.close() }
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'))
}

export async function encodeHeatmapExport(canvas: HTMLCanvasElement, format: ExportFormat): Promise<Blob> {
  if (format === 'png') return canvasToPng(canvas)
  const { jsPDF } = await import('jspdf')
  const layout = fitA4(canvas.width, canvas.height)
  const pdf = new jsPDF({ orientation: layout.orientation, unit: 'mm', format: 'a4' })
  pdf.addImage(canvas, 'PNG', layout.x, layout.y, layout.width, layout.height)
  return pdf.output('blob')
}
