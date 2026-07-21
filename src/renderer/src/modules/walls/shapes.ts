/**
 * Geometria pura das ferramentas de forma do editor de paredes (ADR-045): retângulo, círculo e
 * arco são tesselados em segmentos retos — o modelo de dados (`Wall` = 2 vértices) não muda.
 *
 * Contrato importante: segmentos consecutivos da MESMA forma compartilham a referência do ponto
 * na junta (o `end` de um é o mesmo objeto `start` do próximo). É isso que garante ao
 * `createWallsWithGroup` deduplicar os vértices por coordenada exata — sem erro de ponto
 * flutuante entre duas computações do mesmo canto — e a forma nascer como um grafo fechado
 * (cantos compartilhados por id, mesma filosofia do snap do ADR-041).
 *
 * ADR-046: além da tesselação (retângulo + preview/legado), este módulo também abriga os
 * helpers de path/handles/edição das formas paramétricas (`WallShape` circle/arc), que não são
 * tesseladas — a UI renderiza path SVG nativo a partir dos parâmetros.
 */

import type { Point2D } from '../../types/domain'

export type { Point2D }

export interface Segment2D {
  start: Point2D
  end: Point2D
}

/** Abaixo disso (px de imagem) a forma é degenerada e nada é criado — espelha MIN_SEGMENT_LENGTH_PX do WallLayer. */
export const MIN_SHAPE_SIZE_PX = 4
/** Comprimento de corda alvo (px de imagem) na tesselação de curvas — quanto menor, mais segmentos e mais suave. */
export const TARGET_CHORD_PX = 8
export const MIN_CIRCLE_SEGMENTS = 16
export const MAX_CIRCLE_SEGMENTS = 64
export const MIN_ARC_SEGMENTS = 4
export const MAX_ARC_SEGMENTS = 48
/** Tolerância do determinante de colinearidade (unidades de px²) — abaixo disso os 3 pontos são tratados como reta. */
export const COLLINEAR_EPS = 1e-9

const TWO_PI = Math.PI * 2

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Retângulo alinhado aos eixos da imagem, do canto âncora ao canto oposto (cursor).
 * `square` (Shift) força quadrado perfeito: lado = max(|dx|, |dy|), mantendo o quadrante do arraste.
 * Retorna [] se qualquer lado final ficar abaixo de MIN_SHAPE_SIZE_PX (arraste sem área útil).
 * Segmentos em ciclo (c0→c1→c2→c3→c0), com os 4 cantos criados uma única vez e reutilizados por referência.
 */
export function rectangleSegments(anchor: Point2D, cursor: Point2D, square: boolean): Segment2D[] {
  let dx = cursor.x - anchor.x
  let dy = cursor.y - anchor.y
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = (dx < 0 ? -1 : 1) * side
    dy = (dy < 0 ? -1 : 1) * side
  }
  if (Math.abs(dx) < MIN_SHAPE_SIZE_PX || Math.abs(dy) < MIN_SHAPE_SIZE_PX) return []
  const c0: Point2D = { x: anchor.x, y: anchor.y }
  const c1: Point2D = { x: anchor.x + dx, y: anchor.y }
  const c2: Point2D = { x: anchor.x + dx, y: anchor.y + dy }
  const c3: Point2D = { x: anchor.x, y: anchor.y + dy }
  return [
    { start: c0, end: c1 },
    { start: c1, end: c2 },
    { start: c2, end: c3 },
    { start: c3, end: c0 }
  ]
}

/**
 * Circuncírculo de 3 pontos (centro e raio da única circunferência que passa pelos três).
 * Retorna null quando os pontos são colineares (determinante ~0) — caso em que não existe
 * circunferência finita; quem chama decide o fallback (arco vira reta).
 */
export function circleThrough3Points(p1: Point2D, p2: Point2D, p3: Point2D): { center: Point2D; radius: number } | null {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y))
  if (Math.abs(d) < COLLINEAR_EPS) return null
  const s1 = p1.x * p1.x + p1.y * p1.y
  const s2 = p2.x * p2.x + p2.y * p2.y
  const s3 = p3.x * p3.x + p3.y * p3.y
  const center: Point2D = {
    x: (s1 * (p2.y - p3.y) + s2 * (p3.y - p1.y) + s3 * (p1.y - p2.y)) / d,
    y: (s1 * (p3.x - p2.x) + s2 * (p1.x - p3.x) + s3 * (p2.x - p1.x)) / d
  }
  return { center, radius: distance(center, p1) }
}

/**
 * Círculo como polígono fechado de n segmentos: centro + um ponto da borda (raio).
 * n é adaptativo ao raio (corda alvo de TARGET_CHORD_PX), limitado a [16, 64] — círculos
 * pequenos não incham o banco com dezenas de paredes; grandes continuam visualmente suaves.
 * Retorna [] se o raio for menor que MIN_SHAPE_SIZE_PX.
 */
