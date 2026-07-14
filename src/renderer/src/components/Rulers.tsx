interface Props {
  pixelsPerMeter: number
  renderedWidth: number
  renderedHeight: number
  nativeWidth: number
  nativeHeight: number
}

const NICE_STEPS_METERS = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100]

/** Escolhe um passo "redondo" (em metros) para as marcações não ficarem espremidas em qualquer nível de zoom. */
function pickStepMeters(cssPxPerMeter: number, minSpacingPx = 40): number {
  const rawStep = minSpacingPx / cssPxPerMeter
  return NICE_STEPS_METERS.find((step) => step >= rawStep) ?? NICE_STEPS_METERS[NICE_STEPS_METERS.length - 1]
}

function formatMeters(meters: number, step: number): string {
  return step < 1 ? meters.toFixed(1) : String(Math.round(meters))
}

function buildTicks(totalMeters: number, step: number): number[] {
  const ticks: number[] = []
  for (let m = 0; m <= totalMeters + 1e-6; m += step) ticks.push(Number(m.toFixed(2)))
  return ticks
}

/** Réguas horizontal/vertical em metros, alinhadas ao canvas renderizado (ver PRD, calibração de escala). */
export function Rulers({ pixelsPerMeter, renderedWidth, renderedHeight, nativeWidth, nativeHeight }: Props): JSX.Element {
  const cssPxPerMeter = pixelsPerMeter * (renderedWidth / nativeWidth || 1)
  const step = pickStepMeters(cssPxPerMeter)
  const hTicks = buildTicks(nativeWidth / pixelsPerMeter, step)
  const vTicks = buildTicks(nativeHeight / pixelsPerMeter, step)

  return (
    <>
      <div className="ruler ruler--corner" />
      <div className="ruler ruler--horizontal" style={{ width: renderedWidth }}>
        {hTicks.map((m) => (
          <span key={m} className="ruler__tick ruler__tick--h" style={{ left: m * cssPxPerMeter }}>
            {formatMeters(m, step)}
          </span>
        ))}
      </div>
      <div className="ruler ruler--vertical" style={{ height: renderedHeight }}>
        {vTicks.map((m) => (
          <span key={m} className="ruler__tick ruler__tick--v" style={{ top: m * cssPxPerMeter }}>
            {formatMeters(m, step)}
          </span>
        ))}
      </div>
    </>
  )
}
