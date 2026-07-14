import { useState, type FormEvent } from 'react'
import { createFloorPlan, createProject } from '../modules/projects/api'
import { loadImageDimensions } from '../lib/imageDimensions'
import type { FloorPlan, Project } from '../types/domain'

interface Props {
  /** Ausente = também cria um novo levantamento antes de criar a planta. */
  project?: Project
  onCreated: (project: Project, floorPlan: FloorPlan) => void
  onCancel: () => void
}

export function NewFloorPlanDialog({ project, onCreated, onCancel }: Props): JSX.Element {
  const [projectName, setProjectName] = useState('')
  const [floorPlanName, setFloorPlanName] = useState(project ? '' : 'Planta 1')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!file) {
      setError('Selecione uma imagem da planta.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { width, height } = await loadImageDimensions(file)
      const targetProject = project ?? (await createProject(projectName.trim() || 'Meu levantamento'))
      const floorPlan = await createFloorPlan(
        targetProject.id,
        floorPlanName.trim() || 'Nova planta',
        file,
        width,
        height
      )
      onCreated(targetProject, floorPlan)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSubmit}>
        <h2>{project ? `Nova planta em "${project.name}"` : 'Novo levantamento'}</h2>

        {!project && (
          <label>
            Nome do levantamento
            <input
              autoFocus
              type="text"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Ex.: Prédio CIT"
            />
          </label>
        )}

        <label>
          Nome da planta
          <input
            type="text"
            value={floorPlanName}
            onChange={(event) => setFloorPlanName(event.target.value)}
            placeholder="Ex.: Térreo"
          />
        </label>

        <label>
          Imagem da planta
          <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>

        {error && <p className="modal__error">{error}</p>}

        <div className="modal__actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Criando…' : 'Criar'}
          </button>
        </div>
      </form>
    </div>
  )
}
