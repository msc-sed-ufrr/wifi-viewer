import { renderToStaticMarkup } from 'react-dom/server'
import { BandChart } from '../../components/ChannelChart'
import { buildChannelUsage, channelColor } from '../channels/channelUsage'
import type { StoredNetworkReading } from '../../types/domain'
import { createHeatmapExportCanvas, type HeatmapExportInput } from './heatmapExporter'
import { buildReportRows } from './reportData'

export interface ReportOptions {
  map: boolean
  channels: boolean
  readings: boolean
  notes: string
}

export interface ReportLabels {
  title: string
  map: string
  channels: string
  readings: string
  notes: string
  empty: string
  point: string
  position: string
  signal: string
  channel: string
  width: string
  estimated: string
  scope: string
  points: string
  radios: string
  page: string
}

const WIDTH = 1240
const HEIGHT = 1754
const MARGIN = 84
const BOTTOM = HEIGHT - 110

/** Canvas text preserves arbitrary SSIDs and Unicode without relying on PDF built-in fonts. */
export function wrapReportText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = ''
    for (const char of Array.from(paragraph)) {
      if (line && ctx.measureText(line + char).width > width) {
        const space = line.lastIndexOf(' ')
        if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1) }
        else { lines.push(line); line = '' }
      }
      line += char
    }
    lines.push(line.trimEnd())
  }
  return lines
}

async function chartImage(band: '2.4GHz' | '5GHz', entries: ReturnType<typeof buildChannelUsage>): Promise<HTMLImageElement> {
  const html = renderToStaticMarkup(<BandChart band={band} entries={entries.map((entry, index) => ({ ...entry, color: channelColor(index) }))} />)
  const svg = new DOMParser().parseFromString(html, 'text/html').querySelector('svg')!
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('width', '606')
  svg.setAttribute('height', '184')
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = '.channel-chart__gridline{stroke:#e5e7eb;stroke-width:1}.channel-chart__axis{stroke:#9ca3af;stroke-width:1}.channel-chart__axis-label{font:9px sans-serif;fill:#4b5563}.channel-chart__label{font:bold 9px sans-serif;paint-order:stroke;stroke:white;stroke-width:3px}'
  svg.prepend(style)
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally { URL.revokeObjectURL(url) }
}

export async function createReportPdf(input: HeatmapExportInput, readings: Map<string, StoredNetworkReading[]>, options: ReportOptions, labels: ReportLabels, date = new Date()): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  pdf.setProperties({ title: `${input.projectName} - ${input.floorPlan.name}`, subject: labels.title, creator: 'WiFi Viewer' })
  let pageNumber = 0
  let canvas!: HTMLCanvasElement
  let ctx!: CanvasRenderingContext2D
  let y = 0

  function finish(): void {
    ctx.fillStyle = '#64748b'
    ctx.font = '18px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${labels.page} ${++pageNumber}`, WIDTH - MARGIN, HEIGHT - 55)
    ctx.textAlign = 'left'
    if (pageNumber > 1) pdf.addPage()
    pdf.addImage(canvas, 'PNG', 0, 0, 210, 297, undefined, 'FAST')
  }

  function start(title: string): void {
    canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    ctx = context
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 32px sans-serif'
    ctx.fillText(title, MARGIN, 110, WIDTH - MARGIN * 2)
    ctx.fillStyle = '#64748b'
    ctx.font = '18px sans-serif'
    ctx.fillText(`${input.projectName} / ${input.floorPlan.name}`, MARGIN, 148, WIDTH - MARGIN * 2)
    y = 200
  }

  function text(value: string, font = '24px sans-serif', lineHeight = 36, continuation = labels.title): void {
    ctx.font = font
    ctx.fillStyle = '#1e293b'
    for (const line of wrapReportText(ctx, value, WIDTH - MARGIN * 2)) {
      if (y + lineHeight > BOTTOM) { finish(); start(continuation); ctx.font = font; ctx.fillStyle = '#1e293b' }
      ctx.fillText(line, MARGIN, y)
      y += lineHeight
    }
    y += 18
  }

  const channels = buildChannelUsage(readings)
  start(labels.title)
  y = 420
  text(input.projectName, 'bold 48px sans-serif', 62)
  text(input.floorPlan.name, '32px sans-serif', 46)
  text(date.toLocaleDateString())
  text(input.filterLabel)
  text(`${labels.points}: ${input.points.length}   |   ${labels.radios}: ${channels.length}`)
  y += 60
  text(labels.scope, '22px sans-serif', 34)
  text([options.map && labels.map, options.channels && labels.channels, options.readings && labels.readings, options.notes.trim() && labels.notes].filter(Boolean).join('\n'))
  finish()

  if (options.map) {
    start(labels.map)
    const map = await createHeatmapExportCanvas(input, date)
    const scale = Math.min((WIDTH - MARGIN * 2) / map.width, (BOTTOM - y) / map.height)
    ctx.drawImage(map, MARGIN + (WIDTH - MARGIN * 2 - map.width * scale) / 2, y, map.width * scale, map.height * scale)
    finish()
  }

  if (options.channels) {
    start(labels.channels)
    if (!channels.length) text(labels.empty)
    for (const band of ['2.4GHz', '5GHz'] as const) {
      const entries = channels.filter((entry) => entry.band === band)
      if (!entries.length) continue
      text(band, 'bold 26px sans-serif')
      const image = await chartImage(band, entries)
      const chartHeight = (WIDTH - MARGIN * 2) * 184 / 606
      ctx.drawImage(image, MARGIN, y, WIDTH - MARGIN * 2, chartHeight)
      y += chartHeight + 48
    }
    finish()
  }

  if (options.readings) {
    start(labels.readings)
    const rows = buildReportRows(input.points, readings)
    const columns = [labels.point, labels.position, 'SSID', 'BSSID', labels.signal, labels.channel, labels.width]
    const sizes = [80, 140, 225, 225, 145, 105, 152]
    function row(values: string[], heading = false): void {
      ctx.font = heading ? 'bold 18px sans-serif' : '18px sans-serif'
      const wrapped = values.map((value, index) => wrapReportText(ctx, value, sizes[index] - 16))
      const lineCount = Math.max(...wrapped.map((lines) => lines.length))
      let offset = 0
      while (offset < lineCount) {
        if (y + (lineCount - offset) * 25 + 20 > BOTTOM && y > 245) {
          finish(); start(labels.readings); row(columns, true)
        }
        ctx.font = heading ? 'bold 18px sans-serif' : '18px sans-serif'
        const count = Math.min(lineCount - offset, Math.max(1, Math.floor((BOTTOM - y - 20) / 25)))
        const height = count * 25 + 20
        ctx.fillStyle = heading ? '#e2e8f0' : '#f8fafc'
        ctx.fillRect(MARGIN, y, WIDTH - MARGIN * 2, height - 2)
        let x = MARGIN
        ctx.fillStyle = '#0f172a'
        wrapped.forEach((lines, index) => {
          lines.slice(offset, offset + count).forEach((line, lineIndex) => ctx.fillText(line, x + 8, y + 25 + lineIndex * 25))
          x += sizes[index]
        })
        y += height
        offset += count
      }
    }
    row(columns, true)
    if (!rows.length) text(labels.empty)
    for (const item of rows) row([String(item.point), item.position, item.ssid, item.bssid, item.signal, item.channel, item.width])
    y += 40
    text(labels.estimated, '18px sans-serif', 28, labels.readings)
    finish()
  }

  if (options.notes.trim()) {
    start(labels.notes)
    text(options.notes, '24px sans-serif', 36, labels.notes)
    finish()
  }
  return pdf.output('blob')
}
