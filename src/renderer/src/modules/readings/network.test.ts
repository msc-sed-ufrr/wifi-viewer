import { describe, expect, it } from 'vitest'
import { filterReadingsByBand, getReadingBand, getStrongestReading } from './network'
import type { StoredNetworkReading } from '../../types/domain'

function reading(overrides: Partial<StoredNetworkReading>): StoredNetworkReading {
  return {
    id: 'r1',
    pointId: 'p1',
    ssid: 'Test',
    bssid: 'aa:bb:cc:dd:ee:ff',
    signalDbm: -60,
    signalSource: 'measured',
    primaryChannel: 6,
    security: '',
    capturedAt: '2026-07-05T00:00:00Z',
    ...overrides
  }
}

describe('getReadingBand', () => {
  it('classifies channels 1-14 as 2.4GHz', () => {
    expect(getReadingBand({ primaryChannel: 1 })).toBe('2.4GHz')
    expect(getReadingBand({ primaryChannel: 11 })).toBe('2.4GHz')
  })

  it('classifies channels 36+ as 5GHz', () => {
    expect(getReadingBand({ primaryChannel: 36 })).toBe('5GHz')
    expect(getReadingBand({ primaryChannel: 149 })).toBe('5GHz')
  })

  it('falls back to unknown for out-of-range channels', () => {
    expect(getReadingBand({ primaryChannel: 0 })).toBe('unknown')
  })
})

describe('filterReadingsByBand', () => {
  const readings = [reading({ id: 'a', primaryChannel: 6 }), reading({ id: 'b', primaryChannel: 149 })]

  it('returns everything for "all"', () => {
    expect(filterReadingsByBand(readings, 'all')).toHaveLength(2)
  })

  it('keeps only matching-band readings', () => {
    expect(filterReadingsByBand(readings, '2.4GHz').map((r) => r.id)).toEqual(['a'])
    expect(filterReadingsByBand(readings, '5GHz').map((r) => r.id)).toEqual(['b'])
  })
})

describe('getStrongestReading', () => {
  it('picks the strongest signal regardless of which network it belongs to', () => {
    const readings = [
      reading({ id: 'a', ssid: 'NetworkA', signalDbm: -70 }),
      reading({ id: 'b', ssid: 'NetworkB', signalDbm: -40 }),
      reading({ id: 'c', ssid: 'NetworkC', signalDbm: -55 })
    ]
    expect(getStrongestReading(readings)?.id).toBe('b')
  })

  it('returns undefined for an empty list', () => {
    expect(getStrongestReading([])).toBeUndefined()
  })
})
