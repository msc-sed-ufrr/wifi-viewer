import { useEffect, useState, type FormEvent } from 'react'
import { createFloorPlan, createProject } from '../modules/projects/api'
import { createPoint } from '../modules/points/api'
import { addReadings } from '../modules/readings/api'
import { parseConsolidatedCsv, resolveImportedPosition, type LocatedReadingGroup } from '../modules/import/consolidatedImport'
import {
  createBlankFloorPlanImage,
  loadImageDimensions,
  validateFloorPlanImageFile
} from '../lib/imageDimensions'
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvGroups, setCsvGroups] = useState<LocatedReadingGroup[] | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)
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

  /** Reativo a `file` pra alimentar o aviso de posições fora dos limites (ver render abaixo) — refeito a cada troca de imagem, inclusive quando o usuário troca a imagem em resposta ao próprio aviso. */
  useEffect(() => {
    if (!file) {
      setImageDimensions(null)
      return
    }
    let cancelled = false
    loadImageDimensions(file).then((dimensions) => {
      if (!cancelled) setImageDimensions(dimensions)
    })
    return () => {
      cancelled = true
    }
  }, [file])

  function handleFileChange(selectedFile: File | null): void {
    setError(null)

    if (!selectedFile) {
      setFile(null)
      return
    }

    const validationError = validateFloorPlanImageFile(selectedFile)
    if (validationError) {
      setFile(null)
      setError(validationError)
      return
    }

    setFile(selectedFile)
  }

  function handleRemoveFile(): void {
    setFile(null)
    setError(null)
  }

  /**
   * Parseia na hora, igual à validação da imagem: erro de formato aparece assim que o
   * arquivo é escolhido, não só depois de "Criar" já ter criado a planta. As posições do
   * CSV são coordenadas de pixel da imagem original do export — só fazem sentido se a
   * imagem escolhida acima for a mesma (ver ADR-035).
   */
  async function handleCsvFileChange(selectedFile: File | null): Promise<void> {
    setError(null)

    if (!selectedFile) {
      setCsvFile(null)
      setCsvGroups(null)
      return
    }

    try {
      const text = await selectedFile.text()
      const groups = parseConsolidatedCsv(text)
      setCsvFile(selectedFile)
      setCsvGroups(groups)
    } catch (err) {
      setCsvFile(null)
      setCsvGroups(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleRemoveCsvFile(): void {
    setCsvFile(null)
    setCsvGroups(null)
    setError(null)
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()

    // CSV consolidado carrega posições em px da imagem original — sem imagem, importar
    // pontos numa planta em branco enganaria o usuário (dimensões finais ≠ as do export).
    if (csvGroups && !file) {
      setError('Importe uma imagem da planta para carregar o CSV de leituras (as posições dependem dela).')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const targetProject = project ?? (await createProject(projectName.trim() || 'Meu levantamento'))

      // Sem arquivo: planta em branco (~40 m × 30 m, pré-calibrada) pra desenhar arestas.
      const imageSource = file
        ? { ...(await loadImageDimensions(file)), blob: file as Blob, calibration: undefined }
        : await createBlankFloorPlanImage().then((blank) => ({
            width: blank.width,
            height: blank.height,
            blob: blank.blob,
            calibration: blank.calibration
          }))

      const floorPlan = await createFloorPlan(
        targetProject.id,
        floorPlanName.trim() || 'Nova planta',
        imageSource.blob,
        imageSource.width,
        imageSource.height,
        imageSource.calibration
      )

      if (csvGroups) {
        for (const group of csvGroups) {
          const { x, y } = resolveImportedPosition(group, imageSource.width, imageSource.height)
          const point = await createPoint(floorPlan.id, x, y)
          await addReadings(point.id, group.readings)
        }
      }

      onCreated(targetProject, floorPlan)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Recalculado a cada render a partir de csvGroups/imageDimensions — reage tanto a trocar
   * o CSV quanto a trocar a imagem (é assim que "trocar a imagem" reavalia o aviso abaixo).
   * Usa a mesma resolveImportedPosition do submit, então o aviso nunca diverge do que
   * realmente vai acontecer ao clicar "Criar" (ver ADR-036).
   */
  const resolvedPositions =
    csvGroups && imageDimensions
      ? csvGroups.map((group) => resolveImportedPosition(group, imageDimensions.width, imageDimensions.height))
      : null
  const rescaledCount = resolvedPositions?.filter((p) => p.adjustment === 'rescaled').length ?? 0
  const clampedCount = resolvedPositions?.filter((p) => p.adjustment === 'clamped').length ?? 0

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
          Imagem da planta (opcional)
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="modal__hint">
          Sem imagem, a planta nasce em branco (~40 m × 30 m, pré-calibrada) pra desenhar as
          arestas do terreno.
        </p>

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

        <label>
          Leituras (CSV, opcional)
          <input
            type="file"
            accept=".csv,.txt"
            onChange={(event) => handleCsvFileChange(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="modal__hint">
          Recria os pontos de um CSV consolidado (exportado por planta ou levantamento) —
          as posições só fazem sentido se a imagem acima for a mesma do export original
          (exige imagem).
        </p>

        {csvFile && csvGroups && (
          <div>
            <p className="modal__hint">
              {csvFile.name}: {csvGroups.length}{' '}
              {csvGroups.length === 1 ? 'ponto encontrado' : 'pontos encontrados'} (
              {csvGroups.reduce((sum, group) => sum + group.readings.length, 0)} leituras)
            </p>

            {rescaledCount > 0 && (
              <p className="modal__hint">
                {rescaledCount} {rescaledCount === 1 ? 'ponto será reposicionado' : 'pontos serão reposicionados'}{' '}
                proporcionalmente — a planta de origem tem dimensões diferentes da imagem escolhida acima.
              </p>
            )}

            {clampedCount > 0 && (
              <p className="modal__warning">
                {clampedCount} {clampedCount === 1 ? 'ponto fica' : 'pontos ficam'} fora dos limites da imagem
                escolhida e {clampedCount === 1 ? 'nascerá preso' : 'nascerão presos'} à borda — visível, mas na
                posição errada. Troque a imagem acima pela original do export (ou uma com as mesmas dimensões) pra
                corrigir, ou continue e ajuste as posições manualmente depois.
              </p>
            )}

            <button type="button" onClick={handleRemoveCsvFile}>
              Remover CSV
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