import type { NetworkReading } from '@shared/networkReading'

/**
 * Modelo log-distance path loss: distance = 10^((RSSI@1m - RSSI) / (10·n)).
 * RSSI@1m=-40dBm e n=3 são valores típicos de referência para AP Wi-Fi comum em
 * ambiente interno (n=2 seria espaço livre; 4+ seria muito obstruído). É uma
 * estimativa grosseira — multipercurso e paredes reais variam bastante o
 * resultado — serve como ordem de grandeza, não como medição precisa (mesma
 * natureza do campo "Distance" que alguns scanners já exportam no CSV).
 */
const REFERENCE_RSSI_AT_1M = -40
const PATH_LOSS_EXPONENT = 3

export function estimateDistanceFromRssi(rssiDbm: number): number {
  return Math.pow(10, (REFERENCE_RSSI_AT_1M - rssiDbm) / (10 * PATH_LOSS_EXPONENT))
}

export interface DistanceEstimate {
  meters: number
  /** false quando a fonte (ex.: CSV) já informou a distância; true quando calculada aqui a partir do RSSI. */
  estimated: boolean
}

/** Usa a distância informada pela fonte quando existe (ver PRD, regra "Pontos de medição"); senão estima a partir do RSSI. */
export function getDistanceMeters(reading: Pick<NetworkReading, 'signalDbm' | 'distanceMeters'>): DistanceEstimate {
  if (reading.distanceMeters !== undefined) {
    return { meters: reading.distanceMeters, estimated: false }
  }
  return { meters: estimateDistanceFromRssi(reading.signalDbm), estimated: true }
}
