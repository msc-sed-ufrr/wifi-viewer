import type { NetworkReading } from '@shared/networkReading'

export interface Project {
  id: string
  name: string
  createdAt: string
}

export interface FloorPlanCalibration {
  pointA: { x: number; y: number }
  pointB: { x: number; y: number }
  realDistanceMeters: number
}

export interface FloorPlan {
  id: string
  projectId: string
  name: string
  image: Blob
  imageWidth: number
  imageHeight: number
  /** Escala pixel↔metro; ausente = heatmap em coordenadas relativas de pixel (ver PRD, regra "Planta do prédio"). */
  calibration?: FloorPlanCalibration
  createdAt: string
}

export interface MeasurementPoint {
  id: string
  floorPlanId: string
  x: number
  y: number
  createdAt: string
}

/** Vértice de parede — pode ser referenciado por mais de uma `Wall` (canto compartilhado via snap). */
export interface WallVertex {
  id: string
  floorPlanId: string
  x: number
  y: number
}

/** Segmento de parede: uma reta entre dois vértices, referenciados por id (não por coordenada). */
export interface Wall {
  id: string
  floorPlanId: string
  startVertexId: string
  endVertexId: string
}

export interface StoredNetworkReading extends NetworkReading {
  id: string
  pointId: string
}
