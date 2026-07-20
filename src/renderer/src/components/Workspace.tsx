import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  FloorPlan,
  FloorPlanCalibration,
  MeasurementPoint,
  Project,
  StoredNetworkReading,
  Wall,
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
import {
  countWallsForVertex,
  createWall,
  createWallVertex,
  deleteWall,
  deleteWallVertex,
  listWallVertices,
  listWalls,
  moveWall,
  moveWallVertex,
  replaceWallsForFloorPlan
} from '../modules/walls/api'
import { Toolbar } from './Toolbar'
import { FloorPlanCanvas } from './FloorPlanCanvas'
import { PointPanel } from './PointPanel'
import { Legend } from './Legend'
import { ChannelChart } from './ChannelChart'
import { CalibrationDialog } from './CalibrationDialog'
import { CloseIcon } from './icons'
import { WallEditorPanel } from './WallEditorPanel'
import type { SnapPoint, WallSelection } from './WallLayer'

interface Props {
  project: Project
  floorPlan: FloorPlan
}

const MIN_HEATMAP_POINTS = 2

export function Workspace({ project, floorPlan: initialFloorPlan }: Props): JSX.Element {
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
  const [wallEditing, setWallEditing] = useState(false)
  const [wallTool, setWallTool] = useState<'draw' | 'select'>('draw')
  const [wallSelection, setWallSelection] = useState<WallSelection | null>(null)
  const [confirmingDeleteVertex, setConfirmingDeleteVertex] = useState<{ id: string; wallCount: number } | null>(null)
  /** Undo/redo das ações de parede (ADR-044) — cada item é um snapshot completo de vértices+paredes
   * ANTES da ação correspondente. Baseado em snapshot, não em inverter cada ação manualmente. */
  const [wallUndoStack, setWallUndoStack] = useState<Array<{ vertices: WallVertex[]; walls: Wall[] }>>([])
  const [wallRedoStack, setWallRedoStack] = useState<Array<{ vertices: WallVertex[]; walls: Wall[] }>>([])
  /** Painel de camadas (ADR-041) — cada uma só alterna visibilidade, nunca apaga dado. */
  const [showMeasurements, setShowMeasurements] = useState(true)
  const [showImage, setShowImage] = useState(true)
  const [showWalls, setShowWalls] = useState(true)

  const selectedPointId = useUiStore((state) => state.selectedPointId)
  const selectPoint = useUiStore((state) => state.selectPoint)
  const selectedNetworkKey = useUiStore((state) => state.selectedNetworkKey)
  const selectNetwork = useUiStore((state) => state.selectNetwork)

  useEffect(() => {
    setFloorPlan(initialFloorPlan)
  }, [initialFloorPlan])

  const reload = useCallback(async () => {
    const [pts, readings, vs, ws] = await Promise.all([
      listPoints(floorPlan.id),
      listReadingsForFloorPlan(floorPlan.id),
      listWallVertices(floorPlan.id),
      listWalls(floorPlan.id)
    ])
    setPoints(pts)
    setReadingsByPoint(readings)
    setVertices(vs)
    setWalls(ws)
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

  const pendingBulkMoveDistanceMeters =
    pendingBulkMove && pixelsPerMeter
      ? Math.hypot(pendingBulkMove.dx, pendingBulkMove.dy) / pixelsPerMeter
      : null

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
      setError(err instanceof Error ? err.message : String(err))
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
      setError(err instanceof Error ? err.message : String(err))
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
      return
    }
    selectPoint(null)
    setPendingCalibrationPoints([])
    setWallEditing(false)
    setWallSelection(null)
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

    const calibration: FloorPlanCalibration = { pointA, pointB, realDistanceMeters }
    const updated = await setFloorPlanCalibration(floorPlan.id, calibration)
    if (updated) setFloorPlan(updated)
  }

  /** Clicar na ferramenta já ativa entra/sai do modo de edição de paredes — mesmo comportamento de um app
   * vetorial (Illustrator/Corel): selecionar a ferramenta é o próprio gesto de ativar o modo, sem pré-toggle. */
  function handleSelectWallTool(tool: 'draw' | 'select'): void {
    if (wallEditing && wallTool === tool) {
      setWallEditing(false)
      setWallSelection(null)
      return
    }
    selectPoint(null)
    setCalibrating(false)
    setPendingCalibrationPoints([])
    setWallSelection(null)
    setWallTool(tool)
    setWallEditing(true)
  }

  /** Empilha o estado ATUAL (pré-mutação) de vértices/paredes — chamado no início de toda ação que muda a
   * geometria, antes de persistir. Uma nova ação sempre invalida o redo (mesma regra de qualquer editor). */
  function pushWallUndoSnapshot(): void {
    setWallUndoStack((stack) => [...stack, { vertices, walls }])
    setWallRedoStack([])
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
    await createWall(floorPlan.id, startVertexId, endVertexId)
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
    setWallRedoStack((stack) => [...stack, { vertices, walls }])
    setWallSelection(null)
    await replaceWallsForFloorPlan(floorPlan.id, previous.vertices, previous.walls)
    await reload()
  }

  async function handleRedoWalls(): Promise<void> {
    if (wallRedoStack.length === 0) return
    const next = wallRedoStack[wallRedoStack.length - 1]
    setWallRedoStack((stack) => stack.slice(0, -1))
    setWallUndoStack((stack) => [...stack, { vertices, walls }])
    setWallSelection(null)
    await replaceWallsForFloorPlan(floorPlan.id, next.vertices, next.walls)
    await reload()
  }

  /** Atalhos de desfazer/refazer de paredes (ADR-044) — Cmd/Ctrl+Z e Cmd/Ctrl+Shift+Z (+ Ctrl+Y, convenção Windows).
   * Ignora quando o foco está num campo de texto, pra não atropelar o undo nativo do navegador nesses campos. */
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
  }, [wallUndoStack, wallRedoStack, vertices, walls, floorPlan.id])

  return (
    <div className="workspace">
      <Toolbar
        floorPlan={floorPlan}
        networkGroups={networkGroups}
        selectedNetworkKey={selectedNetworkKey}
        onSelectNetwork={selectNetwork}
        showHeatmap={showHeatmap}
        onToggleHeatmap={setShowHeatmap}
        band={band}
        onBandChange={setBand}
        calibrating={calibrating}
        onToggleCalibrate={handleToggleCalibrate}
        onResetPoints={handleResetPoints}
        hasPoints={points.length > 0}
      />

      {calibrating && pendingCalibrationPoints.length < 2 && (
        <p className="workspace__notice">
          {pendingCalibrationPoints.length === 0
            ? 'Clique no primeiro ponto de referência na planta.'
            : 'Clique no segundo ponto de referência.'}
        </p>
      )}

      {pendingCalibrationPoints.length === 2 && (
        <CalibrationDialog onConfirm={handleConfirmCalibrationDialog} onCancel={handleCancelCalibrationDialog} />
      )}

      {confirmingReset && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Resetar pontos</h2>
            <p>
              Remover todos os {points.length} pontos desta planta e suas leituras? Essa ação não pode ser
              desfeita.
            </p>
            <div className="modal__actions">
              <button type="button" onClick={() => setConfirmingReset(false)}>
                Cancelar
              </button>
              <button type="button" className="modal__button--danger" onClick={handleConfirmReset}>
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkMove && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Mover todos os pontos</h2>
            <p>
              Deslocar {points.length === 1 ? 'o 1 ponto' : `os ${points.length} pontos`} desta planta
              {pendingBulkMoveDistanceMeters !== null ? ` em ${pendingBulkMoveDistanceMeters.toFixed(1)}m` : ''}?
              Essa ação não pode ser desfeita.
            </p>
            <div className="modal__actions">
              <button type="button" onClick={handleCancelBulkMove}>
                Cancelar
              </button>
              <button type="button" className="modal__button--danger" onClick={handleConfirmBulkMove}>
                Mover
              </button>
            </div>
          </div>
        </div>
      )}

      {!isAllNetworks &&
        selectedNetworkKey &&
        heatmapPoints.length > 0 &&
        heatmapPoints.length < MIN_HEATMAP_POINTS && (
          <p className="workspace__notice">
            Apenas {heatmapPoints.length} ponto com essa rede — adicione ao menos {MIN_HEATMAP_POINTS}{' '}
            pontos para um heatmap mais confiável.
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
              selection: wallSelection,
              onSelect: setWallSelection,
              onCreateWall: handleCreateWall,
              onMoveVertex: handleMoveVertex,
              onMoveWall: handleMoveWall
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
          showMeasurements={showMeasurements}
          onToggleShowMeasurements={setShowMeasurements}
          showImage={showImage}
          onToggleShowImage={setShowImage}
          showWalls={showWalls}
          onToggleShowWalls={setShowWalls}
          wallEditing={wallEditing}
          wallTool={wallTool}
          onSelectWallTool={handleSelectWallTool}
          hasSelection={wallSelection !== null}
          onDeleteSelection={handleDeleteWallSelection}
          canUndo={wallUndoStack.length > 0}
          canRedo={wallRedoStack.length > 0}
          onUndo={handleUndoWalls}
          onRedo={handleRedoWalls}
        />
      </div>

      {confirmingDeleteVertex && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Excluir vértice</h2>
            <p>
              Este vértice é usado por{' '}
              {confirmingDeleteVertex.wallCount === 1 ? '1 parede' : `${confirmingDeleteVertex.wallCount} paredes`}.
              Excluí-lo remove {confirmingDeleteVertex.wallCount === 1 ? 'essa parede também' : 'essas paredes também'}.
              Essa ação não pode ser desfeita.
            </p>
            <div className="modal__actions">
              <button type="button" onClick={handleCancelDeleteVertex}>
                Cancelar
              </button>
              <button type="button" className="modal__button--danger" onClick={handleConfirmDeleteVertex}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {isAllNetworks && channelUsage.length > 0 && <ChannelChart entries={channelUsage} />}

      {error && (
        <div className="workspace__error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Fechar erro">
            <CloseIcon width={16} height={16} />
          </button>
        </div>
      )}
    </div>
  )
}
