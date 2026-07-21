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
  /** Presente quando a parede faz parte de uma forma (retângulo/círculo/arco) criada como unidade — ver ADR-045. Ausente = parede livre, desenhada segmento a segmento. */
  groupId?: string
  /** Espessura visual do traço, em pixels do SVG (coordenadas da imagem). Ausente = 3 (padrão do editor). */
  strokeWidth?: number
}

/**
 * Forma paramétrica de parede — entidade matemática editável (centro+raio / 3 pontos), sem
 * tesselar em vértices no grafo. ADR-046: apenas `circle` e `arc` novos viram `WallShape`; o
 * retângulo continua como N paredes + `groupId` (ADR-045). Formas antigas tesseladas continuam
 * como `Wall` com `groupId` — sem migração automática.
 */
export interface Point2D {
  x: number
  y: number
}

export type WallShape =
  | {
      id: string
      floorPlanId: string
      kind: 'circle'
      center: Point2D
      /** Ponto na circunferência — define raio e ângulo do handle de resize. */
      edge: Point2D
    }
  | {
      id: string
      floorPlanId: string
      kind: 'arc'
      p1: Point2D
      p2: Point2D
      pMid: Point2D
    }

export interface StoredNetworkReading extends NetworkReading {
  id: string
  pointId: string
}
