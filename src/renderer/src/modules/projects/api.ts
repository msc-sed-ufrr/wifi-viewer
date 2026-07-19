import { getDb } from '../storage/db'
import { deleteAllPointsForFloorPlan } from '../points/api'
import type { Project, FloorPlan, FloorPlanCalibration } from '../../types/domain'

export async function createProject(name: string): Promise<Project> {
  const project: Project = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() }
  const db = await getDb()
  await db.put('projects', project)
  return project
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDb()
  return db.getAll('projects')
}

export async function updateProject(id: string, name: string): Promise<Project | undefined> {
  const db = await getDb()
  const project = await db.get('projects', id)
  if (!project) return undefined
  const updated: Project = { ...project, name }
  await db.put('projects', updated)
  return updated
}

export async function createFloorPlan(
  projectId: string,
  name: string,
  image: Blob,
  imageWidth: number,
  imageHeight: number
): Promise<FloorPlan> {
  const floorPlan: FloorPlan = {
    id: crypto.randomUUID(),
    projectId,
    name,
    image,
    imageWidth,
    imageHeight,
    createdAt: new Date().toISOString()
  }
  const db = await getDb()
  await db.put('floorPlans', floorPlan)
  return floorPlan
}

export async function listFloorPlans(projectId: string): Promise<FloorPlan[]> {
  const db = await getDb()
  return db.getAllFromIndex('floorPlans', 'byProject', projectId)
}

export async function getFloorPlan(id: string): Promise<FloorPlan | undefined> {
  const db = await getDb()
  return db.get('floorPlans', id)
}

export async function updateFloorPlan(id: string, name: string): Promise<FloorPlan | undefined> {
  const db = await getDb()
  const floorPlan = await db.get('floorPlans', id)
  if (!floorPlan) return undefined
  const updated: FloorPlan = { ...floorPlan, name }
  await db.put('floorPlans', updated)
  return updated
}

/** Remove a planta e tudo que depende dela (pontos + leituras, ver deleteAllPointsForFloorPlan) — ação destrutiva, a UI deve confirmar antes de chamar. */
export async function deleteFloorPlan(id: string): Promise<void> {
  await deleteAllPointsForFloorPlan(id)
  const db = await getDb()
  await db.delete('floorPlans', id)
}

/**
 * Troca a imagem da planta. Se as dimensões mudarem, a calibração (baseada nos pixels da
 * imagem antiga) é descartada — o chamador cuida de reposicionar os pontos existentes
 * separadamente (ver resolveImportedPosition, ADR-036/039), esta função só troca o registro.
 */
export async function replaceFloorPlanImage(
  id: string,
  image: Blob,
  imageWidth: number,
  imageHeight: number
): Promise<FloorPlan | undefined> {
  const db = await getDb()
  const floorPlan = await db.get('floorPlans', id)
  if (!floorPlan) return undefined
  const dimensionsChanged = floorPlan.imageWidth !== imageWidth || floorPlan.imageHeight !== imageHeight
  const updated: FloorPlan = {
    ...floorPlan,
    image,
    imageWidth,
    imageHeight,
    calibration: dimensionsChanged ? undefined : floorPlan.calibration
  }
  await db.put('floorPlans', updated)
  return updated
}

/** Define (ou limpa, passando undefined) a calibração de escala pixel↔metro da planta. */
export async function setFloorPlanCalibration(
  id: string,
  calibration: FloorPlanCalibration | undefined
): Promise<FloorPlan | undefined> {
  const db = await getDb()
  const floorPlan = await db.get('floorPlans', id)
  if (!floorPlan) return undefined
  const updated: FloorPlan = { ...floorPlan, calibration }
  await db.put('floorPlans', updated)
  return updated
}
