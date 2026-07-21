import { describe, expect, it } from 'vitest'
import {
  arcHandlePoints,
  arcPathD,
  arcSegments,
  circleHandlePoints,
  circleRadius,
  circleSegments,
  circleThrough3Points,
  MAX_ARC_SEGMENTS,
  MAX_CIRCLE_SEGMENTS,
  MIN_ARC_SEGMENTS,
  MIN_CIRCLE_SEGMENTS,
  rectangleSegments,
  translateShape,
  updateArcHandle,
  updateCircleEdge
} from './shapes'

/** Distância mínima de um ponto a qualquer vértice da polilinha — pra checar que o arco passa por pMid. */
function minDistanceToPolyline(point: { x: number; y: number }, segments: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }>): number {
  let min = Infinity
  for (const segment of segments) {
    min = Math.min(min, Math.hypot(segment.start.x - point.x, segment.start.y - point.y))
  }
  return min
}

describe('rectangleSegments', () => {
  it('returns [] for a zero-size drag', () => {
    expect(rectangleSegments({ x: 10, y: 10 }, { x: 10, y: 10 }, false)).toEqual([])
  })

  it('returns [] when one side is below the minimum size', () => {
    expect(rectangleSegments({ x: 0, y: 0 }, { x: 100, y: 2 }, false)).toEqual([])
  })

  it('builds an axis-aligned rectangle from corner to corner', () => {
    const segments = rectangleSegments({ x: 0, y: 0 }, { x: 10, y: 20 }, false)
    expect(segments).toHaveLength(4)
    const corners = segments.map((segment) => segment.start)
    expect(corners).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 }
    ])
  })

  it('produces the same geometry when dragging in the opposite direction', () => {
    const forward = rectangleSegments({ x: 0, y: 0 }, { x: 10, y: 20 }, false)
    const inverted = rectangleSegments({ x: 10, y: 20 }, { x: 0, y: 0 }, false)
    const xs = inverted.flatMap((segment) => [segment.start.x, segment.end.x])
    const ys = inverted.flatMap((segment) => [segment.start.y, segment.end.y])
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(10)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBe(20)
    expect(forward).toHaveLength(inverted.length)
  })

  it('constrains to a square using the dominant axis (horizontal)', () => {
    const segments = rectangleSegments({ x: 0, y: 0 }, { x: 30, y: 10 }, true)
    for (const segment of segments) {
      const width = Math.abs(segment.end.x - segment.start.x)
      const height = Math.abs(segment.end.y - segment.start.y)
      expect(Math.max(width, height)).toBe(30)
    }
  })

  it('constrains to a square using the dominant axis (vertical), respecting drag quadrant', () => {
    const segments = rectangleSegments({ x: 50, y: 50 }, { x: 40, y: 20 }, true)
    // |dy|=30 domina; quadrante do arraste é pra esquerda e pra cima → canto oposto em (20, 20)
    const xs = segments.flatMap((segment) => [segment.start.x, segment.end.x])
    const ys = segments.flatMap((segment) => [segment.start.y, segment.end.y])
    expect(Math.min(...xs)).toBe(20)
    expect(Math.max(...xs)).toBe(50)
    expect(Math.min(...ys)).toBe(20)
    expect(Math.max(...ys)).toBe(50)
  })

  it('shares corner point references between adjacent segments (exact dedupe key)', () => {
    const segments = rectangleSegments({ x: 0, y: 0 }, { x: 10, y: 20 }, false)
    for (let i = 0; i < segments.length; i++) {
      const next = segments[(i + 1) % segments.length]
      expect(segments[i].end).toBe(next.start)
    }
  })
})

