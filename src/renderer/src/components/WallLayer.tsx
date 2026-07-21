import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { FloorPlan, Wall, WallShape, WallVertex } from '../types/domain'
import { clampToImage } from '../lib/clampToImage'
import {
  arcHandlePoints,
  arcPathD,
  circleHandlePoints,
  circleRadius,
  MIN_SHAPE_SIZE_PX,
  rectangleSegments,
  type Point2D,
  type Segment2D,
  type ShapeHandleRole,
  translateShape,
  updateArcHandle,
  updateCircleEdge
} from '../modules/walls/shapes'
import type { WallShapeInput } from '../modules/walls/api'

export interface SnapPoint {
  /** Presente = clique resolvido em cima de um vértice existente (ou criado nesta mesma cadeia de desenho); ausente = ponto novo. */
  vertexId?: string
  x: number
  y: number
}

export type WallTool = 'draw' | 'select' | 'rect' | 'circle' | 'arc'

export interface WallSelection {
  /** 'group' = todas as paredes com esse groupId (formas tesseladas — ADR-045); 'shape' = forma paramétrica circle/arc (ADR-046). */
  kind: 'vertex' | 'wall' | 'group' | 'shape'
  id: string
}

export interface WallEditorProps {
  /** "Objetos" ligado no painel de camadas — paredes desenhadas mesmo fora do modo de edição. */
  visible: boolean
  /** Edição realmente interativa (toggle "Editar paredes" no painel). */
  active: boolean
  tool: WallTool
  vertices: WallVertex[]
  walls: Wall[]
  /** Formas paramétricas (circle/arc) — ADR-046. Renderizadas como path SVG nativo, não tesseladas. */
  shapes: WallShape[]
  selection: WallSelection | null
  onSelect: (selection: WallSelection | null) => void
  onCreateWall: (start: SnapPoint, end: SnapPoint) => Promise<{ startVertexId: string; endVertexId: string }>
  /** Cria uma forma TESSELADA (retângulo) como N segmentos — 1 snapshot de undo (ADR-045). Círculo/arco foram pra `onCreateWallShape` (ADR-046). */
  onCreateShape: (segments: Array<{ start: SnapPoint; end: SnapPoint }>) => Promise<void>
  /** Cria uma forma PARAMÉTRICA (circle/arc) — sem tesselar, path SVG nativo, 0 vértices no grafo (ADR-046). */
  onCreateWallShape: (shape: WallShapeInput) => Promise<void>
  onMoveVertex: (id: string, x: number, y: number) => void
  onMoveWall: (id: string, dx: number, dy: number) => void
  /** Translação rígida de todos os vértices das paredes do grupo. */
  onMoveGroup: (groupId: string, dx: number, dy: number) => void
  /** Translação rígida do corpo de uma forma paramétrica (ADR-046). */
  onMoveShape: (id: string, dx: number, dy: number) => void
  /** Edita um handle de uma forma paramétrica (borda do círculo / p1,p2,pMid do arco) — ADR-046. */
  onUpdateShapeHandle: (id: string, role: ShapeHandleRole, point: Point2D) => void
  /**
   * Ferramenta régua (calibração) armada — hit das arestas fica ativo mesmo fora do modo de edição
   * de paredes. Clique na aresta abre o dialog Size/Thickness (via onMeasureWall), em vez de
   * iniciar arraste/seleção.
   */
  rulerActive?: boolean
  onMeasureWall?: (wallId: string) => void
}

interface Props extends WallEditorProps {
  floorPlan: FloorPlan
  /** Largura CSS já calculada pelo FloorPlanCanvas (zoom+container) — reaproveitada pra alinhar exatamente com o canvas. */
  canvasWidth: string
}

/** Raio (px de imagem) pra resolver snap num clique do modo Desenhar — mesmo raio de POINT_HIT_RADIUS em FloorPlanCanvas.tsx. */
const SNAP_RADIUS_PX = 16
/** Raio visual do círculo de vértice. */
const VERTEX_RADIUS = 5
/** Raio invisível (maior que o visual) pra facilitar clicar/arrastar um vértice sem precisar de precisão de pixel. */
const VERTEX_HIT_RADIUS = 14
/** Largura invisível da faixa de clique de uma parede — a linha visual é bem mais fina. */
const WALL_HIT_STROKE_WIDTH = 14
/** Abaixo dessa distância (px de imagem), um segundo clique no modo Desenhar é ignorado (evita parede de comprimento ~0). */
const MIN_SEGMENT_LENGTH_PX = 4
/** Abaixo dessa distância (px de imagem), soltar o mouse no modo Selecionar é tratado como clique (só seleção), não arraste — mesmo limiar de DRAG_THRESHOLD_PX em FloorPlanCanvas.tsx. */
const DRAG_THRESHOLD_PX = 5
/** Tolerância (graus) pra alinhar o segmento em desenho ao ângulo múltiplo de 45° mais próximo (horizontal/vertical/diagonal). */
const ANGLE_SNAP_DEG = 6
const ANGLE_SNAP_RAD = (ANGLE_SNAP_DEG * Math.PI) / 180
const ANGLE_STEP_RAD = Math.PI / 4
/** Tolerância (px de imagem) pra casar pontos computados da tesselação com os cliques originais do usuário
 * (ex.: canto oposto do retângulo recalculado via âncora+dx pode divergir ~1e-13 do ponto clicado por ponto flutuante). */
