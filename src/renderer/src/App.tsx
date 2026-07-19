import { useCallback, useEffect, useMemo, useState } from 'react'
import { listFloorPlans, listProjects, updateFloorPlan, updateProject } from './modules/projects/api'
import type { FloorPlan, Project } from './types/domain'
import { ProjectSetup } from './components/ProjectSetup'
import { Sidebar } from './components/Sidebar'
import { NewFloorPlanDialog } from './components/NewFloorPlanDialog'
import { Workspace } from './components/Workspace'
import { useUiStore } from './store/uiStore'
import { ALL_NETWORKS_KEY } from './modules/readings/network'

type DialogState = { kind: 'new-project' } | { kind: 'new-floor-plan'; project: Project } | null

export function App(): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [floorPlansByProject, setFloorPlansByProject] = useState<Map<string, FloorPlan[]>>(new Map())
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeFloorPlanId, setActiveFloorPlanId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)

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
      />

      <div className="app-main">
        {activeFloorPlan && activeProject ? (
          <Workspace key={activeFloorPlan.id} project={activeProject} floorPlan={activeFloorPlan} />
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
    </div>
  )
}
