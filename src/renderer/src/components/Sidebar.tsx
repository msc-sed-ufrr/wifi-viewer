import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { FloorPlan, Project } from '../types/domain'

interface Props {
  projects: Project[]
  floorPlansByProject: Map<string, FloorPlan[]>
  activeFloorPlanId: string | null
  onSelectFloorPlan: (project: Project, floorPlan: FloorPlan) => void
  onNewProject: () => void
  onNewFloorPlan: (project: Project) => void
  onRenameProject: (project: Project, name: string) => void
  onRenameFloorPlan: (floorPlan: FloorPlan, name: string) => void
}

type EditTarget = { kind: 'project'; id: string } | { kind: 'floor-plan'; id: string } | null

export function Sidebar({
  projects,
  floorPlansByProject,
  activeFloorPlanId,
  onSelectFloorPlan,
  onNewProject,
  onNewFloorPlan,
  onRenameProject,
  onRenameFloorPlan
}: Props): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState<EditTarget>(null)

  function commitEdit(value: string, project: Project, floorPlan?: FloorPlan): void {
    setEditing(null)
    if (floorPlan) {
      onRenameFloorPlan(floorPlan, value)
    } else {
      onRenameProject(project, value)
    }
  }

  function handleEditKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    project: Project,
    floorPlan?: FloorPlan
  ): void {
    if (event.key === 'Enter') {
      commitEdit(event.currentTarget.value, project, floorPlan)
    } else if (event.key === 'Escape') {
      setEditing(null)
    }
  }

  if (collapsed) {
    return (
      <nav className="sidebar sidebar--collapsed">
        <button
          type="button"
          className="sidebar__toggle"
          onClick={() => setCollapsed(false)}
          title="Expandir levantamentos"
        >
          »
        </button>
      </nav>
    )
  }

  return (
    <nav className="sidebar">
      <div className="sidebar__header">
        <h2>Levantamentos</h2>
        <div className="sidebar__header-actions">
          <button type="button" className="sidebar__new-project" onClick={onNewProject} title="Novo levantamento">
            +
          </button>
          <button
            type="button"
            className="sidebar__toggle"
            onClick={() => setCollapsed(true)}
            title="Recolher"
          >
            «
          </button>
        </div>
      </div>

      <ul className="sidebar__projects">
        {projects.map((project) => {
          const floorPlans = floorPlansByProject.get(project.id) ?? []
          const isEditingProject = editing?.kind === 'project' && editing.id === project.id
          return (
            <li key={project.id} className="sidebar__project">
              <div className="sidebar__row">
                {isEditingProject ? (
                  <input
                    type="text"
                    className="sidebar__rename-input"
                    defaultValue={project.name}
                    autoFocus
                    onBlur={(e) => commitEdit(e.currentTarget.value, project)}
                    onKeyDown={(e) => handleEditKeyDown(e, project)}
                  />
                ) : (
                  <>
                    <div className="sidebar__project-name" title={project.name}>
                      {project.name}
                    </div>
                    <button
                      type="button"
                      className="sidebar__rename-btn"
                      onClick={() => setEditing({ kind: 'project', id: project.id })}
                      title="Renomear levantamento"
                    >
                      ✎
                    </button>
                  </>
                )}
              </div>
              <ul className="sidebar__floor-plans">
                {floorPlans.map((floorPlan) => {
                  const isEditingFloorPlan = editing?.kind === 'floor-plan' && editing.id === floorPlan.id
                  return (
                    <li key={floorPlan.id} className="sidebar__row">
                      {isEditingFloorPlan ? (
                        <input
                          type="text"
                          className="sidebar__rename-input"
                          defaultValue={floorPlan.name}
                          autoFocus
                          onBlur={(e) => commitEdit(e.currentTarget.value, project, floorPlan)}
                          onKeyDown={(e) => handleEditKeyDown(e, project, floorPlan)}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            className={
                              floorPlan.id === activeFloorPlanId
                                ? 'sidebar__floor-plan sidebar__floor-plan--active'
                                : 'sidebar__floor-plan'
                            }
                            title={floorPlan.name}
                            onClick={() => onSelectFloorPlan(project, floorPlan)}
                          >
                            {floorPlan.name}
                          </button>
                          <button
                            type="button"
                            className="sidebar__rename-btn"
                            onClick={() => setEditing({ kind: 'floor-plan', id: floorPlan.id })}
                            title="Renomear planta"
                          >
                            ✎
                          </button>
                        </>
                      )}
                    </li>
                  )
                })}
                <li>
                  <button
                    type="button"
                    className="sidebar__add-floor-plan"
                    onClick={() => onNewFloorPlan(project)}
                  >
                    + Nova planta
                  </button>
                </li>
              </ul>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
