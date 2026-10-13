import type { StoredNetworkReading } from '../../types/domain'
import { ALL_NETWORKS_KEY, getNetworkGroup, getReadingBand } from '../readings/network'
import type { IdwGrid } from '../heatmap/idw'

export type HeatmapMode = 'coverage' | 'interference'
export const INTERFERENCE_COLORS = ['#16a34a', '#eab308', '#dc2626'] as const

const BONDED_BLOCKS: Record<number, number[][]> = {
  40: [[36, 40], [44, 48], [52, 56], [60, 64], [100, 104], [108, 112], [116, 120], [124, 128], [132, 136], [140, 144], [149, 153], [157, 161], [165, 169], [173, 177]],
  80: [[36, 40, 44, 48], [52, 56, 60, 64], [100, 104, 108, 112], [116, 120, 124, 128], [132, 136, 140, 144], [149, 153, 157, 161], [165, 169, 173, 177]],
  160: [[36, 40, 44, 48, 52, 56, 60, 64], [100, 104, 108, 112, 116, 120, 124, 128], [149, 153, 157, 161, 165, 169, 173, 177]]
}

interface Spectrum {
  start: number
  end: number
  target: boolean
}

/** 2.4 GHz: use the known primary 20 MHz channel; secondary direction is absent from the data contract.
 * 5 GHz: infer standard bonded blocks from the primary channel and reported width.
 * Unknown/nonstandard blocks conservatively use the primary 20 MHz channel. */
export function channelSpectrum(reading: StoredNetworkReading): [number, number] | null {
  const band = getReadingBand(reading)
  const channel = reading.primaryChannel
  if (band === 'unknown') return null
  if (band === '2.4GHz') {
    const center = channel === 14 ? 2484 : 2407 + 5 * channel
    return [center - 10, center + 10]
  }
  const block = BONDED_BLOCKS[reading.widthMhz ?? 20]?.find((channels) => channels.includes(channel))
  const first = block?.[0] ?? channel
  const last = block?.[block.length - 1] ?? channel
  return [5000 + first * 5 - 10, 5000 + last * 5 + 10]
}

/** Largest cluster sharing a common spectral interval, including the selected radio itself.
 * Duplicate readings count once per BSSID, and radios in distinct bands never collide.
 * With a network selected, only clusters containing at least one radio of that network qualify. */
export function countOverlappingRadios(readings: StoredNetworkReading[], networkKey: string | null = ALL_NETWORKS_KEY): number | undefined {
  const unique = new Map<string, StoredNetworkReading>()
  for (const reading of readings) {
    const key = reading.bssid.toLowerCase()
    const current = unique.get(key)
    if (!current || reading.signalDbm > current.signalDbm) unique.set(key, reading)
  }
  const spectra: Spectrum[] = Array.from(unique.values()).flatMap((reading) => {
    const spectrum = channelSpectrum(reading)
    if (!spectrum) return []
    return [{ start: spectrum[0], end: spectrum[1], target: !networkKey || networkKey === ALL_NETWORKS_KEY || getNetworkGroup(reading).key === networkKey }]
  })
  let maximum = 0
  // Occupancy is constant between consecutive endpoints. Touching boundaries alone do not overlap.
  const events = new Map<number, { radios: number; targets: number }>()
  for (const spectrum of spectra) {
    for (const [frequency, delta] of [[spectrum.start, 1], [spectrum.end, -1]]) {
      const event = events.get(frequency) ?? { radios: 0, targets: 0 }
      event.radios += delta
      if (spectrum.target) event.targets += delta
      events.set(frequency, event)
    }
  }
  const endpoints = Array.from(events.keys()).sort((a, b) => a - b)
  let activeRadios = 0
  let activeTargets = 0
  for (const frequency of endpoints) {
    const event = events.get(frequency)!
    activeRadios += event.radios
    activeTargets += event.targets
    if (activeTargets > 0) maximum = Math.max(maximum, activeRadios)
  }
  return maximum > 0 ? maximum : undefined
}

export function interferenceColor(count: number): readonly [number, number, number] {
  // Nearest category keeps the transition at the midpoint between integer counts.
  const rounded = Math.round(count)
  return rounded <= 2 ? [22, 163, 74] : rounded <= 4 ? [234, 179, 8] : [220, 38, 38]
}

export function interferenceGridToRgba(grid: IdwGrid): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(grid.cols * grid.rows * 4)
  grid.cells.forEach((cell, index) => {
    const color = interferenceColor(cell.value)
    rgba.set(color, index * 4)
    // Unlike coverage colors, all count categories have the same opacity.
    rgba[index * 4 + 3] = Math.round(255 * 0.65 * Math.pow(Math.min(1, cell.confidence), 4))
  })
  return rgba
}