export function circleSegments(center: Point2D, edgePoint: Point2D): Segment2D[] {
  const radius = distance(center, edgePoint)
  if (radius < MIN_SHAPE_SIZE_PX) return []
  const n = clamp(Math.ceil((TWO_PI * radius) / TARGET_CHORD_PX), MIN_CIRCLE_SEGMENTS, MAX_CIRCLE_SEGMENTS)
  const points: Point2D[] = []
  for (let i = 0; i < n; i++) {
    const angle = (TWO_PI * i) / n
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) })
  }
  const segments: Segment2D[] = []
  for (let i = 0; i < n; i++) {
    segments.push({ start: points[i], end: points[(i + 1) % n] })
  }
  return segments
}

/**
 * Arco de p1 a p2 passando por pMid, tesselado em segmentos. Há sempre DUAS varreduras
 * angulares possíveis de p1 a p2 na circunferência — escolhe a que contém pMid.
 * As pontas do resultado são exatamente p1 e p2 (mesma referência), não reamostradas.
 * Pontos colineares (ou p1≈p2) degradam pra um segmento reto p1→p2; [] se p1≈p2.
 */
export function arcSegments(p1: Point2D, p2: Point2D, pMid: Point2D): Segment2D[] {
  if (distance(p1, p2) < MIN_SHAPE_SIZE_PX) return []
  const circle = circleThrough3Points(p1, p2, pMid)
  if (!circle) return [{ start: p1, end: p2 }]

  const { center, radius } = circle
  const norm = (angle: number): number => ((angle % TWO_PI) + TWO_PI) % TWO_PI
  const a1 = norm(Math.atan2(p1.y - center.y, p1.x - center.x))
  const a2 = norm(Math.atan2(p2.y - center.y, p2.x - center.x))
  const am = norm(Math.atan2(pMid.y - center.y, pMid.x - center.x))
  const ccwToEnd = norm(a2 - a1)
  const ccwToMid = norm(am - a1)
  // pMid entre a1 e a2 no sentido anti-horário → varredura CCW; senão, CW (delta negativo).
  const sweep = ccwToMid <= ccwToEnd ? ccwToEnd : ccwToEnd - TWO_PI

  const arcLength = radius * Math.abs(sweep)
  const n = clamp(Math.ceil(arcLength / TARGET_CHORD_PX), MIN_ARC_SEGMENTS, MAX_ARC_SEGMENTS)
  const points: Point2D[] = [p1]
  for (let i = 1; i < n; i++) {
    const angle = a1 + (sweep * i) / n
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) })
  }
  points.push(p2)
  const segments: Segment2D[] = []
  for (let i = 0; i < n; i++) {
    segments.push({ start: points[i], end: points[i + 1] })
  }
  return segments
}

// ─── Formas paramétricas (ADR-046) ─────────────────────────────────────────────
// Círculo e arco novos NÃO são tesselados: a UI renderiza path SVG nativo a partir dos
// parâmetros e hit-testa pelos mesmos helpers. `circleSegments`/`arcSegments` acima ficam
// para o preview de arco em polilinha (rascunho) e testes/legado.

import type { WallShape } from '../../types/domain'

/** Função de clamp reutilizável nos helpers de edição de shape (normalmente `clampToImage`). */
export type ShapeClamp = (point: Point2D) => Point2D

/** Raio de um `WallShape` círculo (distância center→edge). */
export function circleRadius(center: Point2D, edge: Point2D): number {
  return distance(center, edge)
}

/**
 * Path SVG nativo (`A …`) do arco por 3 pontos. Reusa `circleThrough3Points` pra achar a
 * circunferência e escolhe a varredura que contém pMid (mesma lógica de `arcSegments`).
 * Pontos colineares (ou p1≈p2) degradam pra reta `M p1 L p2`; p1≈p2 → null (sem path).
 */
export function arcPathD(p1: Point2D, p2: Point2D, pMid: Point2D): string | null {
  if (distance(p1, p2) < MIN_SHAPE_SIZE_PX) return null
  const circle = circleThrough3Points(p1, p2, pMid)
  if (!circle) return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
  const { center, radius } = circle
  const norm = (angle: number): number => ((angle % TWO_PI) + TWO_PI) % TWO_PI
  const a1 = norm(Math.atan2(p1.y - center.y, p1.x - center.x))
  const a2 = norm(Math.atan2(p2.y - center.y, p2.x - center.x))
  const am = norm(Math.atan2(pMid.y - center.y, pMid.x - center.x))
  const ccwToEnd = norm(a2 - a1)
  const ccwToMid = norm(am - a1)
  const sweep = ccwToMid <= ccwToEnd ? ccwToEnd : ccwToEnd - TWO_PI
  const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0
  // sweep > 0 = atan2 crescente = horário na tela (y pra baixo) = sweep-flag 1 do SVG.
  const sweepFlag = sweep > 0 ? 1 : 0
  return `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${largeArc} ${sweepFlag} ${p2.x} ${p2.y}`
}

