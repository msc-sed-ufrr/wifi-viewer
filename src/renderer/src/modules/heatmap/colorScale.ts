import type { IdwGrid } from './idw'

interface ColorStop {
  dbm: number
  color: [number, number, number]
  /** Multiplicador de opacidade neste stop (1 = normal, menor = mais transparente) — ver ADR-028. */
  alphaFactor: number
}

/**
 * Escala "térmica" (quente = sinal melhor, frio = sinal pior) — limiares fixos
 * documentados em docs/02-arch.md (seção Convenções). Ausência de dado não é
 * cor nenhuma destes stops: é opacidade zero (ver `gridToRgba`/`confidence`).
 * `alphaFactor` decrescente a partir de "médio" (ver ADR-028): sinais fracos ficam
 * mais transparentes além de mudarem de cor, reforçando a leitura sem depender só do matiz.
 */
const STOPS: ColorStop[] = [
  { dbm: -30, color: [220, 30, 30], alphaFactor: 1 }, // excelente — vermelho
  { dbm: -42, color: [255, 140, 0], alphaFactor: 1 }, // muito bom — laranja
  { dbm: -54, color: [255, 215, 0], alphaFactor: 1 }, // bom — amarelo
  { dbm: -66, color: [40, 180, 60], alphaFactor: 0.6 }, // médio — verde
  { dbm: -78, color: [0, 170, 220], alphaFactor: 0.4 }, // fraco — ciano
  { dbm: -90, color: [40, 80, 220], alphaFactor: 0.2 } // muito fraco — azul
]

/** dBm de cada stop, do melhor sinal ao pior — usado pela legenda para amostrar o mesmo gradiente. */
export const COLOR_STOP_DBMS: readonly number[] = STOPS.map((stop) => stop.dbm)

export function dbmToColor(dbm: number): [number, number, number] {
  if (dbm >= STOPS[0].dbm) return STOPS[0].color
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i]
    const b = STOPS[i + 1]
    if (dbm <= a.dbm && dbm >= b.dbm) {
      const t = (a.dbm - dbm) / (a.dbm - b.dbm)
      return [
        Math.round(a.color[0] + (b.color[0] - a.color[0]) * t),
        Math.round(a.color[1] + (b.color[1] - a.color[1]) * t),
        Math.round(a.color[2] + (b.color[2] - a.color[2]) * t)
      ]
    }
  }
  return STOPS[STOPS.length - 1].color
}

/** Opacidade bem perto de um ponto medido (confiança alta) — nunca 100%, pra planta continuar visível por baixo. */
const MAX_ALPHA = 0.6

/**
 * Expoente aplicado à confiança antes de virar opacidade (ver ADR-029): >1 empurra
 * valores médios de confiança pra baixo desproporcionalmente, fazendo a cor "morrer"
 * mais rápido ao se afastar de um ponto, em vez do decaimento quase linear de antes —
 * sem criar corte abrupto, já que ainda é uma curva contínua.
 */
const ALPHA_FALLOFF_GAMMA = 4

/**
 * Mapeia confiança (0..1) + intensidade de interpolação (0..1, ver `idw.IdwCell`/ADR-031)
 * pra opacidade final. Confiança sozinha só capturava distância; multiplicar pela
 * intensidade faz uma célula sustentada por um único ponto isolado ficar bem mais
 * discreta que uma sustentada por vários pontos convergindo — mesmo se as duas
 * estiverem igualmente "perto" de dados. Chega a zero (transparente) longe de
 * qualquer ponto (ver ADR-026).
 */
function confidenceToAlpha(confidence: number, interpolationIntensity: number): number {
  return Math.pow(Math.min(confidence, 1), ALPHA_FALLOFF_GAMMA) * MAX_ALPHA * interpolationIntensity
}

/** Interpola o `alphaFactor` do stop de cor pro dBm dado (mesma lógica de busca de `dbmToColor`, ver ADR-028). */
function dbmToAlphaFactor(dbm: number): number {
  if (dbm >= STOPS[0].dbm) return STOPS[0].alphaFactor
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i]
    const b = STOPS[i + 1]
    if (dbm <= a.dbm && dbm >= b.dbm) {
      const t = (a.dbm - dbm) / (a.dbm - b.dbm)
      return a.alphaFactor + (b.alphaFactor - a.alphaFactor) * t
    }
  }
  return STOPS[STOPS.length - 1].alphaFactor
}

