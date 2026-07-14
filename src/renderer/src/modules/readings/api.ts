import { getDb } from '../storage/db'
import type { NetworkReading } from '@shared/networkReading'
import type { StoredNetworkReading } from '../../types/domain'

export async function addReadings(pointId: string, readings: NetworkReading[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('readings', 'readwrite')
  await Promise.all(
    readings.map((reading) => {
      const stored: StoredNetworkReading = { ...reading, id: crypto.randomUUID(), pointId }
      return tx.store.put(stored)
    })
  )
  await tx.done
}

export async function listReadingsForPoint(pointId: string): Promise<StoredNetworkReading[]> {
  const db = await getDb()
  return db.getAllFromIndex('readings', 'byPoint', pointId)
}

/** Mapa pointId -> leituras, para todos os pontos de uma planta (usado pelo heatmap e pelo seletor de redes). */
export async function listReadingsForFloorPlan(
  floorPlanId: string
): Promise<Map<string, StoredNetworkReading[]>> {
  const db = await getDb()
  const points = await db.getAllFromIndex('points', 'byFloorPlan', floorPlanId)
  const result = new Map<string, StoredNetworkReading[]>()
  for (const point of points) {
    result.set(point.id, await db.getAllFromIndex('readings', 'byPoint', point.id))
  }
  return result
}
