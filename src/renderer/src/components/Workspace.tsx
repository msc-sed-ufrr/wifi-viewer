import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  FloorPlan,
  FloorPlanCalibration,
  MeasurementPoint,
  Project,
  StoredNetworkReading,
  Wall,
  WallShape,
  WallVertex
} from '../types/domain'
import {
  createPoint,
  deleteAllPointsForFloorPlan,
  deletePoint,
  listPoints,
  moveAllPoints,
  movePoint
} from '../modules/points/api'
import { setFloorPlanCalibration } from '../modules/projects/api'
import { addReadings, listReadingsForFloorPlan } from '../modules/readings/api'
import {
  ALL_NETWORKS_KEY,
  filterReadingsByPointByBand,
  getStrongestReading,
  getStrongestReadingForGroup,
  listNetworkGroups,
  type Band
} from '../modules/readings/network'
import { getDistanceMeters } from '../modules/readings/distance'
import { parseWifiScanCsv } from '../modules/import/csvParser'
import { captureLive, isLiveCaptureAvailable } from '../modules/import/liveCapture'
import { useUiStore } from '../store/uiStore'
import type { WeightedPoint } from '../modules/heatmap/idw'
import type { HeatmapInput } from '../modules/heatmap/useHeatmap'
import { dbmToSigma, distanceToSigmaMeters } from '../modules/heatmap/colorScale'
import { buildChannelUsage } from '../modules/channels/channelUsage'
import { getPixelsPerMeter } from '../lib/calibration'
import { clampToImage } from '../lib/clampToImage'
import {
  countWallsForVertex,
  createWall,
  createWallShape,
  createWallVertex,
  createWallsWithGroup,
  deleteWall,
  deleteWallGroup,
  deleteWallShape,
  deleteWallVertex,
  listWallShapes,
  listWallVertices,
  listWalls,
  moveWall,
  moveWallGroup,
  moveWallVertex,
  replaceWallsForFloorPlan,
  updateWall,
  updateWallShape,
  type ShapeSegmentInput,
  type WallShapeInput
} from '../modules/walls/api'
import { translateShape, updateArcHandle, updateCircleEdge, type Point2D, type ShapeClamp, type ShapeHandleRole } from '../modules/walls/shapes'
import { Toolbar } from './Toolbar'
import { FloorPlanCanvas } from './FloorPlanCanvas'
import { PointPanel } from './PointPanel'
import { Legend } from './Legend'
import { ChannelChart } from './ChannelChart'
import { CalibrationDialog } from './CalibrationDialog'
import { WallMeasureDialog } from './WallMeasureDialog'
import { CloseIcon } from './icons'
import { WallEditorPanel } from './WallEditorPanel'
import type { SnapPoint, WallSelection, WallTool } from './WallLayer'

/** Snapshot do dialog Size/Thickness aberto ao clicar numa aresta com a régua armada. */
interface PendingWallMeasure {
  wallId: string
  /** Ids que recebem a espessura: a própria aresta, ou todas do groupId se houver. */
  thicknessWallIds: string[]
  lengthPx: number
  sizeUnit: 'm' | 'px'
  initialSize: number
  /** true = confirmar size define calibração da planta a partir desta aresta (planta ainda sem escala). */
  sizeSetsCalibration: boolean
  sizeEditable: boolean
  initialThickness: number
}

interface Props {
  project: Project
  floorPlan: FloorPlan
}

const MIN_HEATMAP_POINTS = 2
const DEFAULT_WALL_STROKE_WIDTH = 3

