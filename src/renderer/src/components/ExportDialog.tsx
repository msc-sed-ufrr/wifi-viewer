import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExportFormat } from '../modules/export/heatmapExporter'

interface Props {
  onExport: (format: ExportFormat) => Promise<void>
  onCancel: () => void
}

export function ExportDialog({ onExport, onCancel }: Props): JSX.Element {
  const { t } = useTranslation()
  const [format, setFormat] = useState<ExportFormat>('png')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const busyRef = useRef(false)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    formRef.current?.querySelector('select')?.focus()
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busyRef.current) cancelRef.current()
      if (event.key !== 'Tab') return
      const elements = formRef.current?.querySelectorAll<HTMLElement>('select:not(:disabled), button:not(:disabled)')
      if (!elements?.length) { event.preventDefault(); return }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previousFocus?.focus() }
  }, [])

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(false)
    try { await onExport(format); onCancel() }
    catch { setError(true) }
    finally { busyRef.current = false; setBusy(false) }
  }

  return (
    <div className="modal-overlay">
      <form ref={formRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title" aria-busy={busy} onSubmit={handleSubmit}>
        <h2 id="export-title">{t('heatmapExport.title')}</h2>
        <p className="modal__hint">{t('heatmapExport.hint')}</p>
        <label htmlFor="export-format">{t('heatmapExport.format')}</label>
        <select id="export-format" value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
          <option value="png">PNG</option>
          <option value="pdf">PDF (A4)</option>
        </select>
        {error && <p className="modal__error" role="alert">{t('heatmapExport.error')}</p>}
        <div className="modal__actions">
          <button type="button" disabled={busy} onClick={onCancel}>{t('common.cancel')}</button>
          <button type="submit" disabled={busy}>{t(busy ? 'heatmapExport.busy' : 'heatmapExport.export')}</button>
        </div>
      </form>
    </div>
  )
}
