import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FloorPlan, Project } from '../types/domain'
import {
  AddIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DeleteIcon,
  DownloadIcon,
  EditIcon,
  ImageIcon,
  MoreVertIcon,
  UploadIcon
} from './icons'
import { PreferencesMenu } from './PreferencesMenu'

interface Props {
  projects: Project[]
  floorPlansByProject: Map<string, FloorPlan[]>
  activeFloorPlanId: string | null
  onSelectFloorPlan: (project: Project, floorPlan: FloorPlan) => void
  onNewProject: () => void
  onNewFloorPlan: (project: Project) => void
  onRenameProject: (project: Project, name: string) => void
  onRenameFloorPlan: (floorPlan: FloorPlan, name: string) => void
  onExportProject: (project: Project) => void
  onExportFloorPlan: (project: Project, floorPlan: FloorPlan) => void
  onImportProject: (project: Project, file: File) => void
  onImportFloorPlan: (floorPlan: FloorPlan, file: File) => void
  onReplaceFloorPlanImage: (floorPlan: FloorPlan, file: File) => void
  onDeleteFloorPlan: (floorPlan: FloorPlan) => void
}

type EditTarget = { kind: 'project'; id: string } | { kind: 'floor-plan'; id: string } | null
type ImportTarget = { kind: 'project'; project: Project } | { kind: 'floor-plan'; floorPlan: FloorPlan } | null

export function Sidebar({
  projects,
  floorPlansByProject,
  activeFloorPlanId,
  onSelectFloorPlan,
  onNewProject,
  onNewFloorPlan,
  onRenameProject,
  onRenameFloorPlan,
  onExportProject,
  onExportFloorPlan,
  onImportProject,
  onImportFloorPlan,
  onReplaceFloorPlanImage,
  onDeleteFloorPlan
}: Props): JSX.Element {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState<EditTarget>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [importTarget, setImportTarget] = useState<ImportTarget>(null)
  const [replaceImageTarget, setReplaceImageTarget] = useState<FloorPlan | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const replaceImageInputRef = useRef<HTMLInputElement>(null)

  function handleImportFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && importTarget) {
      if (importTarget.kind === 'project') {
        onImportProject(importTarget.project, file)
      } else {
        onImportFloorPlan(importTarget.floorPlan, file)
      }
    }
    setImportTarget(null)
  }

  function handleReplaceImageFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && replaceImageTarget) {
      onReplaceFloorPlanImage(replaceImageTarget, file)
    }
    setReplaceImageTarget(null)
  }

  /** Fecha o menu "⋮" aberto ao clicar fora dele — não precisa fechar em Escape/foco, é só um atalho de conveniência. */
  useEffect(() => {
    if (!openMenuId) return
    function handleClickOutside(event: globalThis.MouseEvent): void {
      if (event.target instanceof Element && !event.target.closest('.sidebar__menu')) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

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
          title={t('sidebar.expandSurveysTitle')}
        >
          <ChevronRightIcon width={16} height={16} />
        </button>
      </nav>
    )
  }

  return (
    <nav className="sidebar">
      <input ref={importInputRef} type="file" accept=".csv,.txt" hidden onChange={handleImportFileChange} />
      <input
        ref={replaceImageInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        hidden
        onChange={handleReplaceImageFileChange}
      />
      <div className="sidebar__header">
        <h2>{t('sidebar.surveys')}</h2>
        <div className="sidebar__header-actions">
          <button type="button" className="sidebar__new-project" onClick={onNewProject} title={t('sidebar.newSurveyTitle')}>
            <AddIcon width={16} height={16} />
          </button>
          <button
            type="button"
            className="sidebar__toggle"
            onClick={() => setCollapsed(true)}
            title={t('sidebar.collapseTitle')}
          >
            <ChevronLeftIcon width={16} height={16} />
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
                    <div className="sidebar__menu">
                      <button
                        type="button"
                        className="sidebar__menu-btn"
                        onClick={() => setOpenMenuId((id) => (id === project.id ? null : project.id))}
                        title={t('sidebar.moreOptionsTitle')}
                      >
                        <MoreVertIcon width={16} height={16} />
                      </button>
                      {openMenuId === project.id && (
                        <div className="sidebar__menu-dropdown">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing({ kind: 'project', id: project.id })
                              setOpenMenuId(null)
                            }}
                          >
                            <EditIcon width={16} height={16} />
                            {t('sidebar.rename')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setImportTarget({ kind: 'project', project })
                              setOpenMenuId(null)
                              importInputRef.current?.click()
                            }}
                          >
                            <UploadIcon width={16} height={16} />
                            {t('sidebar.import')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onExportProject(project)
                              setOpenMenuId(null)
                            }}
                          >
                            <DownloadIcon width={16} height={16} />
                            {t('sidebar.export')}
                          </button>
                        </div>
                      )}
                    </div>
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
                          <div className="sidebar__menu">
                            <button
                              type="button"
                              className="sidebar__menu-btn"
                              onClick={() => setOpenMenuId((id) => (id === floorPlan.id ? null : floorPlan.id))}
                              title={t('sidebar.moreOptionsTitle')}
                            >
                              <MoreVertIcon width={16} height={16} />
                            </button>
                            {openMenuId === floorPlan.id && (
                              <div className="sidebar__menu-dropdown">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditing({ kind: 'floor-plan', id: floorPlan.id })
                                    setOpenMenuId(null)
                                  }}
                                >
                                  <EditIcon width={16} height={16} />
                                  {t('sidebar.rename')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplaceImageTarget(floorPlan)
                                    setOpenMenuId(null)
                                    replaceImageInputRef.current?.click()
                                  }}
                                >
                                  <ImageIcon width={16} height={16} />
                                  {t('sidebar.replaceImage')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setImportTarget({ kind: 'floor-plan', floorPlan })
                                    setOpenMenuId(null)
                                    importInputRef.current?.click()
                                  }}
                                >
                                  <UploadIcon width={16} height={16} />
                                  {t('sidebar.import')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onExportFloorPlan(project, floorPlan)
                                    setOpenMenuId(null)
                                  }}
                                >
                                  <DownloadIcon width={16} height={16} />
                                  {t('sidebar.export')}
                                </button>
                                <button
                                  type="button"
                                  className="sidebar__menu-item--danger"
                                  onClick={() => {
                                    onDeleteFloorPlan(floorPlan)
                                    setOpenMenuId(null)
                                  }}
                                >
                                  <DeleteIcon width={16} height={16} />
                                  {t('sidebar.deleteFloorPlan')}
                                </button>
                              </div>
                            )}
                          </div>
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
                    <AddIcon width={14} height={14} /> {t('sidebar.newFloorPlan')}
                  </button>
                </li>
              </ul>
            </li>
          )
        })}
      </ul>

      <div className="sidebar__footer">
        <PreferencesMenu />
      </div>
    </nav>
  )
}
