import { useRef, useState, type ChangeEvent } from 'react'
import type { MeasurementPoint, StoredNetworkReading } from '../types/domain'
import { getDistanceMeters } from '../modules/readings/distance'

function formatDistance(reading: StoredNetworkReading): string {
  const { meters, estimated } = getDistanceMeters(reading)
  const rounded = meters < 10 ? meters.toFixed(1) : Math.round(meters).toString()
  return estimated ? `~${rounded}m (estimado)` : `${rounded}m`
}

interface Props {
  point: MeasurementPoint
  index: number
  readings: StoredNetworkReading[]
  scanAvailable: boolean
  onImportCsv: (file: File) => Promise<void>
  onLiveCapture: () => Promise<void>
  onDelete: () => Promise<void>
  onClose: () => void
}

export function PointPanel({
  point,
  index,
  readings,
  scanAvailable,
  onImportCsv,
  onLiveCapture,
  onDelete,
  onClose
}: Props): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      await onImportCsv(file)
    } finally {
      setBusy(false)
    }
  }

  async function handleLiveCapture(): Promise<void> {
    setBusy(true)
    try {
      await onLiveCapture()
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="point-panel">
      <header className="point-panel__header">
        <div>
          <h2>Ponto {index + 1}</h2>
          <p className="point-panel__coords">
            x={Math.round(point.x)}, y={Math.round(point.y)}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar">
          ×
        </button>
      </header>

      <div className="point-panel__actions">
        <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}>
          Importar arquivo de scan
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          hidden
          onChange={handleFileChange}
        />

        <button type="button" disabled={busy || !scanAvailable} onClick={handleLiveCapture}>
          Captura ao vivo
        </button>
        {!scanAvailable && (
          <p className="point-panel__hint">
            Captura ao vivo indisponível neste sistema — use importação de arquivo.
          </p>
        )}

        <button type="button" className="point-panel__delete" disabled={busy} onClick={onDelete}>
          Remover ponto
        </button>
      </div>

      <div className="point-panel__readings">
        <h3>Leituras ({readings.length})</h3>
        {readings.length === 0 ? (
          <p className="point-panel__hint">Nenhuma leitura ainda neste ponto.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SSID</th>
                <th>BSSID</th>
                <th>dBm</th>
                <th>Canal</th>
                <th>Distância</th>
                <th>Segurança</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((reading) => (
                <tr key={reading.id}>
                  <td title={reading.ssid ?? '(oculto)'}>{reading.ssid ?? '(oculto)'}</td>
                  <td title={reading.bssid}>{reading.bssid}</td>
                  <td>{reading.signalDbm}</td>
                  <td>{reading.primaryChannel}</td>
                  <td title={formatDistance(reading)}>{formatDistance(reading)}</td>
                  <td title={reading.security}>{reading.security || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  )
}
