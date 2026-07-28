import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t, i18n } = useTranslation()

  function handleNetworkChange(event: ChangeEvent<HTMLSelectElement>): void {
    onSelectNetwork(event.target.value || null)
  }

  function handleBandChange(event: ChangeEvent<HTMLSelectElement>): void {
    onBandChange(event.target.value as Band)
  }

  function handleLanguageChange(event: ChangeEvent<HTMLSelectElement>): void {
    void i18n.changeLanguage(event.target.value)
  }

  return (
    <header className="toolbar">
      <h1 className="toolbar__title">{floorPlan.name}</h1>

      <div className="toolbar__group">
        <label htmlFor="network-select">{t('toolbar.network')}</label>

        <select id="network-select" value={selectedNetworkKey ?? ''} onChange={handleNetworkChange}>
          <option value="">{t('toolbar.selectNetwork')}</option>

          {networkGroups.length > 0 && (
            <option value={ALL_NETWORKS_KEY}>{t('toolbar.allNetworks')}</option>
          )}

          {networkGroups.map((group) => (
            <option key={group.key} value={group.key}>
              {group.label}
            </option>
          ))}
        </select>

        <label htmlFor="band-select">{t('toolbar.band')}</label>

        <select id="band-select" value={band} onChange={handleBandChange}>
          <option value="all">{t('toolbar.allBands')}</option>
          <option value="2.4GHz">2.4GHz</option>
          <option value="5GHz">5GHz</option>
        </select>

        <label htmlFor="language-select">{t('toolbar.language')}</label>

        <select
          id="language-select"
          value={i18n.resolvedLanguage ?? i18n.language}
          onChange={handleLanguageChange}
        >
          <option value="pt-BR">Português</option>
          <option value="en">English</option>
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
              ? t('toolbar.disablePointCreation')
              : t('toolbar.enablePointCreation')
          }
        >
          <AddLocationIcon width={16} height={16} />{' '}
          {placingPoints ? t('toolbar.addPointsOn') : t('toolbar.addPoints')}
        </button>

        <button
          type="button"
          className="toolbar__button toolbar__button--danger"
          onClick={onResetPoints}
          disabled={!hasPoints}
        >
          <ResetIcon width={16} height={16} /> {t('toolbar.resetPoints')}
        </button>
      </div>
    </header>
  )
}