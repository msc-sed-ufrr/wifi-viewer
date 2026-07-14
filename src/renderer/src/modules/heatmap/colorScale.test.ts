import { describe, expect, it } from 'vitest'
import { dbmToColor, dbmToSigma, distanceToSigmaMeters, gridToRgba } from './colorScale'
import type { IdwGrid } from './idw'

describe('dbmToColor', () => {
  it('clamps very strong signals to the best color stop', () => {
    expect(dbmToColor(-10)).toEqual(dbmToColor(-30))
  })

  it('clamps very weak signals to the worst color stop', () => {
    expect(dbmToColor(-100)).toEqual(dbmToColor(-90))
  })

  it('interpolates between stops for intermediate values', () => {
    const mid = dbmToColor(-45)
    expect(mid).not.toEqual(dbmToColor(-30))
    expect(mid).not.toEqual(dbmToColor(-60))
  })
})

describe('gridToRgba', () => {
  it('fades opacity to fully transparent far from data, and to a high-but-not-solid opacity near a confirmed point (ADR-026)', () => {
    const grid: IdwGrid = {
      cols: 2,
      rows: 1,
      cellSize: 8,
      cells: [
        { value: -30, confidence: 0, interpolationIntensity: 1 },
        { value: -30, confidence: 1, interpolationIntensity: 1 }
      ]
    }
    const rgba = gridToRgba(grid)
    // confiança zero: totalmente transparente — nunca um tom sólido igual a um sinal confirmado
    expect(rgba[3]).toBe(0)
    // confiança total: opacidade bem mais alta, mas nunca 100% (planta continua visível por baixo).
    // Não fixa uma % exata aqui — MAX_ALPHA é ajustado à mão em colorScale.ts.
    expect(rgba[7]).toBeGreaterThan(50)
    expect(rgba[7]).toBeLessThan(255)
  })

  it('applies extra transparency to weak signals (médio/fraco/muito fraco) even at full confidence (ADR-028)', () => {
    const grid: IdwGrid = {
      cols: 3,
      rows: 1,
      cellSize: 8,
      cells: [
        { value: -30, confidence: 1, interpolationIntensity: 1 }, // excelente
        { value: -66, confidence: 1, interpolationIntensity: 1 }, // médio
        { value: -90, confidence: 1, interpolationIntensity: 1 } // muito fraco
      ]
    }
    const rgba = gridToRgba(grid)
    // mesma confiança total nos três, mas a opacidade cai de excelente -> médio -> muito fraco
    expect(rgba[7]).toBeLessThan(rgba[3])
    expect(rgba[11]).toBeLessThan(rgba[7])
    expect(rgba[11]).toBeGreaterThan(0)
  })

  it('fades opacity smoothly with confidence between zero and the ceiling', () => {
    const grid: IdwGrid = {
      cols: 3,
      rows: 1,
      cellSize: 8,
      cells: [
        { value: -30, confidence: 0.1, interpolationIntensity: 1 },
        { value: -30, confidence: 0.5, interpolationIntensity: 1 },
        { value: -30, confidence: 0.9, interpolationIntensity: 1 }
      ]
    }
    const rgba = gridToRgba(grid)
    expect(rgba[3]).toBeLessThan(rgba[7])
    expect(rgba[7]).toBeLessThan(rgba[11])
  })

  it('dims cells backed by a single point even at full confidence, vs. cells backed by several (ADR-031)', () => {
    const grid: IdwGrid = {
      cols: 2,
      rows: 1,
      cellSize: 8,
      cells: [
        { value: -30, confidence: 1, interpolationIntensity: 0.3 }, // um único ponto isolado sustenta o valor
        { value: -30, confidence: 1, interpolationIntensity: 1 } // vários pontos convergindo
      ]
    }
    const rgba = gridToRgba(grid)
    expect(rgba[3]).toBeLessThan(rgba[7])
    expect(rgba[3]).toBeGreaterThan(0)
  })
})

describe('dbmToSigma', () => {
  it('gives weak signals the smallest spread', () => {
    expect(dbmToSigma(-95)).toBe(dbmToSigma(-90))
  })

  it('gives strong signals the largest spread', () => {
    expect(dbmToSigma(-20)).toBe(dbmToSigma(-30))
  })

  it('scales monotonically between the extremes', () => {
    expect(dbmToSigma(-60)).toBeGreaterThan(dbmToSigma(-90))
    expect(dbmToSigma(-30)).toBeGreaterThan(dbmToSigma(-60))
  })
})

describe('distanceToSigmaMeters', () => {
  it('gives sources very close by the largest spread', () => {
    expect(distanceToSigmaMeters(0.1)).toBe(distanceToSigmaMeters(1))
  })

  it('gives far-away sources the smallest spread', () => {
    expect(distanceToSigmaMeters(100)).toBe(distanceToSigmaMeters(40))
  })

  it('scales monotonically down as distance increases', () => {
    expect(distanceToSigmaMeters(2)).toBeGreaterThan(distanceToSigmaMeters(20))
    expect(distanceToSigmaMeters(20)).toBeGreaterThan(distanceToSigmaMeters(39))
  })
})
