import { describe, expect, it } from 'vitest'
import { channelSpectrum, countOverlappingRadios, interferenceColor, interferenceGridToRgba } from './interference'
import { filterReadingsByBand } from '../readings/network'
import type { StoredNetworkReading } from '../../types/domain'

function reading(bssid: string, channel: number, widthMhz = 20, ssid = 'UFRR'): StoredNetworkReading {
  return { id: bssid, pointId: 'p', bssid, ssid, primaryChannel: channel, widthMhz, signalDbm: -50, signalSource: 'measured', security: '', capturedAt: '' }
}

describe('channel overlap', () => {
  it('counts individual BSSIDs sharing an SSID, ignoring repeated captures and case', () => {
    expect(countOverlappingRadios([reading('aa', 6), reading('AA', 6), reading('bb', 6), reading('cc', 6)])).toBe(3)
  })
  it('detects partially overlapping 2.4 GHz channels without counting disjoint ones', () => {
    expect(countOverlappingRadios([reading('a', 1), reading('b', 2)])).toBe(2)
    expect(countOverlappingRadios([reading('a', 1), reading('b', 6), reading('c', 11)])).toBe(1)
    expect(countOverlappingRadios([reading('a', 1), reading('b', 5)])).toBe(1)
  })
  it('counts the maximum common spectral cluster, not a chain of adjacent overlaps', () => {
    expect(countOverlappingRadios([reading('a', 1), reading('b', 4), reading('c', 7)])).toBe(2)
  })
  it('does not mix bands and respects the existing band filter', () => {
    const rows = [reading('a', 6), reading('b', 7), reading('c', 36)]
    expect(countOverlappingRadios(rows)).toBe(2)
    expect(countOverlappingRadios(filterReadingsByBand(rows, '5GHz'))).toBe(1)
    expect(countOverlappingRadios(filterReadingsByBand(rows, '2.4GHz'))).toBe(2)
  })
  it('uses bonded 5 GHz blocks instead of centering width on the primary channel', () => {
    expect(channelSpectrum(reading('a', 36, 80))).toEqual([5170, 5250])
    expect(countOverlappingRadios([reading('a', 36, 80), reading('b', 48), reading('c', 52)])).toBe(2)
    expect(countOverlappingRadios([reading('a', 36, 20), reading('b', 40, 20)])).toBe(1)
  })
  it('does not invent a 2.4 GHz secondary channel when its direction is unknown', () => {
    expect(channelSpectrum(reading('a', 6, 40))).toEqual([2427, 2447])
    expect(channelSpectrum(reading('a', 14))).toEqual([2474, 2494])
  })
  it('returns no data for unknown channels, empty captures or an absent selected network', () => {
    expect(countOverlappingRadios([])).toBeUndefined()
    expect(countOverlappingRadios([reading('a', 0)])).toBeUndefined()
    expect(countOverlappingRadios([reading('a', 6)], 'ssid:absent')).toBeUndefined()
  })
  it('counts only clusters affecting the selected network', () => {
    const rows = [reading('a', 1, 20, 'target'), reading('b', 6), reading('c', 6), reading('d', 6), reading('e', 2)]
    expect(countOverlappingRadios(rows)).toBe(3)
    expect(countOverlappingRadios(rows, 'ssid:target')).toBe(2)
  })
  it('applies green/yellow/red thresholds and keeps no-data cells transparent', () => {
    expect(interferenceColor(1)).toEqual([22, 163, 74])
    expect(interferenceColor(2)).toEqual([22, 163, 74])
    expect(interferenceColor(3)).toEqual([234, 179, 8])
    expect(interferenceColor(4)).toEqual([234, 179, 8])
    expect(interferenceColor(5)).toEqual([220, 38, 38])
    const rgba = interferenceGridToRgba({ cols: 2, rows: 1, cellSize: 8, cells: [{ value: 5, confidence: 1, interpolationIntensity: 0.3 }, { value: 0, confidence: 0, interpolationIntensity: 1 }] })
    expect(Array.from(rgba.slice(0, 4))).toEqual([220, 38, 38, 166])
    expect(rgba[7]).toBe(0)
  })
})