/** Papéis de handle de uma forma selecionada — control points virtuais, só no modo Selecionar. */
export type ShapeHandleRole = 'edge' | 'p1' | 'p2' | 'pMid'

export interface ShapeHandle {
  role: ShapeHandleRole
  x: number
  y: number
}

/** Handles do círculo: só a borda (`edge`) redimensiona — mover o corpo é arrastar a path, não um handle. */
export function circleHandlePoints(shape: Extract<WallShape, { kind: 'circle' }>): ShapeHandle[] {
  return [{ role: 'edge', x: shape.edge.x, y: shape.edge.y }]
}

/** Handles do arco: os 3 pontos da criação — p1/p2 são as pontas, pMid controla a curvatura. */
export function arcHandlePoints(shape: Extract<WallShape, { kind: 'arc' }>): ShapeHandle[] {
  return [
    { role: 'p1', x: shape.p1.x, y: shape.p1.y },
    { role: 'p2', x: shape.p2.x, y: shape.p2.y },
    { role: 'pMid', x: shape.pMid.x, y: shape.pMid.y }
  ]
}

/**
 * Translação rígida do corpo: clamp é aplicado ao ponto âncora (centro do círculo / p1 do arco)
 * e o delta REAL (pós-clamp) é repassado aos demais pontos — preserva raio/curvatura mesmo quando
 * o clamp empurra a âncora de volta pra dentro da imagem.
 *
 * Genérico em `S extends WallShape` pra preservar a variante: chamando com um círculo literal,
 * o TS devolve o círculo (`.center`/`.edge` acessíveis); chamando com `WallShape` (união), devolve
 * `WallShape` — quem chamou afunila por `kind` antes de ler campos.
 */
export function translateShape<S extends WallShape>(shape: S, dx: number, dy: number, clamp?: ShapeClamp): S {
  if (shape.kind === 'circle') {
    const target: Point2D = { x: shape.center.x + dx, y: shape.center.y + dy }
    const clamped = clamp ? clamp(target) : target
    const actualDx = clamped.x - shape.center.x
    const actualDy = clamped.y - shape.center.y
    return { ...shape, center: clamped, edge: { x: shape.edge.x + actualDx, y: shape.edge.y + actualDy } } as S
  }
  const target: Point2D = { x: shape.p1.x + dx, y: shape.p1.y + dy }
  const clamped = clamp ? clamp(target) : target
  const actualDx = clamped.x - shape.p1.x
  const actualDy = clamped.y - shape.p1.y
  return {
    ...shape,
    p1: clamped,
    p2: { x: shape.p2.x + actualDx, y: shape.p2.y + actualDy },
    pMid: { x: shape.pMid.x + actualDx, y: shape.pMid.y + actualDy }
  } as S
}

/**
 * Resize do círculo movendo a borda. Rejeita (retorna a forma inalterada) se o novo raio ficar
 * abaixo de `MIN_SHAPE_SIZE_PX` — evita colapsar o círculo num ponto num arraste curto.
 */
export function updateCircleEdge(
  shape: Extract<WallShape, { kind: 'circle' }>,
  edge: Point2D,
  clamp?: ShapeClamp
): Extract<WallShape, { kind: 'circle' }> {
  const clamped = clamp ? clamp(edge) : edge
  if (distance(shape.center, clamped) < MIN_SHAPE_SIZE_PX) return shape
  return { ...shape, edge: clamped }
}

/**
 * Edita um handle do arco. pMid sempre é aceito (arco colinear vira reta — válido). p1/p2 são
 * rejeitados se colapsarem contra a outra ponta (< `MIN_SHAPE_SIZE_PX`), pra não sumir o arco.
 */
export function updateArcHandle(
  shape: Extract<WallShape, { kind: 'arc' }>,
  role: 'p1' | 'p2' | 'pMid',
  point: Point2D,
  clamp?: ShapeClamp
): Extract<WallShape, { kind: 'arc' }> {
  const clamped = clamp ? clamp(point) : point
  if (role === 'pMid') return { ...shape, pMid: clamped }
  const other = role === 'p1' ? shape.p2 : shape.p1
  if (distance(other, clamped) < MIN_SHAPE_SIZE_PX) return shape
  return { ...shape, [role]: clamped }
}
