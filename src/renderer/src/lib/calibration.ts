import type { FloorPlan } from '../types/domain'

/** null quando a planta não foi calibrada — quem chama deve ter um fallback (ver colorScale.dbmToSigma). */
export function getPixelsPerMeter(floorPlan: Pick<FloorPlan, 'calibration'>): number | null {
  if (!floorPlan.calibration) return null
  const { pointA, pointB, realDistanceMeters } = floorPlan.calibration
  const pixelDistance = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y)
  return pixelDistance / realDistanceMeters
}
