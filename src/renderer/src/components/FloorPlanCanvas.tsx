import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { FloorPlan, MeasurementPoint, StoredNetworkReading } from '../types/domain'
import { useHeatmap, type HeatmapInput } from '../modules/heatmap/useHeatmap'
import { getNetworkGroup } from '../modules/readings/network'
import { useElementSize } from '../lib/useElementSize'
import { getPixelsPerMeter } from '../lib/calibration'
import { Rulers } from './Rulers'

interface Props {
  floorPlan: FloorPlan
  points: MeasurementPoint[]
  selectedPointId: string | null
  heatmapInput: HeatmapInput
  /**
   * Leitura mais forte de cada ponto — dá o dBm exibido junto ao marcador e no tooltip.
   * Na visão "todas as redes" é a melhor leitura entre todas; com uma rede selecionada,
   * é a leitura mais forte daquela rede especificamente.
   */
  pointReadingById: Map<string, StoredNetworkReading>
  onSelectPoint: (id: string) => void
  onCreatePoint: (x: number, y: number) => void
  onMovePoint: (id: string, x: number, y: number) => void
  /** Modo de calibração: cliques marcam pontos de referência em vez de criar/selecionar pontos de medição. */
  calibrating: boolean
  pendingCalibrationPoints: Array<{ x: number; y: number }>
  onCalibrationClick: (x: number, y: number) => void
}

/**
 * Raio do marcador numerado — sempre o mesmo para todos os pontos. Só o alcance
 * do heatmap (sigma, ver Workspace.computeSigmaPx) varia com a força do sinal;
 * o marcador em si é só uma referência de localização, não um dado visual.
 */
const POINT_RADIUS = 10
/** Distância máxima (px, no espaço da imagem) para considerar um clique "em cima" de um ponto existente. */
const POINT_HIT_RADIUS = 16

/** Faixa e passo do zoom manual da planta (ver ADR-030) — 100% = ocupa a largura disponível. */
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP_FACTOR = 1.25
/** Largura da coluna do canto/régua vertical — deve casar com `grid-template-columns` de `.floor-plan-canvas__grid` no CSS. */
const RULER_GUTTER_PX = 28
/** Acima desse deslocamento (px na tela), um clique-e-arraste vira "mover" em vez de criar/selecionar um ponto. */
const DRAG_THRESHOLD_PX = 5

interface DragState {
  startX: number
  startY: number
  startScrollLeft: number
  startScrollTop: number
  moved: boolean
  /** Ponto sob o cursor no `mousedown` — se presente, o arraste reposiciona o ponto em vez de fazer pan (UC-004). */
  pointId: string | null
}