const SNAP_ATTACH_TOLERANCE_PX = 0.5

interface DragState {
  kind: 'vertex' | 'wall' | 'group' | 'shape' | 'shape-handle'
  id: string
  /** Só relevante pra 'shape-handle': qual handle da forma está sendo arrastado. */
  role?: ShapeHandleRole
  startClientX: number
  startClientY: number
}

/**
 * Rascunho de forma em andamento — TERCEIRO canal de interação da camada, separado da cadeia de
 * desenho livre (`drawStart`) e do arraste do modo Selecionar (`dragRef`/`dragPreview`), pra que
 * nenhum dos dois caminhos antigos dispare no meio de um gesto de forma (ADR-045):
 * - rect/circle: gesto de ARRASTE (mousedown → mousemove → mouseup), com `shapePointerDownRef`
 *   marcando que o botão está pressionado;
 * - arc: 3 CLIQUES (início → fim → ponto da curvatura), sem arraste — `cursor` segue o mouse.
 */
type ShapeDraft =
  | { tool: 'rect'; anchor: SnapPoint; cursor: SnapPoint; square: boolean }
  | { tool: 'circle'; center: SnapPoint; edge: SnapPoint }
  | { tool: 'arc'; points: [SnapPoint] | [SnapPoint, SnapPoint]; cursor: SnapPoint | null }

/** Se o segmento start→point estiver a até ANGLE_SNAP_DEG de um múltiplo de 45°, projeta o ponto exatamente nesse ângulo (mesma distância). */
function applyAngleSnap(
  start: { x: number; y: number },
  point: { x: number; y: number }
): { x: number; y: number; angleSnapped: boolean } {
  const dx = point.x - start.x
  const dy = point.y - start.y
  const distance = Math.hypot(dx, dy)
  if (distance < MIN_SEGMENT_LENGTH_PX) return { x: point.x, y: point.y, angleSnapped: false }
  const angle = Math.atan2(dy, dx)
  const nearestStep = Math.round(angle / ANGLE_STEP_RAD) * ANGLE_STEP_RAD
  if (Math.abs(angle - nearestStep) > ANGLE_SNAP_RAD) return { x: point.x, y: point.y, angleSnapped: false }
  return { x: start.x + distance * Math.cos(nearestStep), y: start.y + distance * Math.sin(nearestStep), angleSnapped: true }
}

/** Casa um ponto da tesselação com um clique original do usuário (<=0.5px) pra reaproveitar o vertexId do snap. */
function attachSnapId(point: Point2D, clicks: SnapPoint[]): SnapPoint {
  const match = clicks.find(
    (click) =>
      click.vertexId &&
      Math.abs(click.x - point.x) <= SNAP_ATTACH_TOLERANCE_PX &&
      Math.abs(click.y - point.y) <= SNAP_ATTACH_TOLERANCE_PX
  )
  if (match) return { vertexId: match.vertexId, x: match.x, y: match.y }
  return { x: point.x, y: point.y }
}

/** Repassa os vertexIds dos cliques snapados pros segmentos da tesselação — a forma nasce conectada ao grafo existente. */
function withSnapIds(segments: Segment2D[], clicks: SnapPoint[]): Array<{ start: SnapPoint; end: SnapPoint }> {
  return segments.map((segment) => ({ start: attachSnapId(segment.start, clicks), end: attachSnapId(segment.end, clicks) }))
}

