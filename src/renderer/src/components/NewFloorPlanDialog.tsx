import { useEffect, useState, type FormEvent } from 'react'
import { createFloorPlan, createProject } from '../modules/projects/api'
import { loadImageDimensions } from '../lib/imageDimensions'
import type { FloorPlan, Project } from '../types/domain'

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  function handleFileChange(selectedFile: File | null): void {
    setError(null)

    if (!selectedFile) {
      setFile(null)
      return
    }

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
      setFile(null)
      setError('Formato inválido. Use PNG, JPG, JPEG ou WEBP.')
      return
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setFile(null)
      setError('A imagem deve ter no máximo 10 MB.')
      return
    }

    setFile(selectedFile)
  }

  function handleRemoveFile(): void {
    setFile(null)
    setError(null)
  }

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
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          />
        </label>

        {previewUrl && file && (
          <div>
            <p>{file.name}</p>

            <img
              src={previewUrl}
              alt="Pré-visualização da planta baixa"
              style={{
                width: '100%',
                maxHeight: '300px',
                objectFit: 'contain'
              }}
            />

            <button type="button" onClick={handleRemoveFile}>
              Remover imagem
            </button>
          </div>
        )}

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