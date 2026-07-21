import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import type { FloorPlan, MeasurementPoint, StoredNetworkReading } from '../types/domain'
import { useHeatmap, type HeatmapInput } from '../modules/heatmap/useHeatmap'
import { getNetworkGroup } from '../modules/readings/network'
import { useElementSize } from '../lib/useElementSize'
import { getPixelsPerMeter } from '../lib/calibration'
import { clampToImage } from '../lib/clampToImage'
import { Rulers } from './Rulers'
import { WallLayer, type WallEditorProps } from './WallLayer'
import { ZoomInIcon, ZoomOutIcon } from './icons'

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
  /**
   * Quando false, clique vazio na planta NÃO cria ponto de medição (só seleciona/move
   * pontos existentes e permite pan). Armado/desarmado pelo toggle da Toolbar — evita
   * pontos órfãos criados por clique acidental.
   */
  placingPoints: boolean
  onMovePoint: (id: string, x: number, y: number) => void
  /**
   * Shift+arraste desloca todos os pontos de uma vez (a imagem "desliza" sob os pontos,
   * que ficam parados na tela — ver ADR-038): reporta o delta final em px de imagem no
   * `mouseup`, e cabe ao pai confirmar com o usuário antes de persistir.
   */
  onBulkMovePoints: (dx: number, dy: number) => void
  /** Incrementado pelo pai ao resolver (confirmar/cancelar) um reposicionamento em lote pendente, para limpar o preview local. */
  bulkMoveResetSignal: number
  /** Modo de calibração: cliques marcam pontos de referência em vez de criar/selecionar pontos de medição. */
  calibrating: boolean
  pendingCalibrationPoints: Array<{ x: number; y: number }>
  onCalibrationClick: (x: number, y: number) => void
  /** Camada "Medições" do painel de camadas (ADR-041) — liga/desliga só os marcadores de ponto. */
  showPoints: boolean
  /** Camada "Imagem" do painel de camadas — liga/desliga o desenho da imagem de fundo. */
  showImage: boolean
  /** Camada/editor de paredes (ADR-041) — ver WallLayer.tsx. */
  wallEditor: WallEditorProps
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
/**
 * Sensibilidade do zoom contínuo via trackpad/wheel (deltaY em px, mode 0).
 * Fator final = exp(-deltaY * k); k baixo = zoom suave a cada “tick” do trackpad.
 */
const WHEEL_ZOOM_SENSITIVITY = 0.0018
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
  /** Shift estava pressionado no `mousedown` — o arraste desloca todos os pontos em vez de fazer pan ou mover um só. */
  bulk: boolean
  /**
   * Pan forçado (botão do meio, Espaço+arraste, ou pan dedicado no container) —
   * ignora hit de ponto/bulk e só move o scroll. Ver ADR-030.
   */
  forcePan: boolean
}

