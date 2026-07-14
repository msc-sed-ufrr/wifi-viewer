import { useState, type FormEvent } from 'react'
import { createFloorPlan, createProject } from '../modules/projects/api'
import { loadImageDimensions } from '../lib/imageDimensions'
import type { FloorPlan, Project } from '../types/domain'

interface Props {
  onCreated: (project: Project, floorPlan: FloorPlan) => void
}

export function ProjectSetup({ onCreated }: Props): JSX.Element {
  const [projectName, setProjectName] = useState('')
  const [floorPlanName, setFloorPlanName] = useState('Planta 1')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!file) {
      setError('Selecione uma imagem da planta do prédio.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { width, height } = await loadImageDimensions(file)
      const project = await createProject(projectName.trim() || 'Meu levantamento')
      const floorPlan = await createFloorPlan(
        project.id,
        floorPlanName.trim() || 'Planta 1',
        file,
        width,
        height
      )
      onCreated(project, floorPlan)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="project-setup">
      <form className="project-setup__form" onSubmit={handleSubmit}>
        <h1>Novo levantamento</h1>
        <p className="project-setup__hint">
          Crie um levantamento e envie a imagem da planta do prédio para começar a marcar pontos de
          medição.
        </p>

        <label>
          Nome do levantamento
          <input
            type="text"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Ex.: Prédio CIT"
          />
        </label>

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
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        {error && <p className="project-setup__error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Criando…' : 'Criar levantamento'}
        </button>
      </form>
    </div>
  )
}
