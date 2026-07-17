import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FloorPlan, FloorPlanCalibration, MeasurementPoint, StoredNetworkReading } from '../types/domain'
import { createPoint, deleteAllPointsForFloorPlan, deletePoint, listPoints, movePoint } from '../modules/points/api'
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
import { Toolbar } from './Toolbar'
import { FloorPlanCanvas } from './FloorPlanCanvas'
import { PointPanel } from './PointPanel'
import { Legend } from './Legend'
import { ChannelChart } from './ChannelChart'
import { CalibrationDialog } from './CalibrationDialog'

interface Props {
  floorPlan: FloorPlan
}

const MIN_HEATMAP_POINTS = 2

export function Workspace({ floorPlan: initialFloorPlan }: Props): JSX.Element {
  const [floorPlan, setFloorPlan] = useState(initialFloorPlan)
  const [points, setPoints] = useState<MeasurementPoint[]>([])
  const [readingsByPoint, setReadingsByPoint] = useState<Map<string, StoredNetworkReading[]>>(new Map())
  const [scanAvailable, setScanAvailable] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [band, setBand] = useState<Band>('all')
  const [calibrating, setCalibrating] = useState(false)
  const [pendingCalibrationPoints, setPendingCalibrationPoints] = useState<Array<{ x: number; y: number }>>([])
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPointId = useUiStore((state) => state.selectedPointId)
  const selectPoint = useUiStore((state) => state.selectPoint)
  const selectedNetworkKey = useUiStore((state) => state.selectedNetworkKey)
  const selectNetwork = useUiStore((state) => state.selectNetwork)

  useEffect(() => {
    setFloorPlan(initialFloorPlan)
  }, [initialFloorPlan])

  const reload = useCallback(async () => {
    const [pts, readings] = await Promise.all([
      listPoints(floorPlan.id),
      listReadingsForFloorPlan(floorPlan.id)
    ])
    setPoints(pts)
    setReadingsByPoint(readings)
  }, [floorPlan.id])

  useEffect(() => {
    reload()
  }, [reload])

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

  function handleToggleCalibrate(): void {
    if (calibrating) {
      setCalibrating(false)
      setPendingCalibrationPoints([])
      return
    }
    selectPoint(null)
    setPendingCalibrationPoints([])
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
        <FloorPlanCanvas
          floorPlan={floorPlan}
          points={points}
          selectedPointId={selectedPointId}
          heatmapInput={showHeatmap ? heatmapInput : { points: [] }}
          pointReadingById={pointReadingById}
          onSelectPoint={selectPoint}
          onCreatePoint={handleCreatePoint}
          onMovePoint={handleMovePoint}
          calibrating={calibrating}
          pendingCalibrationPoints={pendingCalibrationPoints}
          onCalibrationClick={handleCalibrationClick}
        />

        {selectedPoint && !calibrating && (
          <PointPanel
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

      {isAllNetworks && channelUsage.length > 0 && <ChannelChart entries={channelUsage} />}

      {error && (
        <div className="workspace__error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Fechar erro">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
