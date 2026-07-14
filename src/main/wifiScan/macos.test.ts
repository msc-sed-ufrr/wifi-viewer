import { describe, expect, it } from 'vitest'
import { parseMacwifiCliOutput } from './macos'

describe('parseMacwifiCliOutput', () => {
  it('normalizes a live reading and lowercases the BSSID', () => {
    const stdout = JSON.stringify([
      {
        ssid: 'ap01',
        bssid: '98:E5:5B:17:C0:E3',
        rssi: -69,
        noise: -97,
        channel: 36,
        channel_band: '5GHz',
        channel_width: 40,
        security: 'WPA3',
        phy_mode: '',
        current: true,
        saved: true
      }
    ])

    expect(parseMacwifiCliOutput(stdout, '2026-07-05T12:00:00Z')).toEqual([
      {
        ssid: 'ap01',
        bssid: '98:e5:5b:17:c0:e3',
        signalDbm: -69,
        signalSource: 'measured',
        primaryChannel: 36,
        widthMhz: 40,
        noise: -97,
        security: 'WPA3',
        standard: undefined,
        capturedAt: '2026-07-05T12:00:00Z'
      }
    ])
  })

  it('discards remembered-but-out-of-range networks (empty bssid, no real reading)', () => {
    const stdout = JSON.stringify([
      {
        ssid: 'UFRR-Servidores',
        bssid: '',
        rssi: 0,
        noise: 0,
        channel: 0,
        channel_band: 'unknown',
        channel_width: 0,
        security: 'unknown',
        phy_mode: '',
        current: false,
        saved: true
      }
    ])

    expect(parseMacwifiCliOutput(stdout, '2026-07-05T12:00:00Z')).toEqual([])
  })

  it('handles an empty scan result', () => {
    expect(parseMacwifiCliOutput('[]', '2026-07-05T12:00:00Z')).toEqual([])
  })
})
