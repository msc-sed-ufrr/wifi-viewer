import { useMemo, useState, type KeyboardEvent } from 'react'
import { buildChannelAxis, channelColor, type ChannelUsageEntry } from '../modules/channels/channelUsage'

interface Props {
  entries: ChannelUsageEntry[]
}

const PLOT_WIDTH = 560
const PLOT_HEIGHT = 150
const LEFT_PAD = 34
const RIGHT_PAD = 12
const TOP_PAD = 14
const BOTTOM_PAD = 20
const SVG_WIDTH = LEFT_PAD + PLOT_WIDTH + RIGHT_PAD
const SVG_HEIGHT = TOP_PAD + PLOT_HEIGHT + BOTTOM_PAD

/** Faixa de dBm desenhada no gráfico — um pouco mais folgada que a escala de cor do heatmap (ver colorScale.ts) pra dar espaço visual ao topo/base dos trapézios. */
const DBM_TOP = -20
const DBM_BOTTOM = -95
const Y_GRIDLINES = [-30, -50, -70, -90]

/** Unidades do eixo (um passo = um canal de 20MHz, ver channelUsage.buildChannelAxis) além das quais o "pé" do trapézio não deve se espalhar mais. */
const MAX_HALF_SPAN_UNITS = 4
/** Alargamento visual da base do trapézio em relação ao topo, em unidades de eixo — só estética (efeito "monte"), sem significado de largura de canal. */
const SKIRT_UNITS = 0.6
/** Distância (px) da borda do gráfico a partir da qual o rótulo passa a ancorar pro lado de dentro em vez de centralizado, pra não vazar do SVG. */
const LABEL_EDGE_MARGIN = 60
/** Opacidade de preenchimento em repouso — baixa de propósito: com muitas redes no mesmo canal (comum em prédios grandes), preenchimentos empilhados criam uma "lama" de cor; o contorno (bem mais opaco) já identifica cada rede. */
const FILL_OPACITY = 0.14
const FILL_OPACITY_HOVER = 0.4
const FILL_OPACITY_DIMMED = 0.05
const STROKE_OPACITY_DIMMED = 0.3
/** Estimativa de largura de caractere (px) pra fonte 9px de .channel-chart__label — evita medir o DOM só pra decidir colisão de rótulo (ver `layoutBand`). */
const LABEL_CHAR_WIDTH_PX = 5.3
const LABEL_HEIGHT_PX = 11
/** Respiro mínimo entre dois rótulos aceitos, pra não ficarem colados. */
const LABEL_GAP_PX = 4