/**
 * Converte a grade IDW em RGBA. A cor acompanha o valor interpolado continuamente
 * (sem posterizar em degraus) — com a paleta térmica de 6 matizes (ADR-020), bandas
 * de contorno ficavam perceptíveis demais como "polígonos" nas transições, em vez do
 * gradiente orgânico esperado (ver ADR-023). A opacidade acompanha a confiança de
 * forma contínua (sem corte abrupto): perto de um ponto medido fica em torno de
 * 70–85% (destaca onde há mais confiança), e decai suavemente até zero (transparente)
 * longe de qualquer ponto — nunca um tom sólido igual ao de um sinal fraco confirmado
 * (ver PRD, regra "Heatmap", e ADR-026). É essa transição suave, em vez de um raio
 * com borda dura, que dá o efeito de "blob"
 * (ver referência: https://d3-graph-gallery.com/density2d.html). Além disso, sinais
 * de médio pra baixo (`alphaFactor` do stop, ver ADR-028) recebem uma diluição extra —
 * a área fica mais transparente conforme o sinal piora, não só muda de cor. E células
 * sustentadas por um único ponto isolado (`interpolationIntensity` baixo, ver ADR-031)
 * também ficam mais discretas, mesmo com confiança de distância alta ali.
 */
export function gridToRgba(grid: IdwGrid): Uint8ClampedArray {
  const data = new Uint8ClampedArray(grid.cols * grid.rows * 4)
  for (let i = 0; i < grid.cells.length; i++) {
    const { value, confidence, interpolationIntensity } = grid.cells[i]
    const [r, g, b] = dbmToColor(value)
    const offset = i * 4
    data[offset] = r
    data[offset + 1] = g
    data[offset + 2] = b
    data[offset + 3] = Math.round(
      255 * confidenceToAlpha(confidence, interpolationIntensity) * dbmToAlphaFactor(value)
    )
  }
  return data
}

/** Faixa de dBm considerada "sinal" para as escalas visuais (sigma do blob). */
const SIGNAL_MIN_DBM = -90
const SIGNAL_MAX_DBM = -30

const MIN_BLOB_SIGMA = 40
const MAX_BLOB_SIGMA = 150

/**
 * Espalhamento (distância característica) do blob de um ponto a partir do dBm bruto —
 * usado apenas como fallback quando a planta não está calibrada (sem px/metro
 * não dá pra converter uma distância estimada em pixels de forma confiável).
 * Quando há calibração, `distanceToSigmaMeters` é preferido (ver ADR correspondente).
 */
export function dbmToSigma(dbm: number): number {
  const t = Math.min(1, Math.max(0, (dbm - SIGNAL_MIN_DBM) / (SIGNAL_MAX_DBM - SIGNAL_MIN_DBM)))
  return MIN_BLOB_SIGMA + t * (MAX_BLOB_SIGMA - MIN_BLOB_SIGMA)
}

const MIN_DISTANCE_METERS = 1
const MAX_DISTANCE_METERS = 40
const MIN_SIGMA_METERS = 2
const MAX_SIGMA_METERS = 6

/**
 * Espalhamento (distância característica, em metros) do blob de um ponto a partir da
 * distância estimada até a origem (ver readings/distance.ts): perto da origem,
 * o ponto está "dentro" de uma área de boa cobertura e o blob é maior; longe,
 * a leitura é mais pontual/incerta e o blob fica mais contido. Convertido para
 * pixels via a calibração da planta (px/metro) por quem chama. Valores maiores que
 * no ADR-019 (então 0,6–2,5m) — desde que o valor passou a usar peso IDW sem teto
 * (ADR-024), aumentar sigma só alarga a zona de transição entre pontos (mais suave/
 * orgânica), sem voltar a diluir o valor exato na posição de cada ponto (ver ADR-026).
 */
export function distanceToSigmaMeters(distanceMeters: number): number {
  const clamped = Math.min(MAX_DISTANCE_METERS, Math.max(MIN_DISTANCE_METERS, distanceMeters))
  const t = (clamped - MIN_DISTANCE_METERS) / (MAX_DISTANCE_METERS - MIN_DISTANCE_METERS)
  return MAX_SIGMA_METERS - t * (MAX_SIGMA_METERS - MIN_SIGMA_METERS)
}