export function Workspace({ project, floorPlan: initialFloorPlan }: Props): JSX.Element {
  const { t } = useTranslation()
  const [floorPlan, setFloorPlan] = useState(initialFloorPlan)
  const [points, setPoints] = useState<MeasurementPoint[]>([])
  const [readingsByPoint, setReadingsByPoint] = useState<Map<string, StoredNetworkReading[]>>(new Map())
  const [scanAvailable, setScanAvailable] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [band, setBand] = useState<Band>('all')
  const [calibrating, setCalibrating] = useState(false)
  const [pendingCalibrationPoints, setPendingCalibrationPoints] = useState<Array<{ x: number; y: number }>>([])
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [pendingBulkMove, setPendingBulkMove] = useState<{ dx: number; dy: number } | null>(null)
  /** Incrementado ao resolver (confirmar/cancelar) um pendingBulkMove — sinaliza o FloorPlanCanvas a limpar o preview. */
  const [bulkMoveResetSignal, setBulkMoveResetSignal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Editor de paredes (ADR-041) — camada independente de vetores, ver WallLayer.tsx.
  const [vertices, setVertices] = useState<WallVertex[]>([])
  const [walls, setWalls] = useState<Wall[]>([])
  /** Formas paramétricas (circle/arc) — ADR-046. Entidades matemáticas editáveis, não tesseladas. */
  const [shapes, setShapes] = useState<WallShape[]>([])
  const [wallEditing, setWallEditing] = useState(false)
  const [wallTool, setWallTool] = useState<WallTool>('draw')
  const [wallSelection, setWallSelection] = useState<WallSelection | null>(null)
  const [confirmingDeleteVertex, setConfirmingDeleteVertex] = useState<{ id: string; wallCount: number } | null>(null)
  /**
   * Undo/redo do editor de paredes + calibração de escala (ADR-044 estendido).
   * Cada item é um snapshot completo ANTES da ação: vértices+paredes+shapes+calibration.
   * Inclui calibração porque Size da régua e "Calibrar escala" também mutam estado
   * da planta e precisam ser desfeitos/refeitos junto com a geometria.
   */
  type EditorSnapshot = {
    vertices: WallVertex[]
    walls: Wall[]
    shapes: WallShape[]
    calibration: FloorPlanCalibration | undefined
  }
  const [wallUndoStack, setWallUndoStack] = useState<EditorSnapshot[]>([])
  const [wallRedoStack, setWallRedoStack] = useState<EditorSnapshot[]>([])
  /** Painel de camadas (ADR-041) — cada uma só alterna visibilidade, nunca apaga dado. */
  const [showMeasurements, setShowMeasurements] = useState(true)
  const [showImage, setShowImage] = useState(true)
  const [showWalls, setShowWalls] = useState(true)
  /**
   * Toggle "Adicionar pontos" da Toolbar — desarmado por padrão. Qualquer clique vazio na
   * planta só cria medição com este modo armado; evita pontos órfãos por clique acidental.
   */
  const [placingPoints, setPlacingPoints] = useState(false)

  /** Valor único de espessura entre todas as arestas da planta; null se misto ou se não há paredes. */
  const allWallsStrokeWidth = useMemo<number | null>(() => {
    if (walls.length === 0) return null
    const widths = new Set(walls.map((wall) => wall.strokeWidth ?? DEFAULT_WALL_STROKE_WIDTH))
    return widths.size === 1 ? [...widths][0]! : null
  }, [walls])

  /** Dialog Size/Thickness da ferramenta régua (clique em aresta). */
  const [pendingWallMeasure, setPendingWallMeasure] = useState<PendingWallMeasure | null>(null)

  const selectedPointId = useUiStore((state) => state.selectedPointId)
  const selectPoint = useUiStore((state) => state.selectPoint)
  const selectedNetworkKey = useUiStore((state) => state.selectedNetworkKey)
  const selectNetwork = useUiStore((state) => state.selectNetwork)

  useEffect(() => {
    setFloorPlan(initialFloorPlan)
  }, [initialFloorPlan])

  const reload = useCallback(async () => {
    const [pts, readings, vs, ws, shps] = await Promise.all([
      listPoints(floorPlan.id),
      listReadingsForFloorPlan(floorPlan.id),
      listWallVertices(floorPlan.id),
      listWalls(floorPlan.id),
      listWallShapes(floorPlan.id)
    ])
    setPoints(pts)
    setReadingsByPoint(readings)
    setVertices(vs)
    setWalls(ws)
    setShapes(shps)
  }, [floorPlan.id])

  useEffect(() => {
    reload()
  }, [reload])

  /** Histórico de undo/redo de paredes é por planta — trocar de planta não pode aplicar um snapshot de outra. */
  useEffect(() => {
    setWallUndoStack([])
    setWallRedoStack([])
  }, [floorPlan.id])

  useEffect(() => {
    isLiveCaptureAvailable().then(setScanAvailable)
  }, [])

  const bandFilteredReadings = useMemo(
    () => filterReadingsByPointByBand(readingsByPoint, band),
    [readingsByPoint, band]
  )

  const networkGroups = useMemo(() => listNetworkGroups(bandFilteredReadings), [bandFilteredReadings])
  const isAllNetworks = selectedNetworkKey === ALL_NETWORKS_KEY
  const pixelsPerMeter = useMemo(() => getPixelsPerMeter(floorPlan), [floorPlan])

  /**
   * Espalhamento (sigma) do blob de uma leitura: com planta calibrada, deriva da
   * distância estimada até a origem (px/metro real); sem calibração, cai no
   * fallback baseado só no dBm (ver colorScale.ts) — não dá pra converter metros
   * em pixels sem saber a escala.
   */
  const computeSigmaPx = useCallback(
    (reading: StoredNetworkReading): number => {
      if (pixelsPerMeter) {
        const { meters } = getDistanceMeters(reading)
        return distanceToSigmaMeters(meters) * pixelsPerMeter
      }
      return dbmToSigma(reading.signalDbm)
    },
    [pixelsPerMeter]
  )

  /**
   * Leitura mais forte de cada ponto — usada tanto pelo heatmap quanto pro tamanho/label
   * dos marcadores. No modo "todas as redes" é a melhor leitura entre todas as redes
   * (a experiência de Wi-Fi disponível ali, não uma rede específica); com uma rede
   * selecionada, é a leitura mais forte daquela rede.
   */
  const pointReadingById = useMemo(() => {
    const map = new Map<string, StoredNetworkReading>()
    if (isAllNetworks) {
      for (const point of points) {
        const readings = bandFilteredReadings.get(point.id) ?? []
        const reading = getStrongestReading(readings)
        if (reading) map.set(point.id, reading)
      }
      return map
    }
    const group = networkGroups.find((candidate) => candidate.key === selectedNetworkKey)
    if (!group) return map
    for (const point of points) {
      const readings = bandFilteredReadings.get(point.id) ?? []
      const reading = getStrongestReadingForGroup(readings, group)
      if (reading) map.set(point.id, reading)
    }
    return map
  }, [points, bandFilteredReadings, networkGroups, selectedNetworkKey, isAllNetworks])

  const heatmapPoints = useMemo<WeightedPoint[]>(
    () =>
      points.flatMap((point) => {
        const reading = pointReadingById.get(point.id)
        if (!reading) return []
        return [{ x: point.x, y: point.y, valueDbm: reading.signalDbm, sigma: computeSigmaPx(reading) }]
      }),
    [points, pointReadingById, computeSigmaPx]
  )

  const heatmapInput: HeatmapInput = { points: heatmapPoints }

  /** Um traço por rádio (BSSID) visto em qualquer ponto da planta — ver ChannelChart. Só faz sentido na visão "todas as redes". */
  const channelUsage = useMemo(
    () => (isAllNetworks ? buildChannelUsage(bandFilteredReadings) : []),
    [isAllNetworks, bandFilteredReadings]
  )

  const selectedPoint = points.find((point) => point.id === selectedPointId) ?? null
  const selectedPointIndex = selectedPoint ? points.indexOf(selectedPoint) : -1

  async function handleCreatePoint(x: number, y: number): Promise<void> {
    const point = await createPoint(floorPlan.id, x, y)
    await reload()
    selectPoint(point.id)
  }

  /**
   * Atualiza o estado local antes de persistir — o preview do arraste (FloorPlanCanvas)
   * é descartado no `mouseup`, então sem a atualização otimista o ponto voltaria à
   * posição antiga por um instante enquanto o IndexedDB grava e o reload chega.
   */
  async function handleMovePoint(id: string, x: number, y: number): Promise<void> {
    setPoints((prev) => prev.map((point) => (point.id === id ? { ...point, x, y } : point)))
    await movePoint(id, x, y)
    await reload()
  }

  async function handleImportCsv(file: File): Promise<void> {
    if (!selectedPointId) return
    try {
      const text = await file.text()
      const readings = parseWifiScanCsv(text)
      await addReadings(selectedPointId, readings)
      await reload()
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message.startsWith('error.') ? t(message) : message)
    }
  }

  async function handleLiveCapture(): Promise<void> {
    if (!selectedPointId) return
    try {
      const readings = await captureLive()
      await addReadings(selectedPointId, readings)
      await reload()
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message.startsWith('error.') ? t(message) : message)
    }
  }

  async function handleDeletePoint(): Promise<void> {
    if (!selectedPointId) return
    await deletePoint(selectedPointId)
    selectPoint(null)
    await reload()
  }

  /**
   * Modal próprio em vez de `window.confirm()` — no Electron empacotado, o diálogo
   * nativo rouba o foco da janela e o clique seguinte na planta só reativa a janela
   * em vez de ser entregue ao canvas, exigindo um segundo clique para criar o ponto.
   */
  function handleResetPoints(): void {
    setConfirmingReset(true)
  }

  async function handleConfirmReset(): Promise<void> {
    setConfirmingReset(false)
    await deleteAllPointsForFloorPlan(floorPlan.id)
    selectPoint(null)
    selectNetwork(ALL_NETWORKS_KEY)
    await reload()
  }

  /** Shift+arraste na planta (FloorPlanCanvas) termina aqui — pede confirmação antes de persistir (ver ADR-038). */
  function handleBulkMovePoints(dx: number, dy: number): void {
    setPendingBulkMove({ dx, dy })
  }

  function handleCancelBulkMove(): void {
    setPendingBulkMove(null)
    setBulkMoveResetSignal((value) => value + 1)
  }

  /**
   * Limpa o preview (via bulkMoveResetSignal) ANTES de aguardar a escrita no IndexedDB —
   * se limpasse depois, o `reload` poderia chegar com os pontos já na posição nova enquanto
   * o preview ainda mostra a imagem deslocada, duplicando visualmente o deslocamento.
   */
  async function handleConfirmBulkMove(): Promise<void> {
    if (!pendingBulkMove) return
    const { dx, dy } = pendingBulkMove
    setPendingBulkMove(null)
    setBulkMoveResetSignal((value) => value + 1)
    await moveAllPoints(floorPlan.id, dx, dy, floorPlan.imageWidth, floorPlan.imageHeight)
    await reload()
  }

  function handleToggleCalibrate(): void {
    if (calibrating) {
      setCalibrating(false)
      setPendingCalibrationPoints([])
      setPendingWallMeasure(null)
      return
    }
    selectPoint(null)
    setPendingCalibrationPoints([])
    setPendingWallMeasure(null)
    setWallEditing(false)
    setWallSelection(null)
    setPlacingPoints(false)
    setCalibrating(true)
  }

  function handleCalibrationClick(x: number, y: number): void {
    setPendingCalibrationPoints((prev) => (prev.length < 2 ? [...prev, { x, y }] : prev))
  }

  function handleCancelCalibrationDialog(): void {
    setCalibrating(false)
    setPendingCalibrationPoints([])
  }

  async function handleConfirmCalibrationDialog(realDistanceMeters: number): Promise<void> {
    const [pointA, pointB] = pendingCalibrationPoints
    setCalibrating(false)
    setPendingCalibrationPoints([])

    // Snapshot pré-calibração — undo restaura a escala anterior (ou a ausência dela).
    pushWallUndoSnapshot()
    const calibration: FloorPlanCalibration = { pointA, pointB, realDistanceMeters }
    const updated = await setFloorPlanCalibration(floorPlan.id, calibration)
    if (updated) setFloorPlan(updated)
  }

  /** Clicar na ferramenta já ativa entra/sai do modo de edição de paredes — mesmo comportamento de um app
   * vetorial (Illustrator/Corel): selecionar a ferramenta é o próprio gesto de ativar o modo, sem pré-toggle. */
  function handleSelectWallTool(tool: WallTool): void {
    if (wallEditing && wallTool === tool) {
      setWallEditing(false)
      setWallSelection(null)
      return
    }
    selectPoint(null)
    setCalibrating(false)
    setPendingCalibrationPoints([])
    setPlacingPoints(false)
    setWallSelection(null)
    setWallTool(tool)
    setWallEditing(true)
  }

  /** Armar/desarmar criação de pontos — saem calibração e edição de paredes (só um modo "agressivo" de clique na planta por vez). */
  function handleTogglePlacingPoints(): void {
    if (placingPoints) {
      setPlacingPoints(false)
      return
    }
    setCalibrating(false)
    setPendingCalibrationPoints([])
    setWallEditing(false)
    setWallSelection(null)
    selectPoint(null)
    setPlacingPoints(true)
  }

  /** Empilha o estado ATUAL (pré-mutação) de vértices/paredes/shapes/calibração — chamado no
   * início de toda ação que muda a geometria OU a escala, antes de persistir. Uma nova ação
   * sempre invalida o redo (mesma regra de qualquer editor). */
  function pushWallUndoSnapshot(): void {
    setWallUndoStack((stack) => [
      ...stack,
      { vertices, walls, shapes, calibration: floorPlan.calibration }
    ])
    setWallRedoStack([])
  }

  /** Restaura snapshot completo (geometria + calibração). Calibração undefined limpa a escala. */
  async function restoreEditorSnapshot(snapshot: EditorSnapshot): Promise<void> {
    setWallSelection(null)
    await replaceWallsForFloorPlan(floorPlan.id, snapshot.vertices, snapshot.walls, snapshot.shapes)
    const updated = await setFloorPlanCalibration(floorPlan.id, snapshot.calibration)
    if (updated) setFloorPlan(updated)
    await reload()
  }

  function currentEditorSnapshot(): EditorSnapshot {
    return { vertices, walls, shapes, calibration: floorPlan.calibration }
  }

  /**
   * Resolve cada ponta (reaproveita o vértice se veio de snap, cria um novo caso contrário) e
   * persiste a parede — retorna os ids definitivos pro WallLayer continuar a cadeia de desenho
   * sem esperar o próximo `reload()` (ver WallLayer.tsx::handlePointResolved).
   */
  async function handleCreateWall(
    start: SnapPoint,
    end: SnapPoint
  ): Promise<{ startVertexId: string; endVertexId: string }> {
    pushWallUndoSnapshot()
    const startVertexId = start.vertexId ?? (await createWallVertex(floorPlan.id, start.x, start.y)).id
    const endVertexId = end.vertexId ?? (await createWallVertex(floorPlan.id, end.x, end.y)).id
    // Se todas as arestas existentes já têm a mesma espessura, herda pra nova linha.
    await createWall(floorPlan.id, startVertexId, endVertexId, allWallsStrokeWidth ?? undefined)
    await reload()
    return { startVertexId, endVertexId }
  }

  async function handleMoveVertex(id: string, x: number, y: number): Promise<void> {
    pushWallUndoSnapshot()
    await moveWallVertex(id, x, y, floorPlan.imageWidth, floorPlan.imageHeight)
    await reload()
  }

  async function handleMoveWall(id: string, dx: number, dy: number): Promise<void> {
    pushWallUndoSnapshot()
    await moveWall(id, dx, dy, floorPlan.imageWidth, floorPlan.imageHeight)
    await reload()
  }

  /**
   * Cria uma forma (retângulo/círculo/arco — ADR-045) como UM passo de undo: um único snapshot
   * antes do batch, todas as paredes/vértices numa transação só (createWallsWithGroup), um reload.
   */
  async function handleCreateShape(segments: ShapeSegmentInput[]): Promise<void> {
    if (segments.length === 0) return
    pushWallUndoSnapshot()
    // Mesma herança de espessura das linhas livres — retângulo nasce com o stroke comum atual.
    await createWallsWithGroup(floorPlan.id, segments, crypto.randomUUID(), allWallsStrokeWidth ?? undefined)
    setWallSelection(null)
    await reload()
  }

  async function handleMoveGroup(groupId: string, dx: number, dy: number): Promise<void> {
    pushWallUndoSnapshot()
    await moveWallGroup(floorPlan.id, groupId, dx, dy, floorPlan.imageWidth, floorPlan.imageHeight)
    await reload()
  }

  /**
   * Cria uma forma PARAMÉTRICA (circle/arc) — ADR-046: 1 snapshot de undo, sem tesselar, 0 vértices no grafo.
   * Retângulo continua em `handleCreateShape` (tesselado + groupId, ADR-045).
   */
  async function handleCreateWallShape(input: WallShapeInput): Promise<void> {
    pushWallUndoSnapshot()
    await createWallShape(floorPlan.id, input)
    setWallSelection(null)
    await reload()
  }

  /** Translação rígida do corpo de uma forma paramétrica — clamp na imagem no próprio `translateShape`. */
  async function handleMoveShape(id: string, dx: number, dy: number): Promise<void> {
    const shape = shapes.find((candidate) => candidate.id === id)
    if (!shape) return
    pushWallUndoSnapshot()
    const clamp: ShapeClamp = (point) => clampToImage(point.x, point.y, floorPlan.imageWidth, floorPlan.imageHeight)
    await updateWallShape(translateShape(shape, dx, dy, clamp))
    await reload()
  }

  /** Edita um handle de forma (borda do círculo / p1,p2,pMid do arco) — clamp + rejeição degenerada nos helpers. */
  async function handleUpdateShapeHandle(id: string, role: ShapeHandleRole, point: Point2D): Promise<void> {
    const shape = shapes.find((candidate) => candidate.id === id)
    if (!shape) return
    pushWallUndoSnapshot()
    const clamp: ShapeClamp = (p) => clampToImage(p.x, p.y, floorPlan.imageWidth, floorPlan.imageHeight)
    let updated: WallShape
    if (shape.kind === 'circle' && role === 'edge') {
      updated = updateCircleEdge(shape, point, clamp)
    } else if (shape.kind === 'arc' && role !== 'edge') {
      updated = updateArcHandle(shape, role, point, clamp)
    } else {
      return
    }
    await updateWallShape(updated)
    await reload()
  }

  /** Ajusta a espessura de TODAS as arestas da planta de uma vez — um único snapshot de undo (ADR-044). */
  async function handleChangeAllWallsStrokeWidth(value: number): Promise<void> {
    if (walls.length === 0) return
    const targets = walls.filter((wall) => (wall.strokeWidth ?? DEFAULT_WALL_STROKE_WIDTH) !== value)
    if (targets.length === 0) return
    pushWallUndoSnapshot()
    await Promise.all(targets.map((wall) => updateWall({ ...wall, strokeWidth: value })))
    await reload()
  }

  /**
   * Clique em aresta com a régua armada — abre dialog Size/Thickness.
   * Size em metros se a planta está calibrada (permite redimensionar a aresta); em px se não.
   * Sem calibração, o size editável define a escala da planta a partir desta aresta.
   */
  function handleMeasureWall(wallId: string): void {
    const wall = walls.find((candidate) => candidate.id === wallId)
    if (!wall) return
    const start = vertices.find((vertex) => vertex.id === wall.startVertexId)
    const end = vertices.find((vertex) => vertex.id === wall.endVertexId)
    if (!start || !end) return
    const lengthPx = Math.hypot(end.x - start.x, end.y - start.y)
    if (lengthPx < 1e-6) return
    const ppm = getPixelsPerMeter(floorPlan)
    const calibrated = ppm !== null
    const thicknessWallIds = wall.groupId
      ? walls.filter((candidate) => candidate.groupId === wall.groupId).map((candidate) => candidate.id)
      : [wall.id]
    const thicknesses = new Set(
      thicknessWallIds.map((id) => {
        const candidate = walls.find((w) => w.id === id)
        return candidate?.strokeWidth ?? DEFAULT_WALL_STROKE_WIDTH
      })
    )
    setPendingCalibrationPoints([])
    setPendingWallMeasure({
      wallId,
      thicknessWallIds,
      lengthPx,
      // Sem calibração o campo Size pede metros reais (define a escala); com calibração mostra o comprimento atual em m.
      sizeUnit: 'm',
      initialSize: calibrated ? lengthPx / ppm! : 0,
      sizeSetsCalibration: !calibrated,
      sizeEditable: true,
      initialThickness: thicknesses.size === 1 ? [...thicknesses][0]! : DEFAULT_WALL_STROKE_WIDTH
    })
  }

  function handleCancelWallMeasure(): void {
    setPendingWallMeasure(null)
  }

  async function handleConfirmWallMeasure(values: { size: number; thickness: number }): Promise<void> {
    if (!pendingWallMeasure) return
    const { wallId, thicknessWallIds, lengthPx, sizeSetsCalibration } = pendingWallMeasure
    const wall = walls.find((candidate) => candidate.id === wallId)
    if (!wall) {
      setPendingWallMeasure(null)
      return
    }
    const start = vertices.find((vertex) => vertex.id === wall.startVertexId)
    const end = vertices.find((vertex) => vertex.id === wall.endVertexId)
    if (!start || !end) {
      setPendingWallMeasure(null)
      return
    }

    setPendingWallMeasure(null)
    pushWallUndoSnapshot()

    // 1) Espessura — aresta isolada ou grupo inteiro.
    await Promise.all(
      thicknessWallIds.map(async (id) => {
        const candidate = walls.find((w) => w.id === id)
        if (!candidate || (candidate.strokeWidth ?? DEFAULT_WALL_STROKE_WIDTH) === values.thickness) return
        await updateWall({ ...candidate, strokeWidth: values.thickness })
      })
    )

    // 2) Size (opcional — NaN = usuário só mudou thickness):
    //    - planta SEM calibração + sizeSetsCalibration: values.size em METROS define a
    //      calibração da planta usando os dois vértices da aresta como pointA/pointB.
    //    - planta COM calibração: values.size em METROS; redimensiona a aresta mantendo o
    //      start fixo e movendo o end na mesma direção.
    const sizeProvided = Number.isFinite(values.size) && values.size > 0
    if (sizeProvided && sizeSetsCalibration) {
      const calibration: FloorPlanCalibration = {
        pointA: { x: start.x, y: start.y },
        pointB: { x: end.x, y: end.y },
        realDistanceMeters: values.size
      }
      const updated = await setFloorPlanCalibration(floorPlan.id, calibration)
      if (updated) setFloorPlan(updated)
    } else if (sizeProvided && floorPlan.calibration) {
      const ppm = getPixelsPerMeter(floorPlan)
      if (ppm) {
        const targetLengthPx = values.size * ppm
        const scale = targetLengthPx / lengthPx
        if (Number.isFinite(scale) && scale > 0 && Math.abs(scale - 1) > 1e-6) {
          const newEnd = clampToImage(
            start.x + (end.x - start.x) * scale,
            start.y + (end.y - start.y) * scale,
            floorPlan.imageWidth,
            floorPlan.imageHeight
          )
          await moveWallVertex(end.id, newEnd.x, newEnd.y, floorPlan.imageWidth, floorPlan.imageHeight)
        }
      }
    }

    await reload()
  }

  /** Botão "Excluir" do painel — despacha conforme o tipo de seleção atual. */
  async function handleDeleteWallSelection(): Promise<void> {
    if (!wallSelection) return
    if (wallSelection.kind === 'wall') {
      pushWallUndoSnapshot()
      await deleteWall(wallSelection.id)
      setWallSelection(null)
      await reload()
      return
    }
    // Grupo: exclui só as próprias paredes do grupo (+ vértices órmãos delas) — sem cascata pra
    // paredes de fora, então sem modal de confirmação (diferente do vértice, ver abaixo).
    if (wallSelection.kind === 'group') {
      pushWallUndoSnapshot()
      await deleteWallGroup(floorPlan.id, wallSelection.id)
      setWallSelection(null)
      await reload()
      return
    }
    // Forma paramétrica (circle/arc) — ADR-046: 1 entidade, sem vértices no grafo, sem modal.
    if (wallSelection.kind === 'shape') {
      pushWallUndoSnapshot()
      await deleteWallShape(wallSelection.id)
      setWallSelection(null)
      await reload()
      return
    }
    const wallCount = await countWallsForVertex(floorPlan.id, wallSelection.id)
    if (wallCount === 0) {
      pushWallUndoSnapshot()
      await deleteWallVertex(wallSelection.id)
      setWallSelection(null)
      await reload()
      return
    }
    setConfirmingDeleteVertex({ id: wallSelection.id, wallCount })
  }

  function handleCancelDeleteVertex(): void {
    setConfirmingDeleteVertex(null)
  }

  async function handleConfirmDeleteVertex(): Promise<void> {
    if (!confirmingDeleteVertex) return
    const { id } = confirmingDeleteVertex
    pushWallUndoSnapshot()
    setConfirmingDeleteVertex(null)
    setWallSelection(null)
    await deleteWallVertex(id)
    await reload()
  }

  async function handleUndoWalls(): Promise<void> {
    if (wallUndoStack.length === 0) return
    const previous = wallUndoStack[wallUndoStack.length - 1]
    setWallUndoStack((stack) => stack.slice(0, -1))
    setWallRedoStack((stack) => [...stack, currentEditorSnapshot()])
    await restoreEditorSnapshot(previous)
  }

  async function handleRedoWalls(): Promise<void> {
    if (wallRedoStack.length === 0) return
    const next = wallRedoStack[wallRedoStack.length - 1]
    setWallRedoStack((stack) => stack.slice(0, -1))
    setWallUndoStack((stack) => [...stack, currentEditorSnapshot()])
    await restoreEditorSnapshot(next)
  }

  /** Atalhos de desfazer/refazer (paredes + calibração) — Cmd/Ctrl+Z e Cmd/Ctrl+Shift+Z (+ Ctrl+Y).
   * Ignora quando o foco está num campo de texto, pra não atropelar o undo nativo do navegador. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      const modifierPressed = event.metaKey || event.ctrlKey
      if (!modifierPressed) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        void handleUndoWalls()
      } else if ((key === 'z' && event.shiftKey) || (event.ctrlKey && key === 'y')) {
        event.preventDefault()
        void handleRedoWalls()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [wallUndoStack, wallRedoStack, vertices, walls, shapes, floorPlan])

  return (
    <div className="workspace">
      <Toolbar
        floorPlan={floorPlan}
        networkGroups={networkGroups}
        selectedNetworkKey={selectedNetworkKey}
        onSelectNetwork={selectNetwork}
        band={band}
        onBandChange={setBand}
        placingPoints={placingPoints}
        onTogglePlacingPoints={handleTogglePlacingPoints}
        onResetPoints={handleResetPoints}
        hasPoints={points.length > 0}
      />

      {placingPoints && !calibrating && !wallEditing && (
        <p className="workspace__notice">{t('notice.placingPointsOn')}</p>
      )}

      {calibrating && !pendingWallMeasure && pendingCalibrationPoints.length < 2 && (
        <p className="workspace__notice">
          {pendingCalibrationPoints.length === 0
            ? t('notice.rulerArmed')
            : t('notice.secondCalibrationPoint')}
        </p>
      )}

      {pendingCalibrationPoints.length === 2 && (
        <CalibrationDialog onConfirm={handleConfirmCalibrationDialog} onCancel={handleCancelCalibrationDialog} />
      )}

      {pendingWallMeasure && (
        <WallMeasureDialog
          initialSize={pendingWallMeasure.initialSize}
          sizeUnit={pendingWallMeasure.sizeSetsCalibration ? 'm' : pendingWallMeasure.sizeUnit}
          sizeSetsCalibration={pendingWallMeasure.sizeSetsCalibration}
          sizeEditable={pendingWallMeasure.sizeEditable}
          initialThickness={pendingWallMeasure.initialThickness}
          thicknessTargetCount={pendingWallMeasure.thicknessWallIds.length}
          onConfirm={handleConfirmWallMeasure}
          onCancel={handleCancelWallMeasure}
        />
      )}

      {confirmingReset && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{t('dialog.resetPoints.title')}</h2>
            <p>
              {t('dialog.resetPoints.body', { count: points.length, cannot: t('common.cannotBeUndone') })}
            </p>
            <div className="modal__actions">
              <button type="button" onClick={() => setConfirmingReset(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="modal__button--danger" onClick={handleConfirmReset}>
                {t('common.remove')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkMove && (() => {
        const pixelsPerMeter = getPixelsPerMeter(floorPlan)
        const distanceMeters =
          pixelsPerMeter !== null
            ? Math.hypot(pendingBulkMove.dx, pendingBulkMove.dy) / pixelsPerMeter
            : null
        const distanceText = distanceMeters !== null ? ` em ${distanceMeters.toFixed(1)}m` : ''
        return (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{t('dialog.bulkMove.title')}</h2>
            <p>
              {t('dialog.bulkMove.body', {
                count: points.length,
                distance: distanceText,
                cannot: t('common.cannotBeUndone')
              })}
            </p>
            <div className="modal__actions">
              <button type="button" onClick={handleCancelBulkMove}>
                {t('common.cancel')}
              </button>
              <button type="button" className="modal__button--danger" onClick={handleConfirmBulkMove}>
                {t('common.move')}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {!isAllNetworks &&
        selectedNetworkKey &&
        heatmapPoints.length > 0 &&
        heatmapPoints.length < MIN_HEATMAP_POINTS && (
          <p className="workspace__notice">
            {t('notice.heatmapTooFewPoints', { count: heatmapPoints.length, min: MIN_HEATMAP_POINTS })}
          </p>
        )}

      <div className="workspace__body">
        <div className="workspace__canvas-area">
          <FloorPlanCanvas
            floorPlan={floorPlan}
            points={points}
            selectedPointId={selectedPointId}
            heatmapInput={showHeatmap ? heatmapInput : { points: [] }}
            pointReadingById={pointReadingById}
            onSelectPoint={selectPoint}
            onCreatePoint={handleCreatePoint}
            placingPoints={placingPoints && !calibrating && !wallEditing}
            onMovePoint={handleMovePoint}
            onBulkMovePoints={handleBulkMovePoints}
            bulkMoveResetSignal={bulkMoveResetSignal}
            calibrating={calibrating}
            pendingCalibrationPoints={pendingCalibrationPoints}
            onCalibrationClick={handleCalibrationClick}
            showPoints={showMeasurements}
            showImage={showImage}
            wallEditor={{
              visible: showWalls,
              active: wallEditing,
              tool: wallTool,
              vertices,
              walls,
              shapes,
              selection: wallSelection,
              onSelect: setWallSelection,
              onCreateWall: handleCreateWall,
              onCreateShape: handleCreateShape,
              onCreateWallShape: handleCreateWallShape,
              onMoveVertex: handleMoveVertex,
              onMoveWall: handleMoveWall,
              onMoveGroup: handleMoveGroup,
              onMoveShape: handleMoveShape,
              onUpdateShapeHandle: handleUpdateShapeHandle,
              rulerActive: calibrating && !wallEditing,
              onMeasureWall: handleMeasureWall
            }}
          />

          {selectedPoint && !calibrating && !wallEditing && (
            <PointPanel
              project={project}
              floorPlan={floorPlan}
              point={selectedPoint}
              index={selectedPointIndex}
              readings={readingsByPoint.get(selectedPoint.id) ?? []}
              scanAvailable={scanAvailable}
              onImportCsv={handleImportCsv}
              onLiveCapture={handleLiveCapture}
              onDelete={handleDeletePoint}
              onClose={() => selectPoint(null)}
            />
          )}

          {showHeatmap && selectedNetworkKey && <Legend />}
        </div>

        <WallEditorPanel
          showHeatmap={showHeatmap}
          onToggleShowHeatmap={setShowHeatmap}
          showMeasurements={showMeasurements}
          onToggleShowMeasurements={setShowMeasurements}
          showImage={showImage}
          onToggleShowImage={setShowImage}
          showWalls={showWalls}
          onToggleShowWalls={setShowWalls}
          calibrating={calibrating}
          onToggleCalibrate={handleToggleCalibrate}
          wallEditing={wallEditing}
          wallTool={wallTool}
          onSelectWallTool={handleSelectWallTool}
          hasSelection={wallSelection !== null}
          onDeleteSelection={handleDeleteWallSelection}
          totalWallCount={walls.length}
          allWallsStrokeWidth={allWallsStrokeWidth}
          onChangeAllWallsStrokeWidth={handleChangeAllWallsStrokeWidth}
          canUndo={wallUndoStack.length > 0}
          canRedo={wallRedoStack.length > 0}
          onUndo={handleUndoWalls}
          onRedo={handleRedoWalls}
        />
      </div>

      {confirmingDeleteVertex && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{t('dialog.deleteVertex.title')}</h2>
            <p>
              {t('dialog.deleteVertex.body', {
                count: confirmingDeleteVertex.wallCount,
                cannot: t('common.cannotBeUndone')
              })}
            </p>
            <div className="modal__actions">
              <button type="button" onClick={handleCancelDeleteVertex}>
                {t('common.cancel')}
              </button>
              <button type="button" className="modal__button--danger" onClick={handleConfirmDeleteVertex}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAllNetworks && channelUsage.length > 0 && <ChannelChart entries={channelUsage} />}

      {error && (
        <div className="workspace__error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label={t('common.closeErrorAriaLabel')}>
            <CloseIcon width={16} height={16} />
          </button>
        </div>
      )}
    </div>
  )
}
