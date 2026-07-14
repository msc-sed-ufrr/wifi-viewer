import { describe, expect, it } from 'vitest'
import { estimateDistanceFromRssi, getDistanceMeters } from './distance'

describe('estimateDistanceFromRssi', () => {
  it('estimates ~1 meter at the reference RSSI', () => {
    expect(estimateDistanceFromRssi(-40)).toBeCloseTo(1, 5)
  })

  it('estimates a larger distance for weaker signals', () => {
    expect(estimateDistanceFromRssi(-70)).toBeGreaterThan(estimateDistanceFromRssi(-50))
  })

  it('estimates a smaller distance for stronger signals', () => {
    expect(estimateDistanceFromRssi(-30)).toBeLessThan(estimateDistanceFromRssi(-40))
  })
})

describe('getDistanceMeters', () => {
  it('uses the reading-provided distance when present, marked as not estimated', () => {
    expect(getDistanceMeters({ signalDbm: -80, distanceMeters: 12.5 })).toEqual({
      meters: 12.5,
      estimated: false
    })
  })

  it('falls back to an RSSI-based estimate when no distance is provided, marked as estimated', () => {
    const result = getDistanceMeters({ signalDbm: -40 })
    expect(result.estimated).toBe(true)
    expect(result.meters).toBeCloseTo(1, 5)
  })
})