describe('circleThrough3Points', () => {
  it('computes the circumcircle of a right triangle', () => {
    const circle = circleThrough3Points({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 })
    expect(circle).not.toBeNull()
    expect(circle!.center.x).toBeCloseTo(0.5, 9)
    expect(circle!.center.y).toBeCloseTo(0.5, 9)
    expect(circle!.radius).toBeCloseTo(Math.SQRT1_2, 9)
  })

  it('returns null for collinear points', () => {
    expect(circleThrough3Points({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBeNull()
  })

  it('is invariant to the order of the three points', () => {
    const a = circleThrough3Points({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 })
    const b = circleThrough3Points({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 })
    expect(a!.center.x).toBeCloseTo(b!.center.x, 9)
    expect(a!.center.y).toBeCloseTo(b!.center.y, 9)
    expect(a!.radius).toBeCloseTo(b!.radius, 9)
  })
})

describe('circleSegments', () => {
  it('returns [] when the radius is below the minimum size', () => {
    expect(circleSegments({ x: 0, y: 0 }, { x: 0, y: 0 }, )).toEqual([])
    expect(circleSegments({ x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([])
  })

  it('uses the minimum segment count for small circles and closes the loop', () => {
    // r=10 → circunferência ~63px → ~8 cordas de 8px, mas o piso é MIN_CIRCLE_SEGMENTS
    const segments = circleSegments({ x: 100, y: 100 }, { x: 110, y: 100 })
    expect(segments).toHaveLength(MIN_CIRCLE_SEGMENTS)
    expect(segments[segments.length - 1].end).toBe(segments[0].start)
  })

  it('caps the segment count for very large circles', () => {
    // r=200 → circunferência ~1257px → ~158 cordas, limitado a MAX_CIRCLE_SEGMENTS
    const segments = circleSegments({ x: 500, y: 500 }, { x: 700, y: 500 })
    expect(segments).toHaveLength(MAX_CIRCLE_SEGMENTS)
  })

  it('keeps every vertex on the circumference', () => {
    const center = { x: 100, y: 100 }
    const segments = circleSegments(center, { x: 130, y: 100 })
    for (const segment of segments) {
      expect(Math.hypot(segment.start.x - center.x, segment.start.y - center.y)).toBeCloseTo(30, 6)
    }
  })

  it('shares point references between adjacent segments', () => {
    const segments = circleSegments({ x: 0, y: 0 }, { x: 50, y: 0 })
    for (let i = 0; i < segments.length; i++) {
      const next = segments[(i + 1) % segments.length]
      expect(segments[i].end).toBe(next.start)
    }
  })
})

describe('arcSegments', () => {
  it('returns [] when start and end are too close', () => {
    expect(arcSegments({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 5 })).toEqual([])
  })

  it('degrades to a single straight segment when the three points are collinear', () => {
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 100, y: 0 }
    const segments = arcSegments(p1, p2, { x: 50, y: 0 })
    expect(segments).toHaveLength(1)
    expect(segments[0].start).toBe(p1)
    expect(segments[0].end).toBe(p2)
  })

  it('starts exactly at p1 and ends exactly at p2', () => {
    const p1 = { x: 0, y: 0 }
    const p2 = { x: 100, y: 0 }
    const segments = arcSegments(p1, p2, { x: 50, y: -30 })
    expect(segments[0].start).toBe(p1)
    expect(segments[segments.length - 1].end).toBe(p2)
  })

  it('passes through the mid point (within chord tolerance)', () => {
    const pMid = { x: 50, y: -30 }
    const segments = arcSegments({ x: 0, y: 0 }, { x: 100, y: 0 }, pMid)
    // pMid pode cair no meio de uma corda; a distância à polilinha é no máximo ~meia corda
    expect(minDistanceToPolyline(pMid, segments)).toBeLessThan(8)
  })

  it('bulges to opposite sides for mid points on opposite half-planes', () => {
    const up = arcSegments({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -30 })
    const down = arcSegments({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 30 })
    const midUp = up[Math.floor(up.length / 2)].start
    const midDown = down[Math.floor(down.length / 2)].start
    expect(midUp.y).toBeLessThan(0)
    expect(midDown.y).toBeGreaterThan(0)
  })

  it('respects the segment count floor and ceiling', () => {
    // Arco raso e curto → piso
    const shallow = arcSegments({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: -1 })
    expect(shallow.length).toBeGreaterThanOrEqual(MIN_ARC_SEGMENTS)
    // Quase círculo completo com raio grande → teto
    const full = arcSegments({ x: 300, y: 0 }, { x: 300.5, y: 0 }, { x: -300, y: 0 })
    expect(full.length).toBeLessThanOrEqual(MAX_ARC_SEGMENTS)
  })

  it('sweeps exactly 90° along the circle for a quarter-circle arc', () => {
    // p1=(100,0), p2=(0,100) num círculo de raio 100, pMid na diagonal → arco de 90° centrado na origem
    // (escala de px de imagem — um círculo unitário cairia abaixo de MIN_SHAPE_SIZE_PX).
    // Mede a varredura pelos ângulos polares dos pontos amostrados (que estão SOBRE a circunferência),
    // não pela direção das cordas — a corda subestima a varredura em 1/n por construção.
    const segments = arcSegments({ x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100 * Math.SQRT1_2, y: 100 * Math.SQRT1_2 })
    const points = [segments[0].start, ...segments.map((segment) => segment.end)]
    let span = 0
    for (let i = 1; i < points.length; i++) {
      // todo ponto amostrado está exatamente sobre a circunferência de raio 100
      expect(Math.hypot(points[i].x, points[i].y)).toBeCloseTo(100, 4)
      const a1 = Math.atan2(points[i - 1].y, points[i - 1].x)
      const a2 = Math.atan2(points[i].y, points[i].x)
      let delta = a2 - a1
      while (delta > Math.PI) delta -= 2 * Math.PI
      while (delta < -Math.PI) delta += 2 * Math.PI
      span += delta
    }
    expect(Math.abs(span)).toBeCloseTo(Math.PI / 2, 4)
  })
})

describe('arcPathD', () => {
  it('returns null when start and end are too close', () => {
    expect(arcPathD({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 5 })).toBeNull()
  })

  it('degrades to a straight line when the three points are collinear', () => {
    const d = arcPathD({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 })
    expect(d).toBe('M 0 0 L 100 0')
  })

  it('emits a valid SVG arc command with correct endpoints for a quarter-circle', () => {
    // Mesmo caso do teste de varredura: p1=(100,0), p2=(0,100), pMid na diagonal inferior-direita.
    // Circunferência raio 100 centrada na origem; varredura de 90° horária na tela → small-arc, sweep=1.
    const d = arcPathD({ x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100 * Math.SQRT1_2, y: 100 * Math.SQRT1_2 })
    expect(d).not.toBeNull()
    // Estrutura: M p1 A r r 0 largeArc sweep p2
    expect(d).toMatch(/^M 100 0 A 100 100 0 0 1 0 100$/)
  })

  it('passes through pMid on the chosen arc (bulge direction matches the 3-point arc)', () => {
    // Arco pra cima vs pra baixo (mesma corda, pMid em lados opostos) deve produzir sweep flags opostos.
    const up = arcPathD({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -30 })!
    const down = arcPathD({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 30 })!
    // Path: "M p1x p1y A r r 0 largeArc sweepFlag p2x p2y" — sweepFlag é o 3º token a partir do fim.
    const upSweep = up.split(' ').slice(-3)[0]
    const downSweep = down.split(' ').slice(-3)[0]
    expect(upSweep).not.toBe(downSweep)
  })

  it('uses the large-arc flag for arcs greater than 180°', () => {
    // p1=(100,0), p2=(0,100) na circunferência raio 100 centrada na origem; pMid no lado oposto
    // (terceiro quadrante) → o arco que contém pMid varre ~270° (large-arc flag = 1).
    const d = arcPathD({ x: 100, y: 0 }, { x: 0, y: 100 }, { x: -100 * Math.SQRT1_2, y: -100 * Math.SQRT1_2 })!
    const parts = d.split(' ')
    const largeArc = parts[parts.length - 4] // largeArc é o 4º token a partir do fim (largeArc sweep p2x p2y)
    expect(largeArc).toBe('1')
  })
})

describe('circleRadius / circleHandlePoints', () => {
  it('computes the distance from center to edge', () => {
    expect(circleRadius({ x: 0, y: 0 }, { x: 30, y: 40 })).toBeCloseTo(50, 9)
  })

  it('returns only the edge handle for a circle', () => {
    const handles = circleHandlePoints({ id: 'c', floorPlanId: 'fp', kind: 'circle', center: { x: 10, y: 10 }, edge: { x: 40, y: 10 } })
    expect(handles).toEqual([{ role: 'edge', x: 40, y: 10 }])
  })
})

describe('arcHandlePoints', () => {
  it('returns p1, p2 and pMid as the three control handles', () => {
    const handles = arcHandlePoints({
      id: 'a',
      floorPlanId: 'fp',
      kind: 'arc',
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      pMid: { x: 50, y: -30 }
    })
    expect(handles.map((handle) => handle.role)).toEqual(['p1', 'p2', 'pMid'])
  })
})

describe('translateShape', () => {
  it('translates a circle rigidly (center and edge by the same delta)', () => {
    const shape = { id: 'c', floorPlanId: 'fp', kind: 'circle' as const, center: { x: 100, y: 100 }, edge: { x: 130, y: 100 } }
    const moved = translateShape(shape, 50, 20)
    expect(moved.center).toEqual({ x: 150, y: 120 })
    expect(moved.edge).toEqual({ x: 180, y: 120 })
    expect(circleRadius(moved.center, moved.edge)).toBeCloseTo(30, 9)
  })

  it('translates an arc rigidly (all three points by the same delta)', () => {
    const shape = {
      id: 'a',
      floorPlanId: 'fp',
      kind: 'arc' as const,
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      pMid: { x: 50, y: -30 }
    }
    const moved = translateShape(shape, -10, 5)
    expect(moved.p1).toEqual({ x: -10, y: 5 })
    expect(moved.p2).toEqual({ x: 90, y: 5 })
    expect(moved.pMid).toEqual({ x: 40, y: -25 })
  })

  it('clamps the anchor and repays only the real delta to the other points (radius preserved)', () => {
    const shape = { id: 'c', floorPlanId: 'fp', kind: 'circle' as const, center: { x: 100, y: 100 }, edge: { x: 130, y: 100 } }
    // Clamp empurra o centro de volta pra (110,100) em vez de (150,100) — o edge acompanha o delta real.
    const clamp = (point: { x: number; y: number }) => ({ x: Math.min(point.x, 110), y: point.y })
    const moved = translateShape(shape, 50, 0, clamp)
    expect(moved.center).toEqual({ x: 110, y: 100 })
    expect(moved.edge).toEqual({ x: 140, y: 100 })
    expect(circleRadius(moved.center, moved.edge)).toBeCloseTo(30, 9)
  })
})

describe('updateCircleEdge', () => {
  it('moves the edge to the new point', () => {
    const shape = { id: 'c', floorPlanId: 'fp', kind: 'circle' as const, center: { x: 0, y: 0 }, edge: { x: 30, y: 0 } }
    const updated = updateCircleEdge(shape, { x: 0, y: 50 })
    expect(updated.edge).toEqual({ x: 0, y: 50 })
  })

  it('rejects an edge that would collapse the radius below the minimum size', () => {
    const shape = { id: 'c', floorPlanId: 'fp', kind: 'circle' as const, center: { x: 0, y: 0 }, edge: { x: 30, y: 0 } }
    const updated = updateCircleEdge(shape, { x: 1, y: 0 })
    // raio resultante ~1 < MIN_SHAPE_SIZE_PX → forma inalterada
    expect(updated.edge).toEqual({ x: 30, y: 0 })
  })

  it('applies the clamp to the new edge point', () => {
    const shape = { id: 'c', floorPlanId: 'fp', kind: 'circle' as const, center: { x: 0, y: 0 }, edge: { x: 30, y: 0 } }
    // Clamp limita x a 20 — um edge pedido em (50,0) cai pra (20,0), ainda com raio válido.
    const clamp = (point: { x: number; y: number }) => ({ x: Math.min(point.x, 20), y: point.y })
    const updated = updateCircleEdge(shape, { x: 50, y: 0 }, clamp)
    expect(updated.edge).toEqual({ x: 20, y: 0 })
  })
})

describe('updateArcHandle', () => {
  const shape = {
    id: 'a',
    floorPlanId: 'fp',
    kind: 'arc' as const,
    p1: { x: 0, y: 0 },
    p2: { x: 100, y: 0 },
    pMid: { x: 50, y: -30 }
  }

  it('moves pMid freely (collinear arc → still valid)', () => {
    const updated = updateArcHandle(shape, 'pMid', { x: 50, y: 0 })
    expect(updated.pMid).toEqual({ x: 50, y: 0 })
  })

  it('moves p1 while keeping p2 and pMid', () => {
    const updated = updateArcHandle(shape, 'p1', { x: 20, y: 10 })
    expect(updated.p1).toEqual({ x: 20, y: 10 })
    expect(updated.p2).toEqual(shape.p2)
    expect(updated.pMid).toEqual(shape.pMid)
  })

  it('rejects a new p1 that collapses against p2', () => {
    const updated = updateArcHandle(shape, 'p1', { x: 100, y: 0 })
    expect(updated.p1).toEqual({ x: 0, y: 0 })
  })

  it('rejects a new p2 that collapses against p1', () => {
    const updated = updateArcHandle(shape, 'p2', { x: 0, y: 0 })
    expect(updated.p2).toEqual({ x: 100, y: 0 })
  })

  it('applies the clamp to the handle point', () => {
    const clamp = (point: { x: number; y: number }) => ({ x: point.x, y: Math.max(point.y, 0) })
    const updated = updateArcHandle(shape, 'pMid', { x: 50, y: -30 }, clamp)
    expect(updated.pMid).toEqual({ x: 50, y: 0 })
  })
})
