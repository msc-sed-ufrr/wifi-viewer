export interface WeightedPoint {
  x: number
  y: number
  valueDbm: number
  /**
   * Sobrescreve o sigma padrão da grade só para este ponto. Usado na visão
   * "todas as redes": pontos com sinal mais forte espalham (aparentam maiores)
   * mais que pontos fracos, dando uma pista visual de força além da cor
   * (ver colorScale.dbmToSigma). Sem isso, cai no sigma padrão da opção da grade.
   */
  sigma?: number
}

export interface IdwOptions {
  /**
   * Distância característica (px) usada tanto para ponderar a interpolação (IDW,
   * ver ADR-024) quanto para a "confiança" de cada célula — controla o quão
   * espalhado/suave é o blob em torno de cada ponto (ver docs/02-arch.md, ADR-002).
   */
  sigma: number
}

export interface IdwCell {
  /** valor interpolado em dBm; só tem sentido visual quando confidence não é ~0 */
  value: number
  /**
   * 0..1, satura suavemente conforme a célula fica perto de pontos com dados.
   * Substitui o antigo corte abrupto por raio: sem pontos por perto, tende a 0
   * (nenhuma leitura confirmada) e nunca chega a 1 sozinha perto de um único ponto
   * fraco — usado para modular a opacidade em vez de decidir um booleano "tem dado / não tem".
   */
  confidence: number
  /**
   * 0..1 — quantas fontes independentes sustentam esse valor, não só a distância até a
   * mais próxima (ver ADR-031). Perto de um único ponto isolado fica no piso (é só UMA
   * leitura, não uma convergência de várias, mesmo que a confiança de distância seja
   * alta ali); cercado por vários pontos que contribuem de forma comparável, sobe até 1.
   * Calculado como a "contagem efetiva" de pontos (S²/Σw², ver referência estatística do
   * índice inverso de Simpson) a partir dos mesmos pesos de confiança — não introduz
   * nenhum sigma/kernel novo.
   */
  interpolationIntensity: number
}

export interface IdwGrid {
  cols: number
  rows: number
  cellSize: number
  cells: IdwCell[]
}

/** Fator de "nitidez" da confiança — quanto maior, menos peso total já satura perto de 1. */
const CONFIDENCE_SHARPNESS = 3

/**
 * Expoente da ponderação por distância (IDW clássico, ver ADR-024) — ao contrário de
 * um kernel gaussiano (que já usávamos antes), o peso de um ponto cresce sem limite
 * conforme a distância vai a zero, então a própria posição de um ponto reproduz seu
 * valor medido quase exatamente, mesmo com vizinhos próximos de sinal bem diferente.
 * Valor 3 escolhido por simulação: reproduz o pico de cada ponto sem criar transições
 * bruscas demais entre pontos vizinhos (ver docs/02-arch.md, ADR-024).
 */
const IDW_POWER = 3
/** Evita divisão por zero exatamente na posição do ponto — dá um peso finito, mas enorme, ali. */
const DISTANCE_EPSILON = 1e-6

/**
 * Reduz o alcance do sigma só pra confiança, mantendo o sigma cheio pro valor (ver
 * ADR-027): aumentar o sigma pro valor (ADR-026, transições mais suaves) alargou
 * também o alcance da confiança, porque as duas compartilhavam o mesmo sigma — o
 * heatmap parou de esmaecer pra transparente longe dos pontos. Um sigma "efetivo"
 * bem menor só pra confiança restaura isso sem mexer na suavidade do valor.
 */
const CONFIDENCE_SIGMA_SCALE = 0.3

/** Contagem efetiva de pontos a partir da qual `interpolationIntensity` já satura em 1 (ver ADR-031). */
const INTENSITY_REFERENCE_COUNT = 3
/** Intensidade mínima mesmo quando só um ponto isolado sustenta o valor — nunca cai a zero (ainda é um dado real). */
const MIN_INTERPOLATION_INTENSITY = 0.3

export function computeIdwGrid(
  points: WeightedPoint[],
  width: number,
  height: number,
  cellSize: number,
  options: IdwOptions
): IdwGrid {
  const cols = Math.max(1, Math.ceil(width / cellSize))
  const rows = Math.max(1, Math.ceil(height / cellSize))
  const cells: IdwCell[] = new Array(cols * rows)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * cellSize + cellSize / 2
      const cy = row * cellSize + cellSize / 2

      let weightedSum = 0
      let idwWeightTotal = 0
      let confidenceWeightTotal = 0
      let confidenceWeightSquaredTotal = 0

      for (const point of points) {
        const dx = point.x - cx
        const dy = point.y - cy
        const distance = Math.hypot(dx, dy)
        const pointSigma = point.sigma ?? options.sigma

        // Peso IDW pro valor: sem limite superior, então a posição exata de um ponto
        // reproduz o dBm medido ali quase exatamente (ver ADR-024). Usa o sigma cheio,
        // que controla o quão larga/suave é a transição de valor entre pontos vizinhos.
        const normalizedDistance = distance / pointSigma
        const idwWeight = 1 / (Math.pow(normalizedDistance, IDW_POWER) + DISTANCE_EPSILON)
        weightedSum += idwWeight * point.valueDbm
        idwWeightTotal += idwWeight

        // Peso gaussiano só pra confiança: propositalmente limitado a no máximo 1 por
        // ponto, senão o peso IDW (que pode passar de mil bem perto de um ponto) satura
        // a confiança em 1,0 exato mesmo com um único ponto, escondendo o efeito de
        // "mais pontos sobrepostos = mais confiança" que essa métrica deve capturar. Usa
        // um sigma menor que o do valor (CONFIDENCE_SIGMA_SCALE), senão a opacidade não
        // esmaece de vez longe dos pontos quando o sigma do valor é largo (ver ADR-027).
        const confidenceNormalizedDistance = distance / (pointSigma * CONFIDENCE_SIGMA_SCALE)
        const confidenceWeight = Math.exp(-(confidenceNormalizedDistance * confidenceNormalizedDistance) / 2)
        confidenceWeightTotal += confidenceWeight
        confidenceWeightSquaredTotal += confidenceWeight * confidenceWeight
      }

      // "Contagem efetiva" de pontos contribuindo aqui (índice inverso de Simpson, ver
      // ADR-031): 1 ponto dominando (mesmo com peso alto) sempre dá ~1, não importa a
      // magnitude; só sobe perto de 2+ quando outros pontos contribuem de forma comparável.
      const effectiveCount =
        confidenceWeightTotal > 0
          ? (confidenceWeightTotal * confidenceWeightTotal) / confidenceWeightSquaredTotal
          : 0
      const intensityProgress = Math.min(
        1,
        Math.max(0, (effectiveCount - 1) / (INTENSITY_REFERENCE_COUNT - 1))
      )
      const interpolationIntensity =
        MIN_INTERPOLATION_INTENSITY + (1 - MIN_INTERPOLATION_INTENSITY) * intensityProgress

      cells[row * cols + col] = {
        value: idwWeightTotal > 0 ? weightedSum / idwWeightTotal : 0,
        confidence: 1 - Math.exp(-CONFIDENCE_SHARPNESS * confidenceWeightTotal),
        interpolationIntensity
      }
    }
  }

  return { cols, rows, cellSize, cells }
}