/** Alvo de pan pós-zoom, para manter o ponto sob o cursor (layout effect após mudar `width`). */
interface PendingZoomFocus {
  clientX: number
  clientY: number
  /** Fração 0–1 do ponto sob o cursor no canvas ANTES do zoom. */
  fracX: number
  fracY: number
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function FloorPlanCanvas({
  floorPlan,
  points,
  selectedPointId,
  heatmapInput,
  pointReadingById,
  onSelectPoint,
  onCreatePoint,
  placingPoints,
  onMovePoint,
  onBulkMovePoints,
  bulkMoveResetSignal,
  calibrating,
  pendingCalibrationPoints,
  onCalibrationClick,
  showPoints,
  showImage,
  wallEditor
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const zoomRef = useRef(1)
  const pendingZoomFocusRef = useRef<PendingZoomFocus | null>(null)
  const spaceHeldRef = useRef(false)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  /** Espaço pressionado — libera o “modo pan” temporário (cursor grab), estilo Figma/maps. */
  const [spacePanArmed, setSpacePanArmed] = useState(false)
  /**
   * Posição ao vivo do ponto sendo arrastado — só visual, durante o arraste. A posição
   * persistida (via onMovePoint) só muda no `mouseup`; até lá o marcador segue o cursor
   * sem regravar o IndexedDB nem recalcular o heatmap a cada `mousemove`.
   */
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null)
  /**
   * Deslocamento (px de imagem) do reposicionamento em lote em andamento — só desenha a
   * imagem deslocada (ver efeito de render abaixo); os pontos continuam nas coordenadas
   * normais, o que cria o efeito de "pontos parados, planta desliza". Sobrevive ao
   * `mouseup` (fica visível durante a confirmação) e só é limpo via `bulkMoveResetSignal`.
   */
  const [bulkDragOffset, setBulkDragOffset] = useState<{ dx: number; dy: number } | null>(null)
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
    setBulkDragOffset(null)
  }, [bulkMoveResetSignal])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  /**
   * Após o layout aplicar o novo `width` do canvas, recenter o scroll para manter o
   * ponto sob o cursor (wheel) ou o centro do viewport (botões +/−). Sem isso o zoom
   * só cresce a partir do canto superior-esquerdo do overflow.
   */
  useLayoutEffect(() => {
    const focus = pendingZoomFocusRef.current
    if (!focus) return
    pendingZoomFocusRef.current = null
    const scrollEl = scrollRef.current
    const canvas = canvasRef.current
    if (!scrollEl || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const nextLeft = rect.left + focus.fracX * rect.width
    const nextTop = rect.top + focus.fracY * rect.height
    scrollEl.scrollLeft += nextLeft - focus.clientX
    scrollEl.scrollTop += nextTop - focus.clientY
  }, [zoom])

  /** Zoom contínuo pelo scroll do mouse/trackpad, ancorado no cursor — ADR-030. */
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    function handleWheel(event: WheelEvent): void {
      // Ctrl/⌘+scroll (pinch em trackpads) e scroll comum viram zoom na planta.
      // Shift+scroll deixa o browser fazer pan horizontal nativo quando houver overflow.
      if (event.shiftKey) return

      const canvas = canvasRef.current
      if (!canvas || !scrollEl) return

      event.preventDefault()

      let delta = event.deltaY
      if (event.deltaMode === 1) delta *= 16 // linhas → px aproximado
      if (event.deltaMode === 2) delta *= scrollEl.clientHeight // páginas

      // deltaY>0 = scroll pra baixo = zoom out (mesmo sentido dos mapas).
      const factor = Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY)
      const current = zoomRef.current
      const next = clampZoom(current * factor)
      if (next === current) return

      const rect = canvas.getBoundingClientRect()
      // Fallback ao centro do viewport se o cursor estiver fora do canvas (ex.: sobre the gutter).
      const focusX =
        event.clientX >= rect.left && event.clientX <= rect.right
          ? event.clientX
          : rect.left + rect.width / 2
      const focusY =
        event.clientY >= rect.top && event.clientY <= rect.bottom
          ? event.clientY
          : rect.top + rect.height / 2
      const fracX = rect.width > 0 ? (focusX - rect.left) / rect.width : 0.5
      const fracY = rect.height > 0 ? (focusY - rect.top) / rect.height : 0.5

      pendingZoomFocusRef.current = { clientX: focusX, clientY: focusY, fracX, fracY }
      zoomRef.current = next
      setZoom(next)
    }

    scrollEl.addEventListener('wheel', handleWheel, { passive: false })
    return () => scrollEl.removeEventListener('wheel', handleWheel)
  }, [])

  /**
   * Espaço arma pan temporário (Figma/maps): com Space pressionado, arrastar em qualquer
   * lugar do viewport move a planta — inclusive por cima de paredes/pontos. Liberar Space
   * desarma. Não captura Space quando o foco está em input/textarea.
   */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.code !== 'Space' || event.repeat) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      spaceHeldRef.current = true
      setSpacePanArmed(true)
    }
    function handleKeyUp(event: KeyboardEvent): void {
      if (event.code !== 'Space') return
      spaceHeldRef.current = false
      setSpacePanArmed(false)
      // Se soltou Space no meio de um pan forçado, o mouseup seguinte termina o gesture.
    }
    function handleBlur(): void {
      spaceHeldRef.current = false
      setSpacePanArmed(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  /**
   * Pan global no container (capture): botão do meio sempre, botão esquerdo com Space, ou
   * arraste vazio fora do canvas (padding/gutter). Capture + stopPropagation impede que
   * WallLayer/canvas iniciem desenho/seleção/ponto sob o mesmo gesto.
   */
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    function handleContainerMouseDown(event: globalThis.MouseEvent): void {
      if (!scrollEl) return
      const middle = event.button === 1
      const spaceLeft = event.button === 0 && spaceHeldRef.current
      // Arraste no fundo cinza / réguas (não no canvas nem no SVG de paredes).
      const onBg =
        event.button === 0 &&
        !spaceHeldRef.current &&
        event.target instanceof Element &&
        !event.target.closest('canvas.floor-plan-canvas__surface') &&
        !event.target.closest('.wall-layer')

      if (!middle && !spaceLeft && !onBg) return
      event.preventDefault()
      event.stopPropagation()

      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: scrollEl.scrollLeft,
        startScrollTop: scrollEl.scrollTop,
        moved: false,
        pointId: null,
        bulk: false,
        forcePan: true
      }
      setIsPanning(true)
    }

    function handleWindowMouseMove(event: globalThis.MouseEvent): void {
      const drag = dragStateRef.current
      if (!drag?.forcePan || !scrollEl) return
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) drag.moved = true
      scrollEl.scrollLeft = drag.startScrollLeft - dx
      scrollEl.scrollTop = drag.startScrollTop - dy
    }

    function handleWindowMouseUp(): void {
      const drag = dragStateRef.current
      if (!drag?.forcePan) return
      dragStateRef.current = null
      setIsPanning(false)
    }

    // Auxclick/middle-click no Chromium às vezes abre autoscroll — bloqueia no container.
    function handleAuxClick(event: globalThis.MouseEvent): void {
      if (event.button === 1) event.preventDefault()
    }

    // Capture: roda antes do target (WallLayer/canvas) e cancela o restante do caminho.
    scrollEl.addEventListener('mousedown', handleContainerMouseDown, true)
    scrollEl.addEventListener('auxclick', handleAuxClick)
    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => {
      scrollEl.removeEventListener('mousedown', handleContainerMouseDown, true)
      scrollEl.removeEventListener('auxclick', handleAuxClick)
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !image) return

    canvas.width = floorPlan.imageWidth
    canvas.height = floorPlan.imageHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Só a imagem recebe o deslocamento do arraste em lote — heatmap e marcadores continuam
    // nas coordenadas normais, já que são eles que devem parecer "parados" durante o preview.
    if (showImage) {
      ctx.drawImage(image, bulkDragOffset?.dx ?? 0, bulkDragOffset?.dy ?? 0, canvas.width, canvas.height)
    }

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

    if (showPoints) {
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
    }

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
    bulkDragOffset,
    heatmapBitmap,
    pointReadingById,
    pendingCalibrationPoints,
    floorPlan.imageWidth,
    floorPlan.imageHeight,
    showImage,
    showPoints
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

  /**
   * Guarda o ponto focal (centro do viewport) antes de um zoom por botão, para o
   * layout effect recenter o scroll — mesmo caminho do wheel zoom.
   */
  function captureViewportCenterFocus(): void {
    const scrollEl = scrollRef.current
    const canvas = canvasRef.current
    if (!scrollEl || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const clientX = scrollEl.getBoundingClientRect().left + scrollEl.clientWidth / 2
    const clientY = scrollEl.getBoundingClientRect().top + scrollEl.clientHeight / 2
    const fracX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5
    const fracY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5
    pendingZoomFocusRef.current = { clientX, clientY, fracX, fracY }
  }

  /**
   * Clique-e-arraste move a planta (ver ADR-030) ou, se começar em cima de um ponto,
   * reposiciona o ponto (UC-004) — `mousedown` só guarda o ponto de partida; a decisão
   * entre "foi um clique" ou "foi um arraste" só acontece no `mouseup`, com base em
   * quanto o cursor se moveu. Middle-click / Space+drag forçam pan (também no listener
   * do container); aqui cobrimos o botão esquerdo no canvas.
   */
  function handleMouseDown(event: MouseEvent<HTMLCanvasElement>): void {
    // Botão do meio: pan forçado (também tratado no container; preventDefault anti-autoscroll).
    if (event.button === 1) {
      event.preventDefault()
      const scrollEl = scrollRef.current
      if (!scrollEl) return
      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: scrollEl.scrollLeft,
        startScrollTop: scrollEl.scrollTop,
        moved: false,
        pointId: null,
        bulk: false,
        forcePan: true
      }
      setIsPanning(true)
      return
    }
    if (event.button !== 0) return
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    // Space+LMB — pan estilo Figma, mesmo em cima de ponto.
    if (spaceHeldRef.current) {
      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: scrollEl.scrollLeft,
        startScrollTop: scrollEl.scrollTop,
        moved: false,
        pointId: null,
        bulk: false,
        forcePan: true
      }
      setIsPanning(true)
      return
    }

    const bulk = !calibrating && event.shiftKey && points.length > 0
    const { x, y } = toImageCoords(event)
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scrollEl.scrollLeft,
      startScrollTop: scrollEl.scrollTop,
      moved: false,
      bulk,
      pointId: calibrating || bulk ? null : (findPointAt(x, y)?.id ?? null),
      forcePan: false
    }
  }

  function handleMouseUp(event: MouseEvent<HTMLCanvasElement>): void {
    const drag = dragStateRef.current
    // forcePan pode ter sido iniciado no container e terminado no window listener —
    // se ainda estiver ativo aqui, o window mouseup cuida; ou limpamos se for nosso.
    if (drag?.forcePan) {
      dragStateRef.current = null
      setIsPanning(false)
      return
    }
    dragStateRef.current = null
    setIsPanning(false)
    setDragPreview(null)
    if (drag?.bulk) {
      // Sem cruzar o limiar, não houve arraste de fato — não aciona a confirmação
      // (e não deixa nada residual, já que bulkDragOffset só é setado a partir do limiar).
      if (drag.moved && bulkDragOffset) {
        onBulkMovePoints(bulkDragOffset.dx, bulkDragOffset.dy)
      }
      return
    }
    if (drag?.moved) {
      if (drag.pointId) {
        const coords = toImageCoords(event)
        const { x, y } = clampToImage(coords.x, coords.y, floorPlan.imageWidth, floorPlan.imageHeight)
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
    } else if (placingPoints) {
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
        if (drag.forcePan || (!drag.pointId && !drag.bulk)) setIsPanning(true)
      }
      if (drag.moved) {
        if (drag.forcePan) {
          const scrollEl = scrollRef.current
          if (scrollEl) {
            scrollEl.scrollLeft = drag.startScrollLeft - dx
            scrollEl.scrollTop = drag.startScrollTop - dy
          }
          return
        }
        if (drag.bulk) {
          const canvas = canvasRef.current
          if (canvas) {
            const rect = canvas.getBoundingClientRect()
            const scaleX = canvas.width / rect.width
            const scaleY = canvas.height / rect.height
            setBulkDragOffset({ dx: dx * scaleX, dy: dy * scaleY })
          }
          return
        }
        if (drag.pointId) {
          const coords = toImageCoords(event)
          setDragPreview({
            id: drag.pointId,
            ...clampToImage(coords.x, coords.y, floorPlan.imageWidth, floorPlan.imageHeight)
          })
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
    const drag = dragStateRef.current
    // forcePan continua via window listeners (container effect) — não aborta ao sair do canvas.
    if (drag?.forcePan) {
      setHoveredPointId(null)
      return
    }
    dragStateRef.current = null
    setIsPanning(false)
    setDragPreview(null)
    setHoveredPointId(null)
    // Um arraste em lote ainda não confirmado (mouseup) é abandonado ao sair do canvas,
    // igual ao pan/arraste de ponto — sem isso o preview ficaria preso sem gesto ativo.
    if (drag?.bulk) setBulkDragOffset(null)
  }

  function handleZoomIn(): void {
    captureViewportCenterFocus()
    setZoom((value) => clampZoom(value * ZOOM_STEP_FACTOR))
  }

  function handleZoomOut(): void {
    captureViewportCenterFocus()
    setZoom((value) => clampZoom(value / ZOOM_STEP_FACTOR))
  }

  function handleZoomReset(): void {
    captureViewportCenterFocus()
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
      <div
        className={`floor-plan-canvas${spacePanArmed || isPanning ? ' floor-plan-canvas--pan' : ''}${isPanning ? ' floor-plan-canvas--panning' : ''}`}
        ref={scrollRef}
      >
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
              onAuxClick={(event) => {
                // Impede o menu/autoscroll do botão do meio no Chromium/Electron.
                if (event.button === 1) event.preventDefault()
              }}
              style={{ width: canvasWidth }}
              className={`floor-plan-canvas__surface${calibrating && !spacePanArmed && !isPanning ? ' floor-plan-canvas__surface--calibrating' : ''}${!calibrating && placingPoints && !spacePanArmed && !isPanning ? ' floor-plan-canvas__surface--placing' : ''}${spacePanArmed && !isPanning ? ' floor-plan-canvas__surface--pan-ready' : ''}${isPanning ? ' floor-plan-canvas__surface--panning' : ''}${dragPreview ? ' floor-plan-canvas__surface--dragging-point' : ''}${bulkDragOffset ? ' floor-plan-canvas__surface--bulk-dragging' : ''}`}
            />

            <WallLayer floorPlan={floorPlan} canvasWidth={canvasWidth} {...wallEditor} />

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
          <ZoomOutIcon width={18} height={18} />
        </button>
        <button type="button" className="zoom-controls__level" onClick={handleZoomReset} title="Restaurar 100%">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM} title="Aumentar zoom">
          <ZoomInIcon width={18} height={18} />
        </button>
      </div>
    </>
  )
}
