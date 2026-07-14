import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Project, FloorPlan, MeasurementPoint, StoredNetworkReading } from '../../types/domain'

interface WifiViewerDB extends DBSchema {
  projects: { key: string; value: Project }
  floorPlans: { key: string; value: FloorPlan; indexes: { byProject: string } }
  points: { key: string; value: MeasurementPoint; indexes: { byFloorPlan: string } }
  readings: { key: string; value: StoredNetworkReading; indexes: { byPoint: string } }
}

const DB_NAME = 'wifi-viewer'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<WifiViewerDB>> | null = null

export function getDb(): Promise<IDBPDatabase<WifiViewerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WifiViewerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' })

        const floorPlans = db.createObjectStore('floorPlans', { keyPath: 'id' })
        floorPlans.createIndex('byProject', 'projectId')

        const points = db.createObjectStore('points', { keyPath: 'id' })
        points.createIndex('byFloorPlan', 'floorPlanId')

        const readings = db.createObjectStore('readings', { keyPath: 'id' })
        readings.createIndex('byPoint', 'pointId')
      }
    })
  }
  return dbPromise
}
