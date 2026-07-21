import { useState, type FormEvent } from 'react'

interface Props {
  /** Comprimento atual (metros). 0 = planta ainda sem escala — campo começa vazio pra o usuário informar. */
  initialSize: number
  sizeUnit: 'm' | 'px'
  /** true = confirmar size define a escala da planta a partir desta aresta. */
  sizeSetsCalibration: boolean
  sizeEditable: boolean
  initialThickness: number
  /** Quantas arestas receberão a espessura (1 = aresta; N = grupo). */
  thicknessTargetCount: number
  onConfirm: (values: { size: number; thickness: number }) => void
  onCancel: () => void
}

/**
 * Dialog aberto ao clicar numa aresta com a ferramenta régua armada.
 * Size = comprimento da aresta; Thickness = strokeWidth da aresta (ou de todo o grupo).
 */
export function WallMeasureDialog({
  initialSize,
  sizeUnit,
  sizeSetsCalibration,
  sizeEditable,
  initialThickness,
  thicknessTargetCount,
  onConfirm,
  onCancel
}: Props): JSX.Element {
  const [size, setSize] = useState(initialSize > 0 ? String(roundDisplay(initialSize, sizeUnit)) : '')
  const [thickness, setThickness] = useState(String(initialThickness))
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    const sizeRaw = size.trim()
    const sizeValue = sizeRaw === '' ? NaN : Number(sizeRaw.replace(',', '.'))
    const thicknessValue = Number(String(thickness).replace(',', '.'))
    // Size vazio é permitido (só aplica thickness). Se preenchido, precisa ser > 0.
    if (sizeEditable && sizeRaw !== '' && (!Number.isFinite(sizeValue) || sizeValue <= 0)) {
      setError(
        sizeUnit === 'm' || sizeSetsCalibration
          ? 'Informe um comprimento maior que zero (metros), ou deixe em branco para só mudar a espessura.'
          : 'Informe um comprimento maior que zero (px), ou deixe em branco para só mudar a espessura.'
      )
      return
    }
    if (
      !Number.isFinite(thicknessValue) ||
      thicknessValue < 1 ||
      thicknessValue > 30 ||
      !Number.isInteger(thicknessValue)
    ) {
      setError('Espessura deve ser um inteiro entre 1 e 30.')
      return
    }
    onConfirm({
      // NaN = size não informado → confirm handler só aplica thickness.
      size: sizeEditable && sizeRaw !== '' ? sizeValue : Number.NaN,
      thickness: thicknessValue
    })
  }

  const sizeLabel = sizeSetsCalibration
    ? 'Size — comprimento real desta aresta (m), define a escala da planta'
    : sizeUnit === 'm'
      ? 'Size — comprimento (m)'
      : 'Size — comprimento (px da imagem)'

  const thicknessLabel =
    thicknessTargetCount > 1
      ? `Thickness — espessura (px), aplicada às ${thicknessTargetCount} arestas do grupo`
      : 'Thickness — espessura do traço (px)'

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSubmit}>
        <h2>Aresta</h2>
        <label>
          {sizeLabel}
          <input
            autoFocus={sizeEditable}
            type="text"
            inputMode="decimal"
            value={size}
            disabled={!sizeEditable}
            placeholder={sizeSetsCalibration ? 'ex.: 4.5' : undefined}
            onChange={(event) => {
              setSize(event.target.value)
              setError(null)
            }}
          />
        </label>
        <label>
          {thicknessLabel}
          <input
            autoFocus={!sizeEditable}
            type="number"
            min={1}
            max={30}
            step={1}
            value={thickness}
            onChange={(event) => {
              setThickness(event.target.value)
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

function roundDisplay(value: number, unit: 'm' | 'px'): number {
  if (unit === 'm') return Math.round(value * 1000) / 1000
  return Math.round(value * 10) / 10
}
