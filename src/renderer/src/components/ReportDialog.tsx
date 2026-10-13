import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReportOptions } from '../modules/export/reportExporter'

interface Props {
  onGenerate: (options: ReportOptions) => Promise<void>
  onCancel: () => void
}

export function ReportDialog({ onGenerate, onCancel }: Props): JSX.Element {
  const { t } = useTranslation()
  const [sections, setSections] = useState({ map: true, channels: true, readings: true })
  const [includeNotes, setIncludeNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const busyRef = useRef(false)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    formRef.current?.querySelector('input')?.focus()
    function keydown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busyRef.current) cancelRef.current()
      if (event.key !== 'Tab') return
      const controls = formRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), textarea:not(:disabled), button:not(:disabled)')
      if (!controls?.length) { event.preventDefault(); return }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(false)
    try { await onGenerate({ ...sections, notes: includeNotes ? notes : '' }); onCancel() }
    catch { setError(true) }
    finally { busyRef.current = false; setBusy(false) }
  }

  return (
    <div className="modal-overlay">
      <form ref={formRef} className="modal report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" aria-busy={busy} onSubmit={submit}>
        <h2 id="report-title">{t('report.title')}</h2>
        <p className="modal__hint">{t('report.hint')}</p>
        <fieldset disabled={busy}>
          <legend>{t('report.sections')}</legend>
          {(['map', 'channels', 'readings'] as const).map((key) => (
            <label className="report-dialog__check" key={key}>
              <input type="checkbox" checked={sections[key]} onChange={(event) => setSections((value) => ({ ...value, [key]: event.target.checked }))} />
              {t(`report.${key}`)}
            </label>
          ))}
          <label className="report-dialog__check">
            <input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
            {t('report.includeNotes')}
          </label>
          {includeNotes && <label>{t('report.notes')}<textarea rows={5} maxLength={10000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>}
        </fieldset>
        {error && <p role="alert" className="modal__error">{t('report.error')}</p>}
        <div className="modal__actions">
          <button type="button" onClick={onCancel} disabled={busy}>{t('common.cancel')}</button>
          <button type="submit" disabled={busy}>{t(busy ? 'report.busy' : 'report.generate')}</button>
        </div>
      </form>
    </div>
  )
}
