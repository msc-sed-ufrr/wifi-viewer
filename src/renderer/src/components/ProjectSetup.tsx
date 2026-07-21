import { useState, type FormEvent } from 'react'
import { createFloorPlan, createProject } from '../modules/projects/api'
import {
  createBlankFloorPlanImage,
  loadImageDimensions,
  validateFloorPlanImageFile
} from '../lib/imageDimensions'
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
    if (file) {
      const validationError = validateFloorPlanImageFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
    }
    setSubmitting(true)
    setError(null)
    try {
      const project = await createProject(projectName.trim() || 'Meu levantamento')
      const imageSource = file
        ? { ...(await loadImageDimensions(file)), blob: file as Blob, calibration: undefined }
        : await createBlankFloorPlanImage().then((blank) => ({
            width: blank.width,
            height: blank.height,
            blob: blank.blob,
            calibration: blank.calibration
          }))
      const floorPlan = await createFloorPlan(
        project.id,
        floorPlanName.trim() || 'Planta 1',
        imageSource.blob,
        imageSource.width,
        imageSource.height,
        imageSource.calibration
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
          Crie um levantamento. A imagem da planta é opcional — sem ela, nasce uma área em branco
          (~40 m × 30 m) pra desenhar as arestas.
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
          Imagem da planta (opcional)
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/*"
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
