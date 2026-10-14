import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { COLOR_STOP_DBMS, dbmToColor } from '../modules/heatmap/colorScale'
import { INTERFERENCE_COLORS, type HeatmapMode } from '../modules/channels/interference'

/** Amostra os mesmos stops de `dbmToColor` (pior → melhor sinal) pra a barra nunca ficar fora de sincronia com a cor real do heatmap. */
function buildGradientCss(): string {
  const dbmsWorstToBest = [...COLOR_STOP_DBMS].reverse()
  const stops = dbmsWorstToBest.map((dbm, index, arr) => {
    const [r, g, b] = dbmToColor(dbm)
    const pct = (index / (arr.length - 1)) * 100
    return `rgb(${r}, ${g}, ${b}) ${pct}%`
  })
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/**
 * Legenda de leitura do heatmap: escala dBm→cor — ver PRD, UC-005. Clicável para
 * ampliar: a versão compacta padrão fica pequena demais pra ler os extremos.
 */
export function Legend({ mode = 'coverage' }: { mode?: HeatmapMode }): JSX.Element {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  function toggle(): void {
    setExpanded((value) => !value)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle()
    }
  }

  const hint = expanded ? t('legend.collapse') : t('legend.expand')
  const sharedProps = {
    role: 'button' as const,
    tabIndex: 0,
    title: hint,
    onClick: toggle,
    onKeyDown: handleKeyDown
  }

  return (
    <div className={`legend legend--gradient${expanded ? ' legend--expanded' : ''}`} {...sharedProps}>
      {mode === 'interference' ? INTERFERENCE_COLORS.map((color, index) => (
        <span className="legend__category" key={color}>
          <span style={{ background: color }} />{t(['interference.low', 'interference.medium', 'interference.high'][index])}
        </span>
      )) : <><span>-90dBm</span><span className="legend__bar" style={{ background: buildGradientCss() }} /><span>-30dBm</span></>}
    </div>
  )
}
