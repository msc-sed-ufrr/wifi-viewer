import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteFloorPlan,
  listFloorPlans,
  listProjects,
  replaceFloorPlanImage,
  updateFloorPlan,
  updateProject
} from './modules/projects/api'
import { createPoint, listPoints, movePoint } from './modules/points/api'
import { addReadings, listReadingsForFloorPlan } from './modules/readings/api'
import { buildCsvFilename, exportReadingsToCsv } from './modules/export/csvExporter'
import { parseConsolidatedCsv, resolveImportedPosition } from './modules/import/consolidatedImport'
import { downloadTextFile } from './lib/downloadFile'
import { loadImageDimensions, validateFloorPlanImageFile } from './lib/imageDimensions'
import type { FloorPlan, MeasurementPoint, Project } from './types/domain'
import { ProjectSetup } from './components/ProjectSetup'
import { Sidebar } from './components/Sidebar'
import { NewFloorPlanDialog } from './components/NewFloorPlanDialog'
import { Workspace } from './components/Workspace'
import { useUiStore } from './store/uiStore'
import { ALL_NETWORKS_KEY } from './modules/readings/network'

type DialogState = { kind: 'new-project' } | { kind: 'new-floor-plan'; project: Project } | null

/** Resumo em texto do que resolveImportedPosition fez durante um import (ver ADR-036), pro banner de floorPlanNotice. */
function describePositionAdjustments(rescaledCount: number, clampedCount: number): string | null {
  const parts: string[] = []
  if (rescaledCount > 0) {
    parts.push(
      `${rescaledCount} ${rescaledCount === 1 ? 'ponto reposicionado' : 'pontos reposicionados'} proporcionalmente (dimensões da planta de origem diferem da atual).`
    )
  }
  if (clampedCount > 0) {
    parts.push(
      `${clampedCount} ${clampedCount === 1 ? 'ponto ficou' : 'pontos ficaram'} fora dos limites da planta e ${clampedCount === 1 ? 'foi preso' : 'foram presos'} à borda (sem dimensão de origem no CSV pra reescalar corretamente).`
    )
  }
  return parts.length > 0 ? parts.join(' ') : null
}

