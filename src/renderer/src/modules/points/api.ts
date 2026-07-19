import { getDb } from '../storage/db'
import type { MeasurementPoint } from '../../types/domain'
import { clampToImage } from '../../lib/clampToImage'

export async function createPoint(floorPlanId: string, x: number, y: number): Promise<MeasurementPoint> {
  const point: MeasurementPoint = {
    id: crypto.randomUUID(),
    floorPlanId,
    x,
    y,
    createdAt: new Date().toISOString()
  }
  const db = await getDb()
  await db.put('points', point)
  return point
}

export async function movePoint(id: string, x: number, y: number): Promise<void> {
  const db = await getDb()
  const point = await db.get('points', id)
  if (!point) return
  await db.put('points', { ...point, x, y })
}

/**
 * Ordenado por criação: o IndexedDB retorna pela ordem da chave primária (id, um UUID),
 * não pela ordem de inserção — sem isso, o número exibido de cada ponto ("Ponto N")
 * embaralharia a cada novo ponto criado.
 */
export async function listPoints(floorPlanId: string): Promise<MeasurementPoint[]> {
  const db = await getDb()
  const points = await db.getAllFromIndex('points', 'byFloorPlan', floorPlanId)
  return points.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Remove o ponto e todas as leituras associadas (ver PRD, UC-004). */
export async function deletePoint(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['points', 'readings'], 'readwrite')
  let cursor = await tx.objectStore('readings').index('byPoint').openCursor(id)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.objectStore('points').delete(id)
  await tx.done
}

/** Remove todos os pontos (e leituras) de uma planta — ação destrutiva, a UI deve confirmar antes de chamar. */
export async function deleteAllPointsForFloorPlan(floorPlanId: string): Promise<void> {
  const db = await getDb()
  const points = await db.getAllFromIndex('points', 'byFloorPlan', floorPlanId)
  const tx = db.transaction(['points', 'readings'], 'readwrite')
  const readingsIndex = tx.objectStore('readings').index('byPoint')
  for (const point of points) {
    let cursor = await readingsIndex.openCursor(point.id)
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    await tx.objectStore('points').delete(point.id)
  }
  await tx.done
}

/**
 * Desloca todos os pontos de uma planta pela mesma quantidade (dx, dy), cada um limitado
 * aos limites da planta — ação destrutiva, a UI deve confirmar antes de chamar.
 */
export async function moveAllPoints(
  floorPlanId: string,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number
): Promise<void> {
  const db = await getDb()
  const points = await db.getAllFromIndex('points', 'byFloorPlan', floorPlanId)
  const tx = db.transaction('points', 'readwrite')
  for (const point of points) {
    const { x, y } = clampToImage(point.x - dx, point.y - dy, imageWidth, imageHeight)
    await tx.store.put({ ...point, x, y })
  }
  await tx.done
}
