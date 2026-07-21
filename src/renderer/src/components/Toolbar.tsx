import type { ChangeEvent } from 'react'
import type { FloorPlan } from '../types/domain'
import { ALL_NETWORKS_KEY, type NetworkGroup, type Band } from '../modules/readings/network'
import { AddLocationIcon, ResetIcon } from './icons'

interface Props {
  floorPlan: FloorPlan
  networkGroups: NetworkGroup[]
  selectedNetworkKey: string | null
  onSelectNetwork: (key: string | null) => void
  band: Band
  onBandChange: (band: Band) => void
  /** Toggle armado/desarmado: com o modo armado, clique vazio na planta cria ponto de medição. */
  placingPoints: boolean
  onTogglePlacingPoints: () => void
  onResetPoints: () => void
  hasPoints: boolean
}

export function Toolbar({
  floorPlan,
  networkGroups,
  selectedNetworkKey,
  onSelectNetwork,
  band,
  onBandChange,
  placingPoints,
  onTogglePlacingPoints,
  onResetPoints,
  hasPoints
}: Props): JSX.Element {
  function handleNetworkChange(event: ChangeEvent<HTMLSelectElement>): void {
    onSelectNetwork(event.target.value || null)
  }

  function handleBandChange(event: ChangeEvent<HTMLSelectElement>): void {
    onBandChange(event.target.value as Band)
  }

  return (
    <header className="toolbar">
      <h1 className="toolbar__title">{floorPlan.name}</h1>

      <div className="toolbar__group">
        <label htmlFor="network-select">Rede</label>
        <select id="network-select" value={selectedNetworkKey ?? ''} onChange={handleNetworkChange}>
          <option value="">Selecione uma rede…</option>
          {networkGroups.length > 0 && <option value={ALL_NETWORKS_KEY}>Todas as redes</option>}
          {networkGroups.map((group) => (
            <option key={group.key} value={group.key}>
              {group.label}
            </option>
          ))}
        </select>

        <label htmlFor="band-select">Banda</label>
        <select id="band-select" value={band} onChange={handleBandChange}>
          <option value="all">Todas</option>
          <option value="2.4GHz">2.4GHz</option>
          <option value="5GHz">5GHz</option>
        </select>
      </div>

      <div className="toolbar__group">
        <button
          type="button"
          className={`toolbar__button${placingPoints ? ' toolbar__button--active' : ''}`}
          onClick={onTogglePlacingPoints}
          aria-pressed={placingPoints}
          title={
            placingPoints
              ? 'Desarmar criação de pontos — cliques vazios na planta não criam mais medições'
              : 'Armar criação de pontos — cliques vazios na planta passam a criar medições'
          }
        >
          <AddLocationIcon width={16} height={16} />{' '}
          {placingPoints ? 'Adicionar pontos: ligado' : 'Adicionar pontos'}
        </button>
        <button
          type="button"
          className="toolbar__button toolbar__button--danger"
          onClick={onResetPoints}
          disabled={!hasPoints}
        >
          <ResetIcon width={16} height={16} /> Resetar pontos
        </button>
      </div>
    </header>
  )
}
