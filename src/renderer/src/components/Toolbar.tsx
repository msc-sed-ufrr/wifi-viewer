import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FloorPlan } from '../types/domain'
import { ALL_NETWORKS_KEY, type NetworkGroup, type Band } from '../modules/readings/network'
import { AddLocationIcon, DownloadIcon, ImageIcon, ResetIcon } from './icons'
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

  const placingPointsLabel = placingPoints ? t('toolbar.addPointsOn') : t('toolbar.addPoints')

  return (
    <header className="toolbar">
      <div className="toolbar__inner">
        <h1 className="toolbar__title" title={floorPlan.name}>
          {floorPlan.name}
        </h1>

        <div className="toolbar__filters">
          <div className="toolbar__field">
            <label htmlFor="heatmap-mode">{t('interference.view')}</label>
            <select id="heatmap-mode" value={mode} onChange={(event) => onModeChange(event.target.value as HeatmapMode)}>
              <option value="coverage">{t('interference.coverage')}</option>
              <option value="interference">{t('interference.title')}</option>
            </select>
          </div>

          <div className="toolbar__field toolbar__field--network">
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
          </div>

          <div className="toolbar__field">
            <label htmlFor="band-select">{t('toolbar.band')}</label>
            <select id="band-select" value={band} onChange={handleBandChange}>
              <option value="all">{t('toolbar.allBands')}</option>
              <option value="2.4GHz">2.4GHz</option>
              <option value="5GHz">5GHz</option>
            </select>
          </div>
        </div>

        {/* Em larguras estreitas o CSS esconde os rótulos; aria-label/title mantêm o nome acessível e o tooltip. */}
        <div className="toolbar__actions">
          <button
            type="button"
            className="toolbar__button"
            onClick={onExport}
            aria-label={t('heatmapExport.title')}
            title={t('heatmapExport.title')}
          >
            <ImageIcon width={16} height={16} />
            <span className="toolbar__button-label">{t('heatmapExport.title')}</span>
          </button>
          <button
            type="button"
            className="toolbar__button"
            onClick={onReport}
            aria-label={t('report.title')}
            title={t('report.title')}
          >
            <DownloadIcon width={16} height={16} />
            <span className="toolbar__button-label">{t('report.title')}</span>
          </button>
          <button
            type="button"
            className={`toolbar__button${placingPoints ? ' toolbar__button--active' : ''}`}
            onClick={onTogglePlacingPoints}
            aria-pressed={placingPoints}
            aria-label={placingPointsLabel}
            title={
              placingPoints
                ? t('toolbar.disablePointCreation')
                : t('toolbar.enablePointCreation')
            }
          >
            <AddLocationIcon width={16} height={16} />
            <span className="toolbar__button-label">{placingPointsLabel}</span>
          </button>

          <button
            type="button"
            className="toolbar__button toolbar__button--danger"
            onClick={onResetPoints}
            disabled={!hasPoints}
            aria-label={t('toolbar.resetPoints')}
            title={t('toolbar.resetPoints')}
          >
            <ResetIcon width={16} height={16} />
            <span className="toolbar__button-label">{t('toolbar.resetPoints')}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
