import { describe, expect, it } from 'vitest'
import { computeIdwGrid } from './idw'

describe('computeIdwGrid', () => {
  it('returns close to the exact value and high confidence at a cell centered on a single point', () => {
    const grid = computeIdwGrid([{ x: 4, y: 4, valueDbm: -50 }], 8, 8, 8, { sigma: 50 })
    expect(grid.cols).toBe(1)
    expect(grid.rows).toBe(1)
    expect(grid.cells[0].value).toBeCloseTo(-50, 5)
    expect(grid.cells[0].confidence).toBeGreaterThan(0.9)
  })

  it('fades confidence smoothly toward zero far from every point (no hard cutoff)', () => {
    // ~100px de um ponto com sigma=50: bem além do "raio" perceptível, mas ainda dentro
    // da precisão de ponto flutuante — confirma decaimento gradual, não um corte abrupto
    // num raio configurado. Confiança usa um sigma efetivo bem menor que o do valor
    // (CONFIDENCE_SIGMA_SCALE, ver ADR-027/029), por isso essa distância é bem menor que
    // os ~6x sigma que bastavam antes do ADR-026 alargar o sigma do valor.
    const grid = computeIdwGrid([{ x: 4, y: 4, valueDbm: -50 }], 100, 8, 8, { sigma: 50 })
    const lastCellIndex = grid.cols - 1
    expect(grid.cells[lastCellIndex].confidence).toBeLessThan(0.001)
    expect(grid.cells[lastCellIndex].confidence).toBeGreaterThan(0)
  })

  it('interpolates between two points, weighting the closer one more heavily', () => {
    const grid = computeIdwGrid(
      [
        { x: 0, y: 4, valueDbm: -30 },
        { x: 100, y: 4, valueDbm: -90 }
      ],
      100,
      8,
      10,
      { sigma: 50 }
    )
    const midIndex = Math.floor(grid.cols / 2)
    const nearLeftValue = grid.cells[1].value
    const midValue = grid.cells[midIndex].value
    // mais perto do ponto forte (-30) do que do centro exato
    expect(nearLeftValue).toBeGreaterThan(midValue)
    expect(midValue).toBeGreaterThan(-90)
    expect(midValue).toBeLessThan(-30)
  })

  it('sums confidence from overlapping points instead of capping at a single blob', () => {
    const onePoint = computeIdwGrid([{ x: 50, y: 4, valueDbm: -50 }], 100, 8, 10, { sigma: 50 })
    const twoPoints = computeIdwGrid(
      [
        { x: 50, y: 4, valueDbm: -50 },
        { x: 55, y: 4, valueDbm: -50 }
      ],
      100,
      8,
      10,
      { sigma: 50 }
    )
    const cellIndex = Math.floor(onePoint.cols / 2)
    expect(twoPoints.cells[cellIndex].confidence).toBeGreaterThan(onePoint.cells[cellIndex].confidence)
  })

  it('keeps interpolation intensity at its floor right on top of a single isolated point (ADR-031)', () => {
    // uma única fonte sustenta esse valor — mesmo com confiança ~máxima ali (dx=dy=0),
    // a intensidade não deve subir: "quantas fontes independentes", não "quão perto".
    const grid = computeIdwGrid([{ x: 4, y: 4, valueDbm: -50 }], 8, 8, 8, { sigma: 50 })
    expect(grid.cells[0].confidence).toBeGreaterThan(0.9)
    expect(grid.cells[0].interpolationIntensity).toBeCloseTo(0.3, 5)
  })

  it('raises interpolation intensity when a second point contributes comparably nearby (ADR-031)', () => {
    const onePoint = computeIdwGrid([{ x: 50, y: 4, valueDbm: -50 }], 100, 8, 10, { sigma: 50 })
    const twoPoints = computeIdwGrid(
      [
        { x: 50, y: 4, valueDbm: -50 },
        { x: 55, y: 4, valueDbm: -50 }
      ],
      100,
      8,
      10,
      { sigma: 50 }
    )
    const cellIndex = Math.floor(onePoint.cols / 2)
    expect(twoPoints.cells[cellIndex].interpolationIntensity).toBeGreaterThan(
      onePoint.cells[cellIndex].interpolationIntensity
    )
  })
})
