import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [projectName, setProjectName] = useState('')
  const [floorPlanName, setFloorPlanName] = useState(t('common.defaultFloorPlanName'))
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (file) {
      const validation = validateFloorPlanImageFile(file)
      if (!validation.ok) {
        setError(t(validation.errorKey))
        return
      }
    }
    setSubmitting(true)
    setError(null)
    try {
      const project = await createProject(projectName.trim() || t('common.defaultProjectName'))
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
        floorPlanName.trim() || t('common.defaultFloorPlanName'),
        imageSource.blob,
        imageSource.width,
        imageSource.height,
        imageSource.calibration
      )
      onCreated(project, floorPlan)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message.startsWith('error.') ? t(message) : message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="project-setup">
      <form className="project-setup__form" onSubmit={handleSubmit}>
        <h1>{t('projectSetup.title')}</h1>
        <p className="project-setup__hint">{t('projectSetup.hint')}</p>

        <label>
          {t('dialog.newFloorPlan.projectNameLabel')}
          <input
            type="text"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder={t('dialog.newFloorPlan.projectNamePlaceholder')}
          />
        </label>

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
            accept=".png,.jpg,.jpeg,.webp,image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        {error && <p className="project-setup__error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? t('common.creating') : t('projectSetup.submit')}
        </button>
      </form>
    </div>
  )
}
