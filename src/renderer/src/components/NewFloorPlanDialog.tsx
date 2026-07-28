import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createFloorPlan, createProject } from '../modules/projects/api'
import { createPoint } from '../modules/points/api'
import { addReadings } from '../modules/readings/api'
import { CsvImportError } from '../modules/import/csvParser'
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

/** Traduz um erro com chave i18n (`CsvImportError`) ou passa adiante qualquer outra mensagem. */
function translateError(t: (key: string, params?: Record<string, unknown>) => string, err: unknown): string {
  if (err instanceof CsvImportError) {
    return t(err.errorKey, err.params ?? {})
  }
  if (err instanceof Error) return err.message
  return String(err)
}

export function NewFloorPlanDialog({ project, onCreated, onCancel }: Props): JSX.Element {
  const { t } = useTranslation()
  const [projectName, setProjectName] = useState('')
  const [floorPlanName, setFloorPlanName] = useState(project ? '' : t('common.defaultFloorPlanName'))
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
    if (!validationError.ok) {
      setFile(null)
      setError(t(validationError.errorKey))
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
      setError(translateError(t, err))
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
      setError(t('error.csvRequiresImage'))
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const targetProject = project ?? (await createProject(projectName.trim() || t('common.defaultProjectName')))

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
        floorPlanName.trim() || t('common.defaultFloorPlanName'),
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
      setError(translateError(t, err))
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
        <h2>{project ? t('dialog.newFloorPlan.titleForProject', { name: project.name }) : t('dialog.newFloorPlan.title')}</h2>

        {!project && (
          <label>
            {t('dialog.newFloorPlan.projectNameLabel')}
            <input
              autoFocus
              type="text"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder={t('dialog.newFloorPlan.projectNamePlaceholder')}
            />
          </label>
        )}

        <label>
          {t('dialog.newFloorPlan.floorPlanNameLabel')}
          <input
            type="text"
            value={floorPlanName}
            onChange={(event) => setFloorPlanName(event.target.value)}
            placeholder={t('dialog.newFloorPlan.floorPlanNamePlaceholder')}
          />
        </label>

        <label>
          {t('dialog.newFloorPlan.imageLabel')}
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="modal__hint">{t('dialog.newFloorPlan.blankImageHint')}</p>

        {previewUrl && file && (
          <div>
            <p>{file.name}</p>

            <img
              src={previewUrl}
              alt={t('dialog.newFloorPlan.previewAlt')}
              style={{
                width: '100%',
                maxHeight: '300px',
                objectFit: 'contain'
              }}
            />

            <button type="button" onClick={handleRemoveFile}>
              {t('dialog.newFloorPlan.removeImage')}
            </button>
          </div>
        )}

        <label>
          {t('dialog.newFloorPlan.csvLabel')}
          <input
            type="file"
            accept=".csv,.txt"
            onChange={(event) => handleCsvFileChange(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="modal__hint">{t('dialog.newFloorPlan.csvHint')}</p>

        {csvFile && csvGroups && (
          <div>
            <p className="modal__hint">
              {t('dialog.newFloorPlan.csvSummary', {
                file: csvFile.name,
                count: csvGroups.length,
                readings: csvGroups.reduce((sum, group) => sum + group.readings.length, 0)
              })}
            </p>

            {rescaledCount > 0 && (
              <p className="modal__hint">
                {t('dialog.newFloorPlan.rescaledHint', { count: rescaledCount })}
              </p>
            )}

            {clampedCount > 0 && (
              <p className="modal__warning">
                {t('dialog.newFloorPlan.clampedHint', { count: clampedCount })}
              </p>
            )}

            <button type="button" onClick={handleRemoveCsvFile}>
              {t('dialog.newFloorPlan.removeCsv')}
            </button>
          </div>
        )}

        {error && <p className="modal__error">{error}</p>}

        <div className="modal__actions">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>

          <button type="submit" disabled={submitting}>
            {submitting ? t('common.creating') : t('common.create')}
          </button>
        </div>
      </form>
    </div>
  )
}