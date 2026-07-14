import { useState, type FormEvent } from 'react'

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
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    const meters = Number(value.replace(',', '.'))
    if (!Number.isFinite(meters) || meters <= 0) {
      setError('Informe um número maior que zero.')
      return
    }
    onConfirm(meters)
  }

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSubmit}>
        <h2>Calibrar escala</h2>
        <label>
          Distância real entre os dois pontos clicados (em metros)
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
            Cancelar
          </button>
          <button type="submit">Confirmar</button>
        </div>
      </form>
    </div>
  )
}