export function FloorPlanCanvas({
  floorPlan,
  points,
  selectedPointId,
  heatmapInput,
  pointReadingById,
  onSelectPoint,
  onCreatePoint,
  onMovePoint,
  calibrating,
  pendingCalibrationPoints,
  onCalibrationClick
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  /**
   * Posição ao vivo do ponto sendo arrastado — só visual, durante o arraste. A posição
   * persistida (via onMovePoint) só muda no `mouseup`; até lá o marcador segue o cursor
   * sem regravar o IndexedDB nem recalcular o heatmap a cada `mousemove`.
   */
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null)
  const heatmapBitmap = useHeatmap(heatmapInput, floorPlan.imageWidth, floorPlan.imageHeight)
  const renderedSize = useElementSize(canvasRef)
  /**
   * Tamanho do viewport rolável, medido de fora pra dentro — NUNCA o tamanho do próprio
   * canvas. Antes o CSS calculava a largura do canvas como uma porcentagem da coluna "auto"
   * do grid, mas essa coluna só tem largura definida a partir do próprio canvas (que por sua
   * vez depende da coluna) — acima de 100% esse ciclo diverge e o navegador arremata no
   * limite interno de layout (~16 milhões de px), estourando o resto da tela. Medindo o
   * container de fora (que tem largura própria vinda do flex, independente do conteúdo)
   * e calculando a largura do canvas em px a partir daí, o ciclo desaparece.
   */
  const containerSize = useElementSize(scrollRef)

  useEffect(() => {
    const url = URL.createObjectURL(floorPlan.image)
    const img = new Image()
    img.onload = () => setImage(img)
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [floorPlan.image])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !image) return

    canvas.width = floorPlan.imageWidth
    canvas.height = floorPlan.imageHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    if (heatmapBitmap) {
      // Sem globalAlpha extra aqui: o canal alfa do bitmap já embute MAX_ALPHA×confidence
      // (ver colorScale.gridToRgba) — aplicar outra opacidade por cima dilui a cor pela metade
      // e faz o heatmap parecer bem mais claro/dessaturado do que a legenda promete.
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(
        heatmapBitmap,
        0,
        0,
        heatmapBitmap.width,
        heatmapBitmap.height,
        0,
        0,
        canvas.width,
        canvas.height
      )
    }

    points.forEach((point, index) => {
      const isSelected = point.id === selectedPointId
      const { x, y } = dragPreview?.id === point.id ? dragPreview : point

      ctx.beginPath()
      ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = isSelected ? '#2563eb' : '#111827'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${POINT_RADIUS}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(index + 1), x, y)

      const reading = pointReadingById.get(point.id)
      if (reading) {
        const label = `(${reading.signalDbm})`
        const labelX = x + POINT_RADIUS + 4
        ctx.font = `${POINT_RADIUS}px sans-serif`
        ctx.textAlign = 'left'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.strokeText(label, labelX, y)
        ctx.fillStyle = '#111827'
        ctx.fillText(label, labelX, y)
      }
    })

    if (pendingCalibrationPoints.length > 0) {
      ctx.save()
      ctx.strokeStyle = '#dc2626'
      ctx.fillStyle = '#dc2626'
      ctx.lineWidth = 2

      if (pendingCalibrationPoints.length === 2) {
        ctx.beginPath()
        ctx.moveTo(pendingCalibrationPoints[0].x, pendingCalibrationPoints[0].y)
        ctx.lineTo(pendingCalibrationPoints[1].x, pendingCalibrationPoints[1].y)
        ctx.setLineDash([6, 4])
        ctx.stroke()
        ctx.setLineDash([])
      }

      pendingCalibrationPoints.forEach((point) => {
        const size = 7
        ctx.beginPath()
        ctx.moveTo(point.x - size, point.y)
        ctx.lineTo(point.x + size, point.y)
        ctx.moveTo(point.x, point.y - size)
        ctx.lineTo(point.x, point.y + size)
        ctx.stroke()
      })
      ctx.restore()
    }
  }, [
    image,
    points,
    selectedPointId,
    dragPreview,
    heatmapBitmap,
    pointReadingById,
    pendingCalibrationPoints,
    floorPlan.imageWidth,
    floorPlan.imageHeight
  ])

  function toImageCoords(event: MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    }
  }

  function findPointAt(x: number, y: number): MeasurementPoint | undefined {
    return points.find((point) => Math.hypot(point.x - x, point.y - y) <= POINT_HIT_RADIUS)
  }

  /** Mantém o ponto arrastado dentro da planta — soltar fora do canvas não pode jogar o ponto pra fora da imagem. */
  function clampToImage(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.min(Math.max(x, 0), floorPlan.imageWidth),
      y: Math.min(Math.max(y, 0), floorPlan.imageHeight)
    }
  }

  /**
   * Clique-e-arraste move a planta (ver ADR-030) ou, se começar em cima de um ponto,
   * reposiciona o ponto (UC-004) — `mousedown` só guarda o ponto de partida; a decisão
   * entre "foi um clique" ou "foi um arraste" só acontece no `mouseup`, com base em
   * quanto o cursor se moveu.
   */
  function handleMouseDown(event: MouseEvent<HTMLCanvasElement>): void {
    if (event.button !== 0) return
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const { x, y } = toImageCoords(event)
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scrollEl.scrollLeft,
      startScrollTop: scrollEl.scrollTop,
      moved: false,
      pointId: calibrating ? null : (findPointAt(x, y)?.id ?? null)
    }
  }

  function handleMouseUp(event: MouseEvent<HTMLCanvasElement>): void {
    const drag = dragStateRef.current
    dragStateRef.current = null
    setIsPanning(false)
    setDragPreview(null)
    if (drag?.moved) {
      if (drag.pointId) {
        const coords = toImageCoords(event)
        const { x, y } = clampToImage(coords.x, coords.y)
        onMovePoint(drag.pointId, x, y)
      }
      return
    }

    const { x, y } = toImageCoords(event)
    if (calibrating) {
      onCalibrationClick(x, y)
      return
    }

    const hit = findPointAt(x, y)
    if (hit) {
      onSelectPoint(hit.id)
    } else {
      onCreatePoint(x, y)
    }
  }

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>): void {
    const drag = dragStateRef.current
    if (drag) {
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        drag.moved = true
        if (!drag.pointId) setIsPanning(true)
      }
      if (drag.moved) {
        if (drag.pointId) {
          const coords = toImageCoords(event)
          setDragPreview({ id: drag.pointId, ...clampToImage(coords.x, coords.y) })
          setHoveredPointId(null)
          return
        }
        const scrollEl = scrollRef.current
        if (scrollEl) {
          scrollEl.scrollLeft = drag.startScrollLeft - dx
          scrollEl.scrollTop = drag.startScrollTop - dy
        }
        return
      }
    }

    if (calibrating) return
    const { x, y } = toImageCoords(event)
    setHoveredPointId(findPointAt(x, y)?.id ?? null)
  }

  function handleMouseLeave(): void {
    dragStateRef.current = null
    setIsPanning(false)
    setDragPreview(null)
    setHoveredPointId(null)
  }

  function handleZoomIn(): void {
    setZoom((value) => Math.min(MAX_ZOOM, value * ZOOM_STEP_FACTOR))
  }

  function handleZoomOut(): void {
    setZoom((value) => Math.max(MIN_ZOOM, value / ZOOM_STEP_FACTOR))
  }

  function handleZoomReset(): void {
    setZoom(1)
  }

  const hoveredIndex = hoveredPointId ? points.findIndex((point) => point.id === hoveredPointId) : -1
  const hoveredPoint = hoveredIndex >= 0 ? points[hoveredIndex] : null
  const hoveredReading = hoveredPoint ? pointReadingById.get(hoveredPoint.id) : undefined

  const pixelsPerMeter = getPixelsPerMeter(floorPlan)
  const availableWidth = containerSize.width - (pixelsPerMeter ? RULER_GUTTER_PX : 0)
  // Antes do primeiro ResizeObserver (containerSize.width ainda 0), cai em 100% via CSS
  // só pra esse único frame — sem isso o canvas nasceria com largura 0 e sumiria por um instante.
  const canvasWidth = availableWidth > 0 ? `${availableWidth * zoom}px` : '100%'

  return (
    <>
      <div className="floor-plan-canvas" ref={scrollRef}>
        <div className={`floor-plan-canvas__grid${pixelsPerMeter ? '' : ' floor-plan-canvas__grid--no-rulers'}`}>
          {pixelsPerMeter && (
            <Rulers
              pixelsPerMeter={pixelsPerMeter}
              renderedWidth={renderedSize.width}
              renderedHeight={renderedSize.height}
              nativeWidth={floorPlan.imageWidth}
              nativeHeight={floorPlan.imageHeight}
            />
          )}
          <div ref={wrapperRef} className="floor-plan-canvas__surface-wrapper">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={{ width: canvasWidth }}
              className={`floor-plan-canvas__surface${calibrating ? ' floor-plan-canvas__surface--calibrating' : ''}${isPanning ? ' floor-plan-canvas__surface--panning' : ''}${dragPreview ? ' floor-plan-canvas__surface--dragging-point' : ''}`}
            />

            {hoveredPoint && hoveredReading && (
              <div
                className="point-tooltip"
                style={{
                  left: `${(hoveredPoint.x / floorPlan.imageWidth) * 100}%`,
                  top: `${(hoveredPoint.y / floorPlan.imageHeight) * 100}%`
                }}
              >
                <div className="point-tooltip__title">Ponto {hoveredIndex + 1}</div>
                <div className="point-tooltip__group point-tooltip__network">
                  {getNetworkGroup(hoveredReading).label}
                </div>
                <div className="point-tooltip__group">
                  <div>RSSI: {hoveredReading.signalDbm} dBm</div>
                  {hoveredReading.noise !== undefined && hoveredReading.noise !== 0 && (
                    <>
                      <div>Noise: {hoveredReading.noise} dBm</div>
                      <div>SNR: {hoveredReading.signalDbm - hoveredReading.noise} dB</div>
                    </>
                  )}
                </div>
                <div className="point-tooltip__group">Canal: {hoveredReading.primaryChannel}</div>
                {hoveredReading.widthMhz !== undefined && (
                  <div className="point-tooltip__group">Largura: {hoveredReading.widthMhz} MHz</div>
                )}
                {hoveredReading.standard && <div className="point-tooltip__group">{hoveredReading.standard}</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="zoom-controls">
        <button type="button" onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM} title="Diminuir zoom">
          −
        </button>
        <button type="button" className="zoom-controls__level" onClick={handleZoomReset} title="Restaurar 100%">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM} title="Aumentar zoom">
          +
        </button>
      </div>
    </>
  )
}
