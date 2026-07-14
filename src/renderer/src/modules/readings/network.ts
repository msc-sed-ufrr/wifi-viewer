import type { StoredNetworkReading } from '../../types/domain'

/** Valor de seleção especial pro dropdown de rede — nenhum `NetworkGroup.key` real colide com isso. */
export const ALL_NETWORKS_KEY = '__all__'

export interface NetworkGroup {
  /** chave estável para seleção; "ssid:<nome>" ou "bssid:<mac>" para redes ocultas */
  key: string
  label: string
  ssid: string | null
  /** presente apenas quando o grupo representa uma única rede oculta */
  bssid?: string
}

/**
 * BSSIDs são agrupados por SSID (ex.: um AP dual-band aparece como uma única rede);
 * redes "hidden"/sem SSID não podem ser agrupadas por nome, então cada BSSID vira seu próprio grupo
 * (ver PRD, regra de negócio "Identidade de rede").
 */
export function getNetworkGroup(reading: Pick<StoredNetworkReading, 'ssid' | 'bssid'>): NetworkGroup {
  const isHidden = !reading.ssid || reading.ssid.toLowerCase() === 'hidden'
  if (isHidden) {
    return {
      key: `bssid:${reading.bssid}`,
      label: `Rede oculta (${reading.bssid})`,
      ssid: null,
      bssid: reading.bssid
    }
  }
  return { key: `ssid:${reading.ssid}`, label: reading.ssid as string, ssid: reading.ssid }
}

export function listNetworkGroups(readingsByPoint: Map<string, StoredNetworkReading[]>): NetworkGroup[] {
  const groups = new Map<string, NetworkGroup>()
  for (const readings of readingsByPoint.values()) {
    for (const reading of readings) {
      const group = getNetworkGroup(reading)
      if (!groups.has(group.key)) groups.set(group.key, group)
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Leitura representativa de um ponto para um grupo de rede. Quando o ponto enxerga mais de um
 * BSSID do mesmo grupo (ex.: rádios 2.4GHz e 5GHz do mesmo AP), usa o mais forte: para quem
 * está naquele ponto, a rede "está disponível" com a melhor força captada, não a média.
 */
export function getStrongestReadingForGroup(
  readings: StoredNetworkReading[],
  group: NetworkGroup
): StoredNetworkReading | undefined {
  const matches = readings.filter((reading) => getNetworkGroup(reading).key === group.key)
  if (matches.length === 0) return undefined
  return matches.reduce((strongest, reading) => (reading.signalDbm > strongest.signalDbm ? reading : strongest))
}

export function getSignalForGroup(readings: StoredNetworkReading[], group: NetworkGroup): number | undefined {
  return getStrongestReadingForGroup(readings, group)?.signalDbm
}

/**
 * Leitura mais forte de um ponto entre todas as redes (ignora agrupamento por SSID) —
 * usada no modo "todas as redes" pra mostrar a melhor experiência de Wi-Fi disponível
 * naquele ponto, e não uma rede específica.
 */
export function getStrongestReading(readings: StoredNetworkReading[]): StoredNetworkReading | undefined {
  if (readings.length === 0) return undefined
  return readings.reduce((strongest, reading) => (reading.signalDbm > strongest.signalDbm ? reading : strongest))
}

export type Band = 'all' | '2.4GHz' | '5GHz'

/**
 * Deriva a banda pelo número do canal (funciona com qualquer fonte — CSV, netsh, nmcli,
 * macwifi-cli — mesmo quando a frequência exata não vem preenchida na leitura).
 */
export function getReadingBand(reading: Pick<StoredNetworkReading, 'primaryChannel'>): '2.4GHz' | '5GHz' | 'unknown' {
  if (reading.primaryChannel >= 1 && reading.primaryChannel <= 14) return '2.4GHz'
  if (reading.primaryChannel >= 36 && reading.primaryChannel <= 177) return '5GHz'
  return 'unknown'
}

export function filterReadingsByBand(readings: StoredNetworkReading[], band: Band): StoredNetworkReading[] {
  if (band === 'all') return readings
  return readings.filter((reading) => getReadingBand(reading) === band)
}

/** Aplica o filtro de banda a todos os pontos de uma planta de uma vez. */
export function filterReadingsByPointByBand(
  readingsByPoint: Map<string, StoredNetworkReading[]>,
  band: Band
): Map<string, StoredNetworkReading[]> {
  if (band === 'all') return readingsByPoint
  const filtered = new Map<string, StoredNetworkReading[]>()
  for (const [pointId, readings] of readingsByPoint) {
    filtered.set(pointId, filterReadingsByBand(readings, band))
  }
  return filtered
}
