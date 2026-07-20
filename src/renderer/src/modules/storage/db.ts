import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Project, FloorPlan, MeasurementPoint, StoredNetworkReading, WallVertex, Wall } from '../../types/domain'

interface WifiViewerDB extends DBSchema {
  projects: { key: string; value: Project }
  floorPlans: { key: string; value: FloorPlan; indexes: { byProject: string } }
  points: { key: string; value: MeasurementPoint; indexes: { byFloorPlan: string } }
  readings: { key: string; value: StoredNetworkReading; indexes: { byPoint: string } }
  wallVertices: { key: string; value: WallVertex; indexes: { byFloorPlan: string } }
  walls: { key: string; value: Wall; indexes: { byFloorPlan: string } }
}

const DB_NAME = 'wifi-viewer'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<WifiViewerDB>> | null = null

export function getDb(): Promise<IDBPDatabase<WifiViewerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WifiViewerDB>(DB_NAME, DB_VERSION, {
      // Guardado por oldVersion: quem já tem um banco em v1 (projetos/pontos/leituras reais)
      // não pode ter essas 4 stores recriadas — o IndexedDB lança erro em createObjectStore
      // para uma store que já existe, o que destruiria o upgrade inteiro no meio do caminho.
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('projects', { keyPath: 'id' })

          const floorPlans = db.createObjectStore('floorPlans', { keyPath: 'id' })
          floorPlans.createIndex('byProject', 'projectId')

          const points = db.createObjectStore('points', { keyPath: 'id' })
          points.createIndex('byFloorPlan', 'floorPlanId')

          const readings = db.createObjectStore('readings', { keyPath: 'id' })
          readings.createIndex('byPoint', 'pointId')
        }

        if (oldVersion < 2) {
          const wallVertices = db.createObjectStore('wallVertices', { keyPath: 'id' })
          wallVertices.createIndex('byFloorPlan', 'floorPlanId')

          const walls = db.createObjectStore('walls', { keyPath: 'id' })
          walls.createIndex('byFloorPlan', 'floorPlanId')
        }
      }
    })
  }
  return dbPromise
}