export function App(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [floorPlansByProject, setFloorPlansByProject] = useState<Map<string, FloorPlan[]>>(new Map())
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeFloorPlanId, setActiveFloorPlanId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [deletingFloorPlan, setDeletingFloorPlan] = useState<{ floorPlan: FloorPlan; pointCount: number } | null>(
    null
  )
  /** Banner de feedback pra operações da sidebar (import, substituir imagem) — não é só de import apesar do formato. */
  const [floorPlanNotice, setFloorPlanNotice] = useState<string | null>(null)
  const [pendingImageReplace, setPendingImageReplace] = useState<{
    floorPlan: FloorPlan
    file: File
    width: number
    height: number
    points: MeasurementPoint[]
    hadCalibration: boolean
  } | null>(null)
  /** Incrementado pra forçar o Workspace da planta ativa a remontar e recarregar pontos/leituras após um import pela sidebar (ver handleImportFloorPlan). */
  const [workspaceReloadNonce, setWorkspaceReloadNonce] = useState(0)

  const loadAll = useCallback(async (preferProjectId?: string, preferFloorPlanId?: string) => {
    const loadedProjects = await listProjects()
    const entries = await Promise.all(
      loadedProjects.map(async (project) => [project.id, await listFloorPlans(project.id)] as const)
    )
    const map = new Map(entries)
    setProjects(loadedProjects)
    setFloorPlansByProject(map)

    const projectId = preferProjectId ?? loadedProjects.at(-1)?.id ?? null
    setActiveProjectId(projectId)

    const floorPlans = projectId ? (map.get(projectId) ?? []) : []
    setActiveFloorPlanId(preferFloorPlanId ?? floorPlans.at(0)?.id ?? null)
  }, [])

  useEffect(() => {
    loadAll().finally(() => setLoading(false))
  }, [loadAll])

  const activeFloorPlan = useMemo(() => {
    if (!activeProjectId || !activeFloorPlanId) return null
    return (floorPlansByProject.get(activeProjectId) ?? []).find((fp) => fp.id === activeFloorPlanId) ?? null
  }, [floorPlansByProject, activeProjectId, activeFloorPlanId])

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null

  const pendingImageReplaceMessage = pendingImageReplace
    ? [
        `Substituir a imagem de "${pendingImageReplace.floorPlan.name}"? A nova imagem tem dimensões diferentes` +
          ` (${pendingImageReplace.floorPlan.imageWidth}×${pendingImageReplace.floorPlan.imageHeight} → ` +
          `${pendingImageReplace.width}×${pendingImageReplace.height}).`,
        pendingImageReplace.points.length > 0
          ? `${pendingImageReplace.points.length === 1 ? 'O 1 ponto existente será reposicionado' : `Os ${pendingImageReplace.points.length} pontos existentes serão reposicionados`} proporcionalmente para a nova imagem.`
          : null,
        pendingImageReplace.hadCalibration
          ? 'A calibração de escala será removida — recalibre se necessário.'
          : null,
        'Essa ação não pode ser desfeita.'
      ]
        .filter((part): part is string => part !== null)
        .join(' ')
    : null

  function resetSelection(): void {
    useUiStore.getState().selectPoint(null)
    useUiStore.getState().selectNetwork(ALL_NETWORKS_KEY)
  }

  function handleSelectFloorPlan(project: Project, floorPlan: FloorPlan): void {
    resetSelection()
    setActiveProjectId(project.id)
    setActiveFloorPlanId(floorPlan.id)
  }

  async function handleDialogCreated(project: Project, floorPlan: FloorPlan): Promise<void> {
    setDialog(null)
    resetSelection()
    await loadAll(project.id, floorPlan.id)
  }

  async function handleRenameProject(project: Project, name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed || trimmed === project.name) return
    const updated = await updateProject(project.id, trimmed)
    if (!updated) return
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  /**
   * Chamado a partir da sidebar, então busca pontos/leituras na hora em vez de reaproveitar
   * o estado do Workspace — este pode ser de OUTRA planta, não necessariamente a ativa.
   */
  async function handleExportFloorPlan(project: Project, floorPlan: FloorPlan): Promise<void> {
    const [points, readingsByPoint] = await Promise.all([
      listPoints(floorPlan.id),
      listReadingsForFloorPlan(floorPlan.id)
    ])
    const pointReadings = points.map((point, index) => ({
      floorPlanName: floorPlan.name,
      floorPlanWidth: floorPlan.imageWidth,
      floorPlanHeight: floorPlan.imageHeight,
      point,
      label: `Ponto ${index + 1}`,
      readings: readingsByPoint.get(point.id) ?? []
    }))
    const csv = exportReadingsToCsv(pointReadings)
    const filename = buildCsvFilename(project.name, floorPlan.name)
    downloadTextFile(filename, csv)
  }

  /**
   * "Exportar" no menu do levantamento: um único CSV consolidado com as leituras de
   * TODAS as plantas do projeto (cada linha marcada com a planta de origem — ver
   * POINT_LOCATION_HEADER), ao contrário de handleExportFloorPlan, que gera um
   * arquivo por planta.
   */
  async function handleExportProject(project: Project): Promise<void> {
    const floorPlans = floorPlansByProject.get(project.id) ?? []
    const perFloorPlan = await Promise.all(
      floorPlans.map(async (floorPlan) => {
        const [points, readingsByPoint] = await Promise.all([
          listPoints(floorPlan.id),
          listReadingsForFloorPlan(floorPlan.id)
        ])
        return points.map((point, index) => ({
          floorPlanName: floorPlan.name,
          floorPlanWidth: floorPlan.imageWidth,
          floorPlanHeight: floorPlan.imageHeight,
          point,
          label: `Ponto ${index + 1}`,
          readings: readingsByPoint.get(point.id) ?? []
        }))
      })
    )
    const csv = exportReadingsToCsv(perFloorPlan.flat())
    const filename = buildCsvFilename(project.name)
    downloadTextFile(filename, csv)
  }

  /**
   * "Import consolidado": recria um ponto por posição presente no CSV (ver
   * parseConsolidatedCsv) e adiciona as leituras de cada um — não deduplica contra
   * pontos já existentes, então reimportar sobre uma planta não vazia duplica. Posições
   * passam por resolveImportedPosition (ADR-036): reescaladas proporcionalmente se o CSV
   * carrega as dimensões da planta de origem e elas diferem da planta alvo, sempre
   * presas aos limites da planta alvo no fim — visíveis mesmo quando erradas.
   */
  async function handleImportFloorPlan(floorPlan: FloorPlan, file: File): Promise<void> {
    try {
      const text = await file.text()
      const groups = parseConsolidatedCsv(text)
      let rescaledCount = 0
      let clampedCount = 0
      for (const group of groups) {
        const { x, y, adjustment } = resolveImportedPosition(group, floorPlan.imageWidth, floorPlan.imageHeight)
        if (adjustment === 'rescaled') rescaledCount++
        else if (adjustment === 'clamped') clampedCount++
        const point = await createPoint(floorPlan.id, x, y)
        await addReadings(point.id, group.readings)
      }
      setFloorPlanNotice(describePositionAdjustments(rescaledCount, clampedCount))
      if (floorPlan.id === activeFloorPlanId) {
        setWorkspaceReloadNonce((n) => n + 1)
      }
    } catch (error) {
      setFloorPlanNotice(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * "Importar" no menu do levantamento: casa cada grupo do CSV consolidado com uma
   * planta do projeto pelo nome (ver LocatedReadingGroup.floorPlanName) e importa nela,
   * igual a handleImportFloorPlan. Nomes de planta sem correspondência não criam nada —
   * ficam de fora e são reportados no banner de erro. Criar a planta faltante
   * automaticamente (sem imagem) ficou fora do escopo desta etapa.
   */
  async function handleImportProject(project: Project, file: File): Promise<void> {
    try {
      const text = await file.text()
      const groups = parseConsolidatedCsv(text)
      const floorPlans = floorPlansByProject.get(project.id) ?? []
      const floorPlanByName = new Map(floorPlans.map((fp) => [fp.name, fp]))
      const unmatchedNames = new Set<string>()
      let touchedActiveFloorPlan = false
      let rescaledCount = 0
      let clampedCount = 0

      for (const group of groups) {
        const floorPlan = floorPlanByName.get(group.floorPlanName)
        if (!floorPlan) {
          unmatchedNames.add(group.floorPlanName)
          continue
        }
        const { x, y, adjustment } = resolveImportedPosition(group, floorPlan.imageWidth, floorPlan.imageHeight)
        if (adjustment === 'rescaled') rescaledCount++
        else if (adjustment === 'clamped') clampedCount++
        const point = await createPoint(floorPlan.id, x, y)
        await addReadings(point.id, group.readings)
        if (floorPlan.id === activeFloorPlanId) {
          touchedActiveFloorPlan = true
        }
      }

      const messages = [
        unmatchedNames.size > 0
          ? `Plantas não encontradas neste levantamento (linhas ignoradas): ${Array.from(unmatchedNames).join(', ')}`
          : null,
        describePositionAdjustments(rescaledCount, clampedCount)
      ].filter((message): message is string => message !== null)
      setFloorPlanNotice(messages.length > 0 ? messages.join(' ') : null)

      if (touchedActiveFloorPlan) {
        setWorkspaceReloadNonce((n) => n + 1)
      }
    } catch (error) {
      setFloorPlanNotice(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleRenameFloorPlan(floorPlan: FloorPlan, name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed || trimmed === floorPlan.name) return
    const updated = await updateFloorPlan(floorPlan.id, trimmed)
    if (!updated) return
    setFloorPlansByProject((prev) => {
      const next = new Map(prev)
      const list = next.get(updated.projectId) ?? []
      next.set(
        updated.projectId,
        list.map((fp) => (fp.id === updated.id ? updated : fp))
      )
      return next
    })
  }

  /**
   * Busca a contagem de pontos na hora (pode ser de uma planta que não é a ativa, então
   * não dá pra reaproveitar o estado do Workspace) só pra deixar a confirmação informativa
   * — mesmo padrão do "Resetar pontos" em Workspace.tsx.
   */
  async function handleRequestDeleteFloorPlan(floorPlan: FloorPlan): Promise<void> {
    const points = await listPoints(floorPlan.id)
    setDeletingFloorPlan({ floorPlan, pointCount: points.length })
  }

  /**
   * Modal próprio em vez de window.confirm() — mesmo motivo do ADR-016 (reset de pontos):
   * no Electron empacotado, o diálogo nativo rouba o foco da janela.
   */
  async function handleConfirmDeleteFloorPlan(): Promise<void> {
    if (!deletingFloorPlan) return
    const { floorPlan } = deletingFloorPlan
    setDeletingFloorPlan(null)

    await deleteFloorPlan(floorPlan.id)

    const remaining = (floorPlansByProject.get(floorPlan.projectId) ?? []).filter((fp) => fp.id !== floorPlan.id)
    setFloorPlansByProject((prev) => {
      const next = new Map(prev)
      next.set(floorPlan.projectId, remaining)
      return next
    })

    if (floorPlan.id === activeFloorPlanId) {
      resetSelection()
      setActiveFloorPlanId(remaining.at(0)?.id ?? null)
    }
  }

  /**
   * Grava a troca de imagem e reposiciona os pontos passados (já resolvidos contra as
   * dimensões antigas de `floorPlan`, capturadas antes da troca — ver resolveImportedPosition).
   * `points` vem vazio quando nada precisa mudar (dimensões iguais, ou planta vazia).
   */
  async function applyImageReplace(
    floorPlan: FloorPlan,
    file: File,
    width: number,
    height: number,
    points: MeasurementPoint[]
  ): Promise<void> {
    const updated = await replaceFloorPlanImage(floorPlan.id, file, width, height)
    if (!updated) return

    for (const point of points) {
      const { x, y } = resolveImportedPosition(
        { x: point.x, y: point.y, floorPlanWidth: floorPlan.imageWidth, floorPlanHeight: floorPlan.imageHeight },
        width,
        height
      )
      await movePoint(point.id, x, y)
    }

    setFloorPlansByProject((prev) => {
      const next = new Map(prev)
      const list = next.get(updated.projectId) ?? []
      next.set(
        updated.projectId,
        list.map((fp) => (fp.id === updated.id ? updated : fp))
      )
      return next
    })

    if (floorPlan.id === activeFloorPlanId) {
      setWorkspaceReloadNonce((n) => n + 1)
    }
  }

  /**
   * "Substituir imagem" na sidebar. Dimensões iguais (ou planta sem pontos/calibração) —
   * aplica na hora, nada muda de posição. Dimensões diferentes com algo em jogo — pede
   * confirmação: os pontos existentes são reposicionados proporcionalmente (mesma
   * resolveImportedPosition do import, ADR-036), sempre dentro dos limites — como as
   * posições atuais já são válidas para as dimensões antigas, a reescala nunca precisa
   * de clamp aqui (ver ADR-039). A calibração (baseada nos pixels antigos) é descartada.
   */
  async function handleReplaceFloorPlanImage(floorPlan: FloorPlan, file: File): Promise<void> {
    const validationError = validateFloorPlanImageFile(file)
    if (validationError) {
      setFloorPlanNotice(validationError)
      return
    }

    try {
      const { width, height } = await loadImageDimensions(file)
      const dimensionsChanged = width !== floorPlan.imageWidth || height !== floorPlan.imageHeight

      if (!dimensionsChanged) {
        await applyImageReplace(floorPlan, file, width, height, [])
        return
      }

      const points = await listPoints(floorPlan.id)
      const hadCalibration = floorPlan.calibration !== undefined

      if (points.length === 0 && !hadCalibration) {
        await applyImageReplace(floorPlan, file, width, height, [])
        return
      }

      setPendingImageReplace({ floorPlan, file, width, height, points, hadCalibration })
    } catch (error) {
      setFloorPlanNotice(error instanceof Error ? error.message : String(error))
    }
  }

  function handleCancelReplaceImage(): void {
    setPendingImageReplace(null)
  }

  async function handleConfirmReplaceImage(): Promise<void> {
    if (!pendingImageReplace) return
    const { floorPlan, file, width, height, points, hadCalibration } = pendingImageReplace
    setPendingImageReplace(null)
    await applyImageReplace(floorPlan, file, width, height, points)
    setFloorPlanNotice(
      hadCalibration ? 'Calibração de escala removida — as dimensões da planta mudaram, recalibre se necessário.' : null
    )
  }

  if (loading) {
    return <div className="app-loading">Carregando…</div>
  }

  if (projects.length === 0) {
    return <ProjectSetup onCreated={handleDialogCreated} />
  }

  return (
    <div className="app-shell">
      <Sidebar
        projects={projects}
        floorPlansByProject={floorPlansByProject}
        activeFloorPlanId={activeFloorPlanId}
        onSelectFloorPlan={handleSelectFloorPlan}
        onNewProject={() => setDialog({ kind: 'new-project' })}
        onNewFloorPlan={(project) => setDialog({ kind: 'new-floor-plan', project })}
        onRenameProject={handleRenameProject}
        onRenameFloorPlan={handleRenameFloorPlan}
        onExportProject={handleExportProject}
        onExportFloorPlan={handleExportFloorPlan}
        onImportProject={handleImportProject}
        onImportFloorPlan={handleImportFloorPlan}
        onReplaceFloorPlanImage={handleReplaceFloorPlanImage}
        onDeleteFloorPlan={handleRequestDeleteFloorPlan}
      />

      <div className="app-main">
        {activeFloorPlan && activeProject ? (
          <Workspace
            key={`${activeFloorPlan.id}:${workspaceReloadNonce}`}
            project={activeProject}
            floorPlan={activeFloorPlan}
          />
        ) : (
          <div className="app-empty">
            <p>Este levantamento ainda não tem plantas.</p>
            {activeProject && (
              <button type="button" onClick={() => setDialog({ kind: 'new-floor-plan', project: activeProject })}>
                + Nova planta
              </button>
            )}
          </div>
        )}
      </div>

      {dialog?.kind === 'new-project' && (
        <NewFloorPlanDialog onCreated={handleDialogCreated} onCancel={() => setDialog(null)} />
      )}
      {dialog?.kind === 'new-floor-plan' && (
        <NewFloorPlanDialog
          project={dialog.project}
          onCreated={handleDialogCreated}
          onCancel={() => setDialog(null)}
        />
      )}

      {deletingFloorPlan && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Excluir planta</h2>
            <p>
              Excluir "{deletingFloorPlan.floorPlan.name}"
              {deletingFloorPlan.pointCount > 0
                ? ` e ${deletingFloorPlan.pointCount === 1 ? 'seu 1 ponto' : `seus ${deletingFloorPlan.pointCount} pontos`} de medição (com as leituras)`
                : ''}
              ? Essa ação não pode ser desfeita.
            </p>
            <div className="modal__actions">
              <button type="button" onClick={() => setDeletingFloorPlan(null)}>
                Cancelar
              </button>
              <button type="button" className="modal__button--danger" onClick={handleConfirmDeleteFloorPlan}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImageReplace && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Substituir imagem</h2>
            <p>{pendingImageReplaceMessage}</p>
            <div className="modal__actions">
              <button type="button" onClick={handleCancelReplaceImage}>
                Cancelar
              </button>
              <button type="button" className="modal__button--danger" onClick={handleConfirmReplaceImage}>
                Substituir
              </button>
            </div>
          </div>
        </div>
      )}

      {floorPlanNotice && (
        <div className="workspace__error" role="alert">
          {floorPlanNotice}
          <button type="button" onClick={() => setFloorPlanNotice(null)} aria-label="Fechar erro">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
