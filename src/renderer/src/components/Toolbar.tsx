import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FloorPlan } from '../types/domain'
import { ALL_NETWORKS_KEY, type NetworkGroup, type Band } from '../modules/readings/network'
import { AddLocationIcon, DownloadIcon, ResetIcon } from './icons'
import type { HeatmapMode } from '../modules/channels/interference'

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
  onExport: () => void
  onReport: () => void
  mode: HeatmapMode
  onModeChange: (mode: HeatmapMode) => void
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
  hasPoints,
  onExport,
  onReport,
  mode,
  onModeChange
}: Props): JSX.Element {
  const { t } = useTranslation()

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
        <label htmlFor="heatmap-mode">{t('interference.view')}</label>
        <select id="heatmap-mode" value={mode} onChange={(event) => onModeChange(event.target.value as HeatmapMode)}>
          <option value="coverage">{t('interference.coverage')}</option>
          <option value="interference">{t('interference.title')}</option>
        </select>
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
      </div>

      <div className="toolbar__group">
        <button type="button" className="toolbar__button" onClick={onExport}>
          <DownloadIcon width={16} height={16} /> {t('heatmapExport.title')}
        </button>
        <button type="button" className="toolbar__button" onClick={onReport}>
          <DownloadIcon width={16} height={16} /> {t('report.title')}
        </button>
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
