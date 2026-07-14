import type { StoredNetworkReading } from '../../types/domain'
import { getNetworkGroup, getReadingBand } from '../readings/network'

export interface ChannelUsageEntry {
  bssid: string
  label: string
  channel: number
  widthMhz: number
  dbm: number
  band: '2.4GHz' | '5GHz'
}

/** Canais 2.4GHz padrão — eixo do gráfico dessa banda (ver ChannelChart). */
export const TWO_POINT_FOUR_GHZ_CHANNELS = Array.from({ length: 14 }, (_, i) => i + 1)

/**
 * Centros de canal 5GHz de 20MHz (non-DFS e DFS) — a numeração real tem saltos
 * grandes (36, 40, 44… depois 100, 104…), então isso serve de eixo categórico
 * pro gráfico de canais em vez de um eixo numérico linear (que deixaria a maior
 * parte do gráfico vazia — ver ChannelChart).
 */
export const FIVE_GHZ_CHANNELS = [
  36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165
]

/**
 * Um item por BSSID, não por SSID: os rádios 2.4GHz e 5GHz do mesmo AP ocupam
 * canais diferentes e precisam aparecer como formas separadas no gráfico —
 * ao contrário do agrupamento por SSID usado no heatmap (ver readings/network.ts).
 * Usa a leitura mais forte vista em qualquer ponto da planta, pra refletir a
 * presença real daquele rádio na área levantada, não uma leitura isolada.
 */
export function buildChannelUsage(readingsByPoint: Map<string, StoredNetworkReading[]>): ChannelUsageEntry[] {
  const strongestByBssid = new Map<string, StoredNetworkReading>()
  for (const readings of readingsByPoint.values()) {
    for (const reading of readings) {
      const current = strongestByBssid.get(reading.bssid)
      if (!current || reading.signalDbm > current.signalDbm) strongestByBssid.set(reading.bssid, reading)
    }
  }

  return Array.from(strongestByBssid.values())
    .flatMap((reading) => {
      const band = getReadingBand(reading)
      if (band === 'unknown') return []
      return [
        {
          bssid: reading.bssid,
          label: getNetworkGroup(reading).label,
          channel: reading.primaryChannel,
          widthMhz: reading.widthMhz ?? 20,
          dbm: reading.signalDbm,
          band
        }
      ]
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.bssid.localeCompare(b.bssid))
}

/**
 * Cor estável por índice (ângulo dourado — cores maximamente distintas mesmo
 * conforme redes são adicionadas/removidas, sem precisar saber o total de
 * antemão). Aqui cada rede é um traçado/forma isolada no gráfico de canais, não
 * uma camada translúcida somada a outras — por isso cores bem distintas ajudam
 * em vez de "sujar" a visão (ver discussão sobre o heatmap "todas as redes").
 */
export function channelColor(index: number): [number, number, number] {
  const hue = (index * 137.508) % 360
  return hslToRgb(hue, 65, 45)
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sNorm = s / 100
  const lNorm = l / 100
  const k = (n: number): number => (n + h / 30) % 12
  const a = sNorm * Math.min(lNorm, 1 - lNorm)
  const f = (n: number): number => lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))]
}

/**
 * Eixo categórico do gráfico de uma banda: canais padrão da banda unidos aos
 * canais realmente observados (caso algum outlier apareça fora da lista padrão),
 * ordenados. Cada passo consecutivo equivale a um canal de 20MHz (ver constantes
 * acima), então `largura em MHz / 20` dá o "espalhamento" de uma rede nessa
 * mesma unidade de eixo — usado pelo ChannelChart pra desenhar o trapézio.
 */
export function buildChannelAxis(band: '2.4GHz' | '5GHz', entries: ChannelUsageEntry[]): number[] {
  const canonical = band === '2.4GHz' ? TWO_POINT_FOUR_GHZ_CHANNELS : FIVE_GHZ_CHANNELS
  const observed = entries.filter((entry) => entry.band === band).map((entry) => entry.channel)
  return Array.from(new Set([...canonical, ...observed])).sort((a, b) => a - b)
}
