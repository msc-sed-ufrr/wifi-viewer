import { describe, expect, it } from 'vitest'
import { buildChannelAxis, buildChannelUsage, channelColor } from './channelUsage'
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

describe('buildChannelUsage', () => {
  it('keeps one entry per bssid, using the strongest reading seen at any point', () => {
    const readingsByPoint = new Map<string, StoredNetworkReading[]>([
      ['p1', [reading({ id: 'a', bssid: 'aa:aa:aa:aa:aa:aa', signalDbm: -70 })]],
      ['p2', [reading({ id: 'b', bssid: 'aa:aa:aa:aa:aa:aa', signalDbm: -40 })]]
    ])
    const usage = buildChannelUsage(readingsByPoint)
    expect(usage).toHaveLength(1)
    expect(usage[0].dbm).toBe(-40)
  })

  it('keeps dual-band radios of the same SSID as separate entries', () => {
    const readingsByPoint = new Map<string, StoredNetworkReading[]>([
      [
        'p1',
        [
          reading({ id: 'a', ssid: 'Home', bssid: 'aa:aa:aa:aa:aa:aa', primaryChannel: 6 }),
          reading({ id: 'b', ssid: 'Home', bssid: 'bb:bb:bb:bb:bb:bb', primaryChannel: 149 })
        ]
      ]
    ])
    const usage = buildChannelUsage(readingsByPoint)
    expect(usage).toHaveLength(2)
    expect(usage.map((u) => u.band).sort()).toEqual(['2.4GHz', '5GHz'])
  })

  it('excludes readings with an unrecognized channel', () => {
    const readingsByPoint = new Map<string, StoredNetworkReading[]>([
      ['p1', [reading({ primaryChannel: 0 })]]
    ])
    expect(buildChannelUsage(readingsByPoint)).toHaveLength(0)
  })

  it('sorts entries by label for a stable, deterministic order', () => {
    const readingsByPoint = new Map<string, StoredNetworkReading[]>([
      [
        'p1',
        [
          reading({ id: 'a', ssid: 'Zebra', bssid: 'aa:aa:aa:aa:aa:aa' }),
          reading({ id: 'b', ssid: 'Alpha', bssid: 'bb:bb:bb:bb:bb:bb' })
        ]
      ]
    ])
    expect(buildChannelUsage(readingsByPoint).map((u) => u.label)).toEqual(['Alpha', 'Zebra'])
  })
})

describe('channelColor', () => {
  it('gives different networks visually distinct colors', () => {
    const colors = [0, 1, 2, 3].map(channelColor)
    const unique = new Set(colors.map((c) => c.join(',')))
    expect(unique.size).toBe(colors.length)
  })

  it('is stable for the same index', () => {
    expect(channelColor(2)).toEqual(channelColor(2))
  })
})

describe('buildChannelAxis', () => {
  it('gives every 2.4GHz channel a contiguous, evenly-spaced axis', () => {
    const axis = buildChannelAxis('2.4GHz', [])
    expect(axis).toEqual(Array.from({ length: 14 }, (_, i) => i + 1))
  })

  it('unions the 5GHz canonical channel list with any observed outlier', () => {
    const axis = buildChannelAxis('5GHz', [
      { bssid: 'a', label: 'A', channel: 42, widthMhz: 20, dbm: -50, band: '5GHz' }
    ])
    expect(axis).toContain(36)
    expect(axis).toContain(42)
    expect(axis).toContain(165)
    expect(axis).toEqual([...axis].sort((a, b) => a - b))
  })

  it('does not pull 2.4GHz entries into the 5GHz axis', () => {
    const axis = buildChannelAxis('5GHz', [
      { bssid: 'a', label: 'A', channel: 6, widthMhz: 20, dbm: -50, band: '2.4GHz' }
    ])
    expect(axis).not.toContain(6)
  })
})