export function WallLayer({
  floorPlan,
  canvasWidth,
  visible,
  active,
  tool,
  vertices,
  walls,
  shapes,
  selection,
  onSelect,
  onCreateWall,
  onCreateShape,
  onCreateWallShape,
  onMoveVertex,
  onMoveWall,
  onMoveGroup,
  onMoveShape,
  onUpdateShapeHandle,
  rulerActive = false,
  onMeasureWall
}: Props): JSX.Element | null {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [drawStart, setDrawStart] = useState<SnapPoint | null>(null)
  const [cursorPoint, setCursorPoint] = useState<{ x: number; y: number; angleSnapped: boolean } | null>(null)
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null)
  /** true entre mousedown e mouseup de um gesto de retângulo/círculo — ref porque não participa da renderização. */
  const shapePointerDownRef = useRef(false)
  const [dragPreview, setDragPreview] = useState<
    | {
        kind: 'vertex' | 'wall' | 'group' | 'shape'
        id: string
        dx: number
        dy: number
        /** Só relevante pro arraste de vértice: alinhou (horizontal/vertical/diagonal) contra a ponta fixa de alguma parede conectada. */
        angleSnapped?: boolean
        /** Id da parede cuja ponta fixa serviu de referência pro alinhamento — só essa parede ganha o destaque visual de "alinhado". */
        alignedWallId?: string
      }
    | { kind: 'shape-handle'; id: string; role: ShapeHandleRole; dx: number; dy: number }
    | null
  >(null)

  /** Trocar de ferramenta ou sair do modo de edição descarta qualquer cadeia de desenho ou rascunho de forma em andamento. */
  useEffect(() => {
    setDrawStart(null)
    setShapeDraft(null)
    shapePointerDownRef.current = false
  }, [active, tool])

  /** Escape abandona qualquer desenho em andamento (cadeia livre ou rascunho de forma). */
  useEffect(() => {
    if (!active || tool === 'select') return
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setDrawStart(null)
      setShapeDraft(null)
      shapePointerDownRef.current = false
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, tool])

  /** Shift pressionado/solto com o mouse parado também atualiza o quadrado do retângulo em arraste. */
  useEffect(() => {
    if (shapeDraft?.tool !== 'rect') return
    function handleShiftKey(event: KeyboardEvent): void {
      if (event.key !== 'Shift') return
      const square = event.type === 'keydown'
      setShapeDraft((draft) => (draft?.tool === 'rect' ? { ...draft, square } : draft))
    }
    window.addEventListener('keydown', handleShiftKey)
    window.addEventListener('keyup', handleShiftKey)
    return () => {
      window.removeEventListener('keydown', handleShiftKey)
      window.removeEventListener('keyup', handleShiftKey)
    }
  }, [shapeDraft?.tool])

  if (!visible) return null

  function toImageCoords(event: ReactMouseEvent | globalThis.MouseEvent): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const scaleX = floorPlan.imageWidth / rect.width
    const scaleY = floorPlan.imageHeight / rect.height
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY }
  }

  /** Snap SÓ de vértice (sem alinhamento de ângulo) — usado pelas ferramentas de forma. */
  function resolveVertexSnap(x: number, y: number): SnapPoint {
    const hit = vertices.find((vertex) => Math.hypot(vertex.x - x, vertex.y - y) <= SNAP_RADIUS_PX)
    if (hit) return { vertexId: hit.id, x: hit.x, y: hit.y }
    return { x, y }
  }

  /**
   * Resolve um clique bruto contra os vértices existentes (+ o início da cadeia atual, se houver) — snap pra
   * fechar ambientes. Sem vértice por perto, alinha o segmento ao ângulo múltiplo de 45° mais próximo do início
   * da cadeia atual (horizontal/vertical/diagonal), se estiver dentro da tolerância.
   */
  function resolveSnap(x: number, y: number): SnapPoint & { angleSnapped?: boolean } {
    const candidates: Array<{ id: string; x: number; y: number }> = drawStart?.vertexId
      ? [...vertices, { id: drawStart.vertexId, x: drawStart.x, y: drawStart.y }]
      : vertices
    const hit = candidates.find((vertex) => Math.hypot(vertex.x - x, vertex.y - y) <= SNAP_RADIUS_PX)
    if (hit) return { vertexId: hit.id, x: hit.x, y: hit.y }
    if (drawStart) return applyAngleSnap(drawStart, { x, y })
    return { x, y }
  }

  /** Pra cada parede conectada a um vértice, a outra ponta (fixa) — candidata a referência de alinhamento ao arrastar esse vértice. */
  function findConnectedFixedVertices(vertexId: string): Array<{ wallId: string; vertex: WallVertex }> {
    const results: Array<{ wallId: string; vertex: WallVertex }> = []
    for (const wall of walls) {
      const otherId = wall.startVertexId === vertexId ? wall.endVertexId : wall.endVertexId === vertexId ? wall.startVertexId : null
      if (!otherId) continue
      const other = vertices.find((candidate) => candidate.id === otherId)
      if (other) results.push({ wallId: wall.id, vertex: other })
    }
    return results
  }

  async function handlePointResolved(point: SnapPoint): Promise<void> {
    if (!drawStart) {
      setDrawStart(point)
      return
    }
    if (drawStart.vertexId && drawStart.vertexId === point.vertexId) return
    if (Math.hypot(point.x - drawStart.x, point.y - drawStart.y) < MIN_SEGMENT_LENGTH_PX) return

    const start = drawStart
    setDrawStart(null) // limpa já — evita duplo-clique disparar duas vezes enquanto a criação está em voo
    const { endVertexId } = await onCreateWall(start, point)
    setDrawStart({ vertexId: endVertexId, x: point.x, y: point.y })
  }

  /** Início do gesto de arraste de retângulo/círculo: âncora (canto/centro) com snap de vértice. */
  function beginShapeDrag(shapeTool: 'rect' | 'circle', anchor: SnapPoint, shiftKey: boolean): void {
    shapePointerDownRef.current = true
    if (shapeTool === 'rect') {
      setShapeDraft({ tool: 'rect', anchor, cursor: { x: anchor.x, y: anchor.y }, square: shiftKey })
    } else {
      setShapeDraft({ tool: 'circle', center: anchor, edge: { x: anchor.x, y: anchor.y } })
    }
  }

  /** Arco por 3 cliques (não é arraste): início → fim → ponto da curvatura confirma e cria.
   *  ADR-046: arco novo é paramétrico (3 pontos), não tesselado — path SVG nativo em runtime. */
  function handleArcClick(point: SnapPoint): void {
    if (!shapeDraft || shapeDraft.tool !== 'arc') {
      setShapeDraft({ tool: 'arc', points: [point], cursor: null })
      return
    }
    const points = shapeDraft.points
    if (points.length === 1) {
      const p1 = points[0]
      if (p1.vertexId && p1.vertexId === point.vertexId) return
      if (Math.hypot(point.x - p1.x, point.y - p1.y) < MIN_SEGMENT_LENGTH_PX) return
      setShapeDraft({ tool: 'arc', points: [p1, point], cursor: point })
      return
    }
    const [p1, p2] = points
    setShapeDraft(null) // limpa antes de criar — duplo-clique não dispara duas vezes
    // p1≠p2 garantido pelo 2º clique; pMid pode ser colinear (arco vira reta). Snap só copia x,y —
    // conectividade com grafo livre fica fora do escopo (ADR-046).
    void onCreateWallShape({
      kind: 'arc',
      p1: { x: p1.x, y: p1.y },
      p2: { x: p2.x, y: p2.y },
      pMid: { x: point.x, y: point.y }
    })
  }

  function handleBackgroundMouseDown(event: ReactMouseEvent): void {
    if (event.button !== 0) return
    const { x, y } = toImageCoords(event)
    if (active && tool === 'draw') {
      void handlePointResolved(resolveSnap(x, y))
      return
    }
    if (active && tool === 'select') {
      onSelect(null)
      return
    }
    if (active && (tool === 'rect' || tool === 'circle')) {
      beginShapeDrag(tool, resolveVertexSnap(x, y), event.shiftKey)
      return
    }
    if (active && tool === 'arc') {
      handleArcClick(resolveVertexSnap(x, y))
    }
  }

  function handleVertexMouseDown(event: ReactMouseEvent, vertex: WallVertex): void {
    if (event.button !== 0 || !active) return
    event.stopPropagation()
    if (tool === 'draw') {
      void handlePointResolved({ vertexId: vertex.id, x: vertex.x, y: vertex.y })
      return
    }
    if (tool === 'rect' || tool === 'circle') {
      beginShapeDrag(tool, { vertexId: vertex.id, x: vertex.x, y: vertex.y }, event.shiftKey)
      return
    }
    if (tool === 'arc') {
      handleArcClick({ vertexId: vertex.id, x: vertex.x, y: vertex.y })
      return
    }
    onSelect({ kind: 'vertex', id: vertex.id })
    dragRef.current = { kind: 'vertex', id: vertex.id, startClientX: event.clientX, startClientY: event.clientY }
    setDragPreview({ kind: 'vertex', id: vertex.id, dx: 0, dy: 0 })
  }

  function handleWallMouseDown(event: ReactMouseEvent, wall: Wall): void {
    if (event.button !== 0) return
    // Régua armada: qualquer clique em aresta mede (Size/Thickness) em vez de editar geometria.
    if (rulerActive && onMeasureWall) {
      event.stopPropagation()
      onMeasureWall(wall.id)
      return
    }
    if (!active || tool !== 'select') return
    event.stopPropagation()
    // Parede com groupId → o alvo do gesto é o GRUPO inteiro (seleção/arraste), não o segmento clicado (ADR-045).
    if (wall.groupId) {
      onSelect({ kind: 'group', id: wall.groupId })
      dragRef.current = { kind: 'group', id: wall.groupId, startClientX: event.clientX, startClientY: event.clientY }
      setDragPreview({ kind: 'group', id: wall.groupId, dx: 0, dy: 0 })
      return
    }
    onSelect({ kind: 'wall', id: wall.id })
    dragRef.current = { kind: 'wall', id: wall.id, startClientX: event.clientX, startClientY: event.clientY }
    setDragPreview({ kind: 'wall', id: wall.id, dx: 0, dy: 0 })
  }

  /** Corpo de uma forma paramétrica (circle/arc) — ADR-046: seleciona e inicia translação rígida. */
  function handleShapeBodyMouseDown(event: ReactMouseEvent, shape: WallShape): void {
    if (event.button !== 0 || !active || tool !== 'select') return
    event.stopPropagation()
    onSelect({ kind: 'shape', id: shape.id })
    dragRef.current = { kind: 'shape', id: shape.id, startClientX: event.clientX, startClientY: event.clientY }
    setDragPreview({ kind: 'shape', id: shape.id, dx: 0, dy: 0 })
  }

  /** Handle de uma forma paramétrica selecionada — ADR-046: redimensiona o círculo / edita p1,p2,pMid do arco. */
  function handleShapeHandleMouseDown(event: ReactMouseEvent, shape: WallShape, role: ShapeHandleRole): void {
    if (event.button !== 0 || !active || tool !== 'select') return
    event.stopPropagation()
    onSelect({ kind: 'shape', id: shape.id })
    dragRef.current = { kind: 'shape-handle', id: shape.id, role, startClientX: event.clientX, startClientY: event.clientY }
    setDragPreview({ kind: 'shape-handle', id: shape.id, role, dx: 0, dy: 0 })
  }

  function handleMouseMove(event: ReactMouseEvent): void {
    if (active && tool === 'draw' && drawStart) {
      const { x, y } = toImageCoords(event)
      const snapped = resolveSnap(x, y)
      setCursorPoint({ x: snapped.x, y: snapped.y, angleSnapped: Boolean(snapped.angleSnapped) })
    }

    if (active && shapeDraft) {
      const { x, y } = toImageCoords(event)
      if ((shapeDraft.tool === 'rect' || shapeDraft.tool === 'circle') && shapePointerDownRef.current) {
        const snapped = resolveVertexSnap(x, y)
        if (shapeDraft.tool === 'rect') {
          setShapeDraft({ ...shapeDraft, cursor: snapped, square: event.shiftKey })
        } else {
          setShapeDraft({ ...shapeDraft, edge: snapped })
        }
      } else if (shapeDraft.tool === 'arc') {
        setShapeDraft({ ...shapeDraft, cursor: resolveVertexSnap(x, y) })
      }
    }

    const drag = dragRef.current
    if (!drag) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = floorPlan.imageWidth / rect.width
    const scaleY = floorPlan.imageHeight / rect.height
    const dx = (event.clientX - drag.startClientX) * scaleX
    const dy = (event.clientY - drag.startClientY) * scaleY

    if (drag.kind === 'vertex') {
      const vertex = vertices.find((candidate) => candidate.id === drag.id)
      if (vertex) {
        const rawPoint = { x: vertex.x + dx, y: vertex.y + dy }
        let finalPoint: { x: number; y: number } = rawPoint
        let angleSnapped = false
        let alignedWallId: string | undefined
        for (const { wallId, vertex: fixed } of findConnectedFixedVertices(drag.id)) {
          const candidate = applyAngleSnap(fixed, rawPoint)
          if (candidate.angleSnapped) {
            finalPoint = candidate
            angleSnapped = true
            alignedWallId = wallId
            break
          }
        }
        setDragPreview({
          kind: 'vertex',
          id: drag.id,
          dx: finalPoint.x - vertex.x,
          dy: finalPoint.y - vertex.y,
          angleSnapped,
          alignedWallId
        })
        return
      }
    }

    if (drag.kind === 'shape-handle') {
      setDragPreview({ kind: 'shape-handle', id: drag.id, role: drag.role!, dx, dy })
    } else {
      setDragPreview({ kind: drag.kind, id: drag.id, dx, dy })
    }
  }

  function handleMouseUp(): void {
    // Commit de forma em arraste (retângulo/círculo) — canal separado: o arraste do modo Selecionar nunca convive com shapePointerDownRef.
    if (shapePointerDownRef.current) {
      shapePointerDownRef.current = false
      const draft = shapeDraft
      setShapeDraft(null) // limpa antes de criar — um segundo mouseup não dispara de novo
      if (draft?.tool === 'rect') {
        const segments = rectangleSegments(draft.anchor, draft.cursor, draft.square)
        if (segments.length > 0) void onCreateShape(withSnapIds(segments, [draft.anchor, draft.cursor]))
      } else if (draft?.tool === 'circle') {
        // ADR-046: círculo novo é paramétrico (center+edge), não tesselado — 0 vértices no grafo.
        const r = Math.hypot(draft.edge.x - draft.center.x, draft.edge.y - draft.center.y)
        if (r >= MIN_SHAPE_SIZE_PX) {
          void onCreateWallShape({
            kind: 'circle',
            center: { x: draft.center.x, y: draft.center.y },
            edge: { x: draft.edge.x, y: draft.edge.y }
          })
        }
      }
      return
    }

    const drag = dragRef.current
    dragRef.current = null
    if (!drag || !dragPreview) {
      setDragPreview(null)
      return
    }
    if (Math.hypot(dragPreview.dx, dragPreview.dy) <= DRAG_THRESHOLD_PX) {
      setDragPreview(null)
      return
    }
    if (drag.kind === 'vertex') {
      const vertex = vertices.find((candidate) => candidate.id === drag.id)
      if (vertex) onMoveVertex(vertex.id, vertex.x + dragPreview.dx, vertex.y + dragPreview.dy)
    } else if (drag.kind === 'wall') {
      onMoveWall(drag.id, dragPreview.dx, dragPreview.dy)
    } else if (drag.kind === 'group') {
      onMoveGroup(drag.id, dragPreview.dx, dragPreview.dy)
    } else if (drag.kind === 'shape') {
      onMoveShape(drag.id, dragPreview.dx, dragPreview.dy)
    } else if (drag.kind === 'shape-handle') {
      // Reconstrói o handle original (posição pré-arraste, vinda da forma persistida) e aplica o delta.
      const shape = shapes.find((candidate) => candidate.id === drag.id)
      if (shape) {
        const handles = shape.kind === 'circle' ? circleHandlePoints(shape) : arcHandlePoints(shape)
        const handle = handles.find((h) => h.role === drag.role)
        if (handle) {
          onUpdateShapeHandle(drag.id, drag.role!, { x: handle.x + dragPreview.dx, y: handle.y + dragPreview.dy })
        }
      }
    }
    setDragPreview(null)
  }

  /**
   * Offset de arraste em vigor pra um vértice, considerando os três jeitos de uma parede/vértice estarem em
   * movimento: arraste direto do próprio vértice, arraste de uma parede que o referencia (as duas pontas
   * daquela parede se movem juntas) ou arraste de um grupo (todo vértice das paredes do grupo — translação
   * rígida da forma). Fonte única usada tanto pelo círculo do vértice quanto pela linha da parede — sem
   * isso, um dos dois ficava "preso" na posição antiga até soltar o mouse.
   */
  function dragOffsetForVertex(vertexId: string): { dx: number; dy: number } {
    if (!dragPreview) return { dx: 0, dy: 0 }
    if (dragPreview.kind === 'vertex') {
      return dragPreview.id === vertexId ? { dx: dragPreview.dx, dy: dragPreview.dy } : { dx: 0, dy: 0 }
    }
    if (dragPreview.kind === 'wall') {
      const draggedWall = walls.find((wall) => wall.id === dragPreview.id)
      if (draggedWall && (draggedWall.startVertexId === vertexId || draggedWall.endVertexId === vertexId)) {
        return { dx: dragPreview.dx, dy: dragPreview.dy }
      }
      return { dx: 0, dy: 0 }
    }
    const inDraggedGroup = walls.some(
      (wall) => wall.groupId === dragPreview.id && (wall.startVertexId === vertexId || wall.endVertexId === vertexId)
    )
    return inDraggedGroup ? { dx: dragPreview.dx, dy: dragPreview.dy } : { dx: 0, dy: 0 }
  }

  function vertexPosition(vertex: WallVertex): { x: number; y: number } {
    const offset = dragOffsetForVertex(vertex.id)
    return clampToImage(vertex.x + offset.dx, vertex.y + offset.dy, floorPlan.imageWidth, floorPlan.imageHeight)
  }

  function wallEndpoints(wall: Wall): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
    const startVertex = vertices.find((vertex) => vertex.id === wall.startVertexId)
    const endVertex = vertices.find((vertex) => vertex.id === wall.endVertexId)
    if (!startVertex || !endVertex) return null
    const startOffset = dragOffsetForVertex(startVertex.id)
    const endOffset = dragOffsetForVertex(endVertex.id)
    return {
      start: { x: startVertex.x + startOffset.dx, y: startVertex.y + startOffset.dy },
      end: { x: endVertex.x + endOffset.dx, y: endVertex.y + endOffset.dy }
    }
  }

  /** Parede selecionada diretamente OU por pertencer ao grupo selecionado (forma selecionada como unidade). */
  function wallIsSelected(wall: Wall): boolean {
    if (selection?.kind === 'wall') return selection.id === wall.id
    if (selection?.kind === 'group') return wall.groupId === selection.id
    return false
  }

  /** Vértice selecionado diretamente OU por ser ponta de uma parede do grupo selecionado. */
  function vertexIsSelected(vertexId: string): boolean {
    if (selection?.kind === 'vertex') return selection.id === vertexId
    if (selection?.kind === 'group') {
      return walls.some((wall) => wall.groupId === selection.id && (wall.startVertexId === vertexId || wall.endVertexId === vertexId))
    }
    return false
  }

  /** Parede em arraste direto OU por pertencer ao grupo em arraste (feedback âmbar em todas as paredes do grupo). */
  function wallIsDragging(wall: Wall): boolean {
    if (dragPreview?.kind === 'wall') return dragPreview.id === wall.id
    if (dragPreview?.kind === 'group') return wall.groupId === dragPreview.id
    return false
  }

  /** Preview da forma em rascunho, calculado pelas MESMAS funções puras do commit — o que se vê é o que será criado. */
  function shapePreview(): { kind: 'rect'; x: number; y: number; width: number; height: number } | { kind: 'circle'; cx: number; cy: number; r: number } | { kind: 'path'; d: string } | null {
    if (!shapeDraft) return null
    if (shapeDraft.tool === 'rect') {
      const segments = rectangleSegments(shapeDraft.anchor, shapeDraft.cursor, shapeDraft.square)
      if (segments.length === 0) return null
      const c0 = segments[0].start
      const c2 = segments[2].start
      return {
        kind: 'rect',
        x: Math.min(c0.x, c2.x),
        y: Math.min(c0.y, c2.y),
        width: Math.abs(c2.x - c0.x),
        height: Math.abs(c2.y - c0.y)
      }
    }
    if (shapeDraft.tool === 'circle') {
      const r = Math.hypot(shapeDraft.edge.x - shapeDraft.center.x, shapeDraft.edge.y - shapeDraft.center.y)
      if (r < MIN_SHAPE_SIZE_PX) return null
      return { kind: 'circle', cx: shapeDraft.center.x, cy: shapeDraft.center.y, r }
    }
    const [p1] = shapeDraft.points
    const cursor = shapeDraft.cursor
    if (!cursor) return null
    if (shapeDraft.points.length === 1) {
      return { kind: 'path', d: `M ${p1.x} ${p1.y} L ${cursor.x} ${cursor.y}` }
    }
    const [, p2] = shapeDraft.points
    // ADR-046: preview do arco pelo MESMO path nativo do commit (arcPathD), não mais por polilinha tesselada.
    const d = arcPathD(p1, p2, cursor)
    if (!d) return null
    return { kind: 'path', d }
  }

  /**
   * Forma paramétrica na posição de exibição: incorpora o preview do arraste em vigor (corpo
   * transladado ou handle editado). Mesma fonte única usada pelo círculo/path visual E pelos
   * handles — sem isso, um dos dois ficaria preso na posição antiga até soltar o mouse (regra
   * do ADR-041 §10 estendida pras shapes do ADR-046). Preview sem clamp (só visual); o commit
   * no mouseup é que aplica `clampToImage` via Workspace.
   */
  function shapeDisplay(shape: WallShape): WallShape {
    if (!dragPreview) return shape
    if (dragPreview.kind === 'shape' && dragPreview.id === shape.id) {
      return translateShape(shape, dragPreview.dx, dragPreview.dy)
    }
    if (dragPreview.kind === 'shape-handle' && dragPreview.id === shape.id) {
      const handles = shape.kind === 'circle' ? circleHandlePoints(shape) : arcHandlePoints(shape)
      const handle = handles.find((h) => h.role === dragPreview.role)
      if (!handle) return shape
      const newPoint = { x: handle.x + dragPreview.dx, y: handle.y + dragPreview.dy }
      if (shape.kind === 'circle' && dragPreview.role === 'edge') return updateCircleEdge(shape, newPoint)
      if (shape.kind === 'arc' && dragPreview.role !== 'edge') {
        return updateArcHandle(shape, dragPreview.role, newPoint)
      }
    }
    return shape
  }

  /** Forma selecionada (paramétrica) — os handles só aparecem pra ela, no modo Selecionar. */
  const selectedShape = active && tool === 'select' && selection?.kind === 'shape'
    ? shapes.find((shape) => shape.id === selection.id) ?? null
    : null

  const preview = shapePreview()

  /**
   * Root do SVG:
   * - edição ativa → `auto` (captura fundo + gestos das ferramentas);
   * - só régua armada → `none` no root: cliques vazios atravessam pro canvas (calibração).
   *   Filhos com `pointer-events: stroke` (aresta) reativam o hit só neles — padrão SVG de
   *   "overlay click-through com hotspots".
   * - inativo → `none` total.
   */
  const rootPointerEvents = active ? 'auto' : 'none'

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${floorPlan.imageWidth} ${floorPlan.imageHeight}`}
      style={{ width: canvasWidth, pointerEvents: rootPointerEvents }}
      className={`wall-layer${active ? ` wall-layer--${tool}` : ''}${rulerActive && !active ? ' wall-layer--ruler' : ''}${dragPreview ? ' wall-layer--dragging' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <rect
        x={0}
        y={0}
        width={floorPlan.imageWidth}
        height={floorPlan.imageHeight}
        fill="transparent"
        /* Só captura fundo no modo de edição; régua deixa o clique vazio ir pro canvas. */
        style={{ pointerEvents: active ? 'auto' : 'none' }}
        onMouseDown={handleBackgroundMouseDown}
      />

      {walls.map((wall) => {
        const endpoints = wallEndpoints(wall)
        if (!endpoints) return null
        const isSelected = wallIsSelected(wall)
        const isDragging = wallIsDragging(wall)
        const isAligned = dragPreview?.kind === 'vertex' && dragPreview.angleSnapped && dragPreview.alignedWallId === wall.id
        return (
          <g key={wall.id}>
            <line
              x1={endpoints.start.x}
              y1={endpoints.start.y}
              x2={endpoints.end.x}
              y2={endpoints.end.y}
              className="wall-layer__wall-hit"
              strokeWidth={WALL_HIT_STROKE_WIDTH}
              /* Fora do modo Selecionar a faixa de acerto precisa "sumir" pro clique chegar ao fundo
               * (desenhar por cima de uma parede existente). Com a régua armada, a faixa fica ativa
               * pra medir Size/Thickness. Tem que ser inline style — atributo de apresentação perde
               * pra regra `pointer-events: stroke` do CSS da classe. */
              style={{
                pointerEvents: rulerActive || (active && tool === 'select') ? 'stroke' : 'none'
              }}
              onMouseDown={(event) => handleWallMouseDown(event, wall)}
            />
            <line
              x1={endpoints.start.x}
              y1={endpoints.start.y}
              x2={endpoints.end.x}
              y2={endpoints.end.y}
              className={`wall-layer__wall${isSelected ? ' wall-layer__wall--selected' : ''}${isDragging ? ' wall-layer__wall--dragging' : ''}${isAligned ? ' wall-layer__wall--snapped' : ''}`}
              style={{ strokeWidth: wall.strokeWidth ?? 3 }}
              pointerEvents="none"
            />
          </g>
        )
      })}

      {/* Formas paramétricas (circle/arc) — ADR-046. Renderizadas como path SVG nativo a partir
          dos parâmetros; faixa de acerto transparente igual às paredes (só ativa no modo Selecionar). */}
      {shapes.map((shape) => {
        const display = shapeDisplay(shape)
        const isSelected = selection?.kind === 'shape' && selection.id === shape.id
        const isDragging =
          (dragPreview?.kind === 'shape' || dragPreview?.kind === 'shape-handle') && dragPreview.id === shape.id
        if (display.kind === 'circle') {
          const r = circleRadius(display.center, display.edge)
          return (
            <g key={shape.id}>
              <circle
                cx={display.center.x}
                cy={display.center.y}
                r={r}
                fill="none"
                className="wall-layer__wall-hit"
                strokeWidth={WALL_HIT_STROKE_WIDTH}
                style={{ pointerEvents: active && tool === 'select' ? 'stroke' : 'none' }}
                onMouseDown={(event) => handleShapeBodyMouseDown(event, shape)}
              />
              <circle
                cx={display.center.x}
                cy={display.center.y}
                r={r}
                fill="none"
                className={`wall-layer__wall${isSelected ? ' wall-layer__wall--selected' : ''}${isDragging ? ' wall-layer__wall--dragging' : ''}`}
                pointerEvents="none"
              />
            </g>
          )
        }
        const d = arcPathD(display.p1, display.p2, display.pMid)
        if (!d) return null
        return (
          <g key={shape.id}>
            <path
              d={d}
              fill="none"
              strokeLinecap="round"
              className="wall-layer__wall-hit"
              strokeWidth={WALL_HIT_STROKE_WIDTH}
              style={{ pointerEvents: active && tool === 'select' ? 'stroke' : 'none' }}
              onMouseDown={(event) => handleShapeBodyMouseDown(event, shape)}
            />
            <path
              d={d}
              fill="none"
              strokeLinecap="round"
              className={`wall-layer__wall${isSelected ? ' wall-layer__wall--selected' : ''}${isDragging ? ' wall-layer__wall--dragging' : ''}`}
              pointerEvents="none"
            />
          </g>
        )
      })}

      {active && tool === 'draw' && drawStart && cursorPoint && (
        <line
          x1={drawStart.x}
          y1={drawStart.y}
          x2={cursorPoint.x}
          y2={cursorPoint.y}
          className={`wall-layer__preview${cursorPoint.angleSnapped ? ' wall-layer__preview--snapped' : ''}`}
        />
      )}

      {active && preview?.kind === 'rect' && (
        <rect x={preview.x} y={preview.y} width={preview.width} height={preview.height} fill="none" className="wall-layer__preview" pointerEvents="none" />
      )}
      {active && preview?.kind === 'circle' && (
        <circle cx={preview.cx} cy={preview.cy} r={preview.r} fill="none" className="wall-layer__preview" pointerEvents="none" />
      )}
      {active && preview?.kind === 'path' && <path d={preview.d} fill="none" className="wall-layer__preview" pointerEvents="none" />}

      {active &&
        vertices.map((vertex) => {
          const position = vertexPosition(vertex)
          return (
            <circle
              key={vertex.id}
              cx={position.x}
              cy={position.y}
              r={VERTEX_HIT_RADIUS}
              className={`wall-layer__vertex-hit${tool === 'select' ? ' wall-layer__vertex-hit--draggable' : ''}`}
              onMouseDown={(event) => handleVertexMouseDown(event, vertex)}
            />
          )
        })}

      {active &&
        vertices.map((vertex) => {
          const position = vertexPosition(vertex)
          const isSelected = vertexIsSelected(vertex.id)
          const isDragging = dragPreview?.kind === 'vertex' && dragPreview.id === vertex.id
          const isDraggingAligned = isDragging && dragPreview?.angleSnapped
          return (
            <circle
              key={`visual-${vertex.id}`}
              cx={position.x}
              cy={position.y}
              r={VERTEX_RADIUS}
              className={`wall-layer__vertex${isSelected ? ' wall-layer__vertex--selected' : ''}${isDraggingAligned ? ' wall-layer__vertex--dragging-snapped' : isDragging ? ' wall-layer__vertex--dragging' : ''}`}
              pointerEvents="none"
            />
          )
        })}

      {active && tool === 'draw' && drawStart && (
        <circle cx={drawStart.x} cy={drawStart.y} r={VERTEX_RADIUS} className="wall-layer__vertex--pending" pointerEvents="none" />
      )}

      {active && shapeDraft?.tool === 'rect' && (
        <circle cx={shapeDraft.anchor.x} cy={shapeDraft.anchor.y} r={VERTEX_RADIUS} className="wall-layer__vertex--pending" pointerEvents="none" />
      )}
      {active && shapeDraft?.tool === 'circle' && (
        <circle cx={shapeDraft.center.x} cy={shapeDraft.center.y} r={VERTEX_RADIUS} className="wall-layer__vertex--pending" pointerEvents="none" />
      )}
      {active &&
        shapeDraft?.tool === 'arc' &&
        shapeDraft.points.map((point, index) => (
          <circle key={`arc-pending-${index}`} cx={point.x} cy={point.y} r={VERTEX_RADIUS} className="wall-layer__vertex--pending" pointerEvents="none" />
        ))}

      {/* Handles da forma paramétrica selecionada — ADR-046: só no modo Selecionar, por cima de
          tudo (corpo da forma incluído), pra o clique no handle não virar arraste do corpo. */}
      {selectedShape &&
        (() => {
          const display = shapeDisplay(selectedShape)
          const handles = display.kind === 'circle' ? circleHandlePoints(display) : arcHandlePoints(display)
          return handles.map((handle) => {
            const isDragging =
              dragPreview?.kind === 'shape-handle' && dragPreview.id === selectedShape.id && dragPreview.role === handle.role
            return (
              <g key={`${selectedShape.id}-${handle.role}`}>
                <circle
                  cx={handle.x}
                  cy={handle.y}
                  r={VERTEX_HIT_RADIUS}
                  className="wall-layer__vertex-hit wall-layer__vertex-hit--draggable"
                  onMouseDown={(event) => handleShapeHandleMouseDown(event, selectedShape, handle.role)}
                />
                <circle
                  cx={handle.x}
                  cy={handle.y}
                  r={VERTEX_RADIUS}
                  className={`wall-layer__vertex${isDragging ? ' wall-layer__vertex--dragging' : ''}`}
                  pointerEvents="none"
                />
              </g>
            )
          })
        })()}
    </svg>
  )
}