function dbmToY(dbm: number): number {
  const clamped = Math.min(DBM_TOP, Math.max(DBM_BOTTOM, dbm))
  const t = (DBM_TOP - clamped) / (DBM_TOP - DBM_BOTTOM)
  return TOP_PAD + t * PLOT_HEIGHT
}

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`
}

interface ColoredEntry extends ChannelUsageEntry {
  color: [number, number, number]
}

interface Rect {
  x1: number
  x2: number
  y1: number
  y2: number
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 + LABEL_GAP_PX && a.x2 + LABEL_GAP_PX > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
}

interface LayoutEntry extends ColoredEntry {
  cx: number
  peakY: number
  points: string
  labelAnchor: 'start' | 'middle' | 'end'
  /** Falso quando o rótulo colidiria com o de outra rede já posicionada (ver `layoutBand`) — a forma ainda aparece, só sem texto fixo; o `<title>` continua disponível ao passar o mouse. */
  showLabel: boolean
}

/**
 * Geometria + decisão de rótulo de uma banda, calculadas juntas (ver ChannelChart):
 * cada rede vira um trapézio (posição/tamanho) e, à parte, cada rede tenta reservar
 * espaço pro próprio rótulo em ordem de sinal mais forte pro mais fraco — a primeira
 * a chegar num canal concorrido "ganha" o rótulo; as demais ficam só com a forma
 * colorida (identificável ao passar o mouse), em vez de todas competirem por texto
 * no mesmo pedaço de tela (era exatamente a origem da "sopa de rótulos" reportada).
 */
function layoutBand(entries: ColoredEntry[], axis: number[]): LayoutEntry[] {
  const channelIndex = new Map(axis.map((channel, index) => [channel, index]))
  const stepPx = PLOT_WIDTH / Math.max(1, axis.length - 1)
  const baselineY = TOP_PAD + PLOT_HEIGHT

  const withGeometry = entries.flatMap((entry) => {
    const index = channelIndex.get(entry.channel)
    if (index === undefined) return []
    const cx = LEFT_PAD + index * stepPx
    const topHalfUnits = Math.min(MAX_HALF_SPAN_UNITS, entry.widthMhz / 20 / 2)
    const baseHalfUnits = topHalfUnits + SKIRT_UNITS
    const topHalfPx = topHalfUnits * stepPx
    const baseHalfPx = baseHalfUnits * stepPx
    const peakY = dbmToY(entry.dbm)
    const points = [
      [cx - baseHalfPx, baselineY],
      [cx - topHalfPx, peakY],
      [cx + topHalfPx, peakY],
      [cx + baseHalfPx, baselineY]
    ]
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ')

    // Perto das bordas do gráfico, ancorar o rótulo pro lado de dentro em vez de centralizado —
    // senão o texto de redes no primeiro/último canal vaza pra fora do SVG e é cortado.
    const nearLeftEdge = cx - LEFT_PAD < LABEL_EDGE_MARGIN
    const nearRightEdge = LEFT_PAD + PLOT_WIDTH - cx < LABEL_EDGE_MARGIN
    const labelAnchor: LayoutEntry['labelAnchor'] = nearLeftEdge ? 'start' : nearRightEdge ? 'end' : 'middle'

    return [{ ...entry, cx, peakY, points, labelAnchor, showLabel: false }]
  })

  const placedRects: Rect[] = []
  const byDbmDesc = [...withGeometry].sort((a, b) => b.dbm - a.dbm)
  for (const entry of byDbmDesc) {
    const width = entry.label.length * LABEL_CHAR_WIDTH_PX
    const y2 = entry.peakY - 5
    const rect: Rect =
      entry.labelAnchor === 'start'
        ? { x1: entry.cx, x2: entry.cx + width, y1: y2 - LABEL_HEIGHT_PX, y2 }
        : entry.labelAnchor === 'end'
          ? { x1: entry.cx - width, x2: entry.cx, y1: y2 - LABEL_HEIGHT_PX, y2 }
          : { x1: entry.cx - width / 2, x2: entry.cx + width / 2, y1: y2 - LABEL_HEIGHT_PX, y2 }

    if (!placedRects.some((placed) => rectsOverlap(placed, rect))) {
      placedRects.push(rect)
      entry.showLabel = true
    }
  }

  return withGeometry
}

function BandChart({ band, entries }: { band: '2.4GHz' | '5GHz'; entries: ColoredEntry[] }): JSX.Element {
  const [hoveredBssid, setHoveredBssid] = useState<string | null>(null)
  const axis = buildChannelAxis(band, entries)
  const stepPx = PLOT_WIDTH / Math.max(1, axis.length - 1)
  const baselineY = TOP_PAD + PLOT_HEIGHT
  // Com muitos canais no eixo (banda 5GHz), rotular todos os traços deixaria o texto ilegível — mostra no máximo ~14, espaçados.
  const tickLabelStride = Math.max(1, Math.ceil(axis.length / 14))

  const layout = useMemo(() => layoutBand(entries, axis), [entries, axis])
  // Mais forte por cima por padrão (fica sempre legível); ao passar o mouse, a rede
  // apontada vai pro topo de tudo — sem isso, o contorno dela ficaria embaixo de
  // outras formas desenhadas depois e o "destaque" ao passar o mouse não apareceria.
  const paintOrder = useMemo(() => {
    const sorted = [...layout].sort((a, b) => a.dbm - b.dbm)
    if (!hoveredBssid) return sorted
    const hoveredIndex = sorted.findIndex((entry) => entry.bssid === hoveredBssid)
    if (hoveredIndex < 0) return sorted
    const [hovered] = sorted.splice(hoveredIndex, 1)
    sorted.push(hovered)
    return sorted
  }, [layout, hoveredBssid])

  return (
    <div className="channel-chart__band">
      <div className="channel-chart__band-title">{band}</div>
      <svg
        className="channel-chart__svg"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label={`Distribuição de redes nos canais ${band}`}
      >
        {Y_GRIDLINES.map((dbm) => (
          <g key={dbm}>
            <line
              x1={LEFT_PAD}
              x2={LEFT_PAD + PLOT_WIDTH}
              y1={dbmToY(dbm)}
              y2={dbmToY(dbm)}
              className="channel-chart__gridline"
            />
            <text x={LEFT_PAD - 6} y={dbmToY(dbm)} className="channel-chart__axis-label" textAnchor="end" dy="3">
              {dbm}
            </text>
          </g>
        ))}

        <line
          x1={LEFT_PAD}
          x2={LEFT_PAD + PLOT_WIDTH}
          y1={baselineY}
          y2={baselineY}
          className="channel-chart__axis"
        />
        {axis.map((channel, index) => {
          const x = LEFT_PAD + index * stepPx
          return (
            <g key={channel}>
              <line x1={x} x2={x} y1={baselineY} y2={baselineY + 4} className="channel-chart__axis" />
              {index % tickLabelStride === 0 && (
                <text x={x} y={baselineY + 15} className="channel-chart__axis-label" textAnchor="middle">
                  {channel}
                </text>
              )}
            </g>
          )
        })}

        {paintOrder.map((entry) => {
          const isHovered = entry.bssid === hoveredBssid
          const isDimmed = hoveredBssid !== null && !isHovered
          const color = rgb(entry.color)

          return (
            <g
              key={entry.bssid}
              onMouseEnter={() => setHoveredBssid(entry.bssid)}
              onMouseLeave={() => setHoveredBssid(null)}
            >
              <polygon
                points={entry.points}
                fill={color}
                fillOpacity={isHovered ? FILL_OPACITY_HOVER : isDimmed ? FILL_OPACITY_DIMMED : FILL_OPACITY}
                stroke={color}
                strokeOpacity={isDimmed ? STROKE_OPACITY_DIMMED : 1}
                strokeWidth={isHovered ? 2.5 : 1.5}
                strokeLinejoin="round"
              >
                <title>
                  {entry.label} · canal {entry.channel} · {entry.widthMhz}MHz · {entry.dbm}dBm
                </title>
              </polygon>
              {(entry.showLabel || isHovered) && (
                <text
                  x={entry.cx}
                  y={entry.peakY - 5}
                  textAnchor={entry.labelAnchor}
                  className="channel-chart__label"
                  style={{ fill: color, opacity: isDimmed ? STROKE_OPACITY_DIMMED : 1 }}
                >
                  {entry.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/**
 * Painel colapsável no rodapé do workspace: distribuição das redes pelos canais
 * de Wi-Fi (um traço por rádio/BSSID — dois rádios do mesmo AP em bandas
 * diferentes aparecem separados, ver channelUsage.buildChannelUsage), só
 * disponível na visão "todas as redes" (ver Workspace, PRD UC-005).
 */
export function ChannelChart({ entries }: Props): JSX.Element {
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

  const coloredEntries: ColoredEntry[] = entries.map((entry, index) => ({
    ...entry,
    color: channelColor(index)
  }))
  const bands = (['2.4GHz', '5GHz'] as const)
    .map((band) => ({ band, items: coloredEntries.filter((entry) => entry.band === band) }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="channel-chart">
      <div
        className="channel-chart__header"
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        <span className={`channel-chart__chevron${expanded ? ' channel-chart__chevron--expanded' : ''}`}>▸</span>
        Distribuição de canais
        <span className="channel-chart__hint">
          ({entries.length} redes{expanded ? ' · passe o mouse sobre uma forma para ver detalhes' : ''})
        </span>
      </div>
      {expanded && (
        <div className="channel-chart__body">
          {bands.map(({ band, items }) => (
            <BandChart key={band} band={band} entries={items} />
          ))}
        </div>
      )}
    </div>
  )
}
