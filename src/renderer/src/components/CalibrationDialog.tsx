import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  onConfirm: (realDistanceMeters: number) => void
  onCancel: () => void
}

/**
 * Modal próprio em vez de `window.prompt()` — o Electron não implementa o
 * diálogo nativo de prompt (só `alert`/`confirm` têm suporte real), então
 * `window.prompt()` não mostra nada e retorna vazio silenciosamente dentro do
 * app empacotado, mesmo funcionando normalmente num navegador comum.
 */
export function CalibrationDialog({ onConfirm, onCancel }: Props): JSX.Element {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    const meters = Number(value.replace(',', '.'))
    if (!Number.isFinite(meters) || meters <= 0) {
      setError(t('error.calibrationPositiveNumber'))
      return
    }
    onConfirm(meters)
  }

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSubmit}>
        <h2>{t('dialog.calibrate.title')}</h2>
        <label>
          {t('dialog.calibrate.distanceLabel')}
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setError(null)
            }}
          />
        </label>
        {error && <p className="modal__error">{error}</p>}
        <div className="modal__actions">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="submit">{t('common.confirm')}</button>
        </div>
      </form>
    </div>
  )
}
