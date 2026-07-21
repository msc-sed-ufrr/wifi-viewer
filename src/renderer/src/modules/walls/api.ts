import { getDb } from '../storage/db'
import type { Wall, WallVertex, WallShape } from '../../types/domain'
import { clampToImage } from '../../lib/clampToImage'

export async function createWallVertex(floorPlanId: string, x: number, y: number): Promise<WallVertex> {
  const vertex: WallVertex = { id: crypto.randomUUID(), floorPlanId, x, y }
  const db = await getDb()
  await db.put('wallVertices', vertex)
  return vertex
}

export async function moveWallVertex(id: string, x: number, y: number, imageWidth: number, imageHeight: number): Promise<void> {
  const db = await getDb()
  const vertex = await db.get('wallVertices', id)
  if (!vertex) return
  const clamped = clampToImage(x, y, imageWidth, imageHeight)
  await db.put('wallVertices', { ...vertex, ...clamped })
}

/**
 * `strokeWidth` opcional: quando todas as arestas da planta compartilham a mesma espessura,
 * o Workspace repassa esse valor pras novas linhas (herança do “estilo atual”).
 */
export async function createWall(
  floorPlanId: string,
  startVertexId: string,
  endVertexId: string,
  strokeWidth?: number
): Promise<Wall> {
  const wall: Wall = {
    id: crypto.randomUUID(),
    floorPlanId,
    startVertexId,
    endVertexId,
    ...(strokeWidth !== undefined ? { strokeWidth } : {})
  }
  const db = await getDb()
  await db.put('walls', wall)
  return wall
}

/** Uma ponta de segmento de forma: `vertexId` presente = clique resolveu em cima de um vértice existente (snap); ausente = ponto novo. */
export interface ShapeSegmentInput {
  start: { vertexId?: string; x: number; y: number }
  end: { vertexId?: string; x: number; y: number }
}

/**
 * Cria uma forma (retângulo/círculo/arco — ADR-045) como N paredes compartilhando um `groupId`,
 * numa única transação. Resolução de cada ponta, em ordem:
 *  1. reusa o `vertexId` quando veio de snap em cima de vértice existente;
 *  2. reusa um vértice já criado NESTE batch na mesma coordenada exata — o módulo de geometria
 *     (shapes.ts) garante juntas com referência compartilhada, então cantos de retângulo e o
 *     fechamento do círculo viram UM vértice só (grafo com cantos por id, filosofia do ADR-041);
 *  3. cria um vértice novo.
 */
export async function createWallsWithGroup(
  floorPlanId: string,
  segments: ShapeSegmentInput[],
  groupId: string = crypto.randomUUID(),
  /** Espessura herdada quando todas as arestas existentes compartilham o mesmo valor. */
  strokeWidth?: number
): Promise<{ groupId: string; wallIds: string[] }> {
  const db = await getDb()
  const tx = db.transaction(['wallVertices', 'walls'], 'readwrite')
  const vertexStore = tx.objectStore('wallVertices')
  const wallStore = tx.objectStore('walls')
  /** Chave de coordenada exata → id do vértice criado neste batch (dedupe intra-forma). */
  const batchVertexIds = new Map<string, string>()

  async function resolveVertex(point: ShapeSegmentInput['start']): Promise<string> {
    if (point.vertexId) return point.vertexId
    const key = `${point.x},${point.y}`
    const existing = batchVertexIds.get(key)
    if (existing) return existing
    const vertex: WallVertex = { id: crypto.randomUUID(), floorPlanId, x: point.x, y: point.y }
    await vertexStore.put(vertex)
    batchVertexIds.set(key, vertex.id)
    return vertex.id
  }

  const wallIds: string[] = []
  for (const segment of segments) {
    const startVertexId = await resolveVertex(segment.start)
    const endVertexId = await resolveVertex(segment.end)
    const wall: Wall = {
      id: crypto.randomUUID(),
      floorPlanId,
      startVertexId,
      endVertexId,
      groupId,
      ...(strokeWidth !== undefined ? { strokeWidth } : {})
    }
    await wallStore.put(wall)
    wallIds.push(wall.id)
  }
  await tx.done
  return { groupId, wallIds }
}

/** Translada rigidamente todas as paredes de um grupo: cada vértice único referenciado por elas se move pelo mesmo delta (com clamp na imagem, mesmo padrão de `moveWall`). */
export async function moveWallGroup(
  floorPlanId: string,
  groupId: string,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number
): Promise<void> {
  const db = await getDb()
  const walls = await db.getAllFromIndex('walls', 'byFloorPlan', floorPlanId)
  const vertexIds = new Set<string>()
  for (const wall of walls) {
    if (wall.groupId !== groupId) continue
    vertexIds.add(wall.startVertexId)
    vertexIds.add(wall.endVertexId)
  }
  const tx = db.transaction('wallVertices', 'readwrite')
  for (const vertexId of vertexIds) {
    const vertex = await tx.store.get(vertexId)
    if (!vertex) continue
    const clamped = clampToImage(vertex.x + dx, vertex.y + dy, imageWidth, imageHeight)
    await tx.store.put({ ...vertex, ...clamped })
  }
  await tx.done
}

/**
 * Remove todas as paredes de um grupo E os vértices que ficarem órfãos (referenciados só por
 * paredes do grupo) — sem isso, excluir um círculo deixaria dezenas de pontos flutuando na tela.
 * Vértice compartilhado com parede de fora do grupo sobrevive (ex.: canto de retângulo snapado
 * num vértice de desenho livre). Não precisa de confirmação na UI: nunca apaga parede de fora do
 * grupo, diferente da cascata de `deleteWallVertex`.
 */
export async function deleteWallGroup(floorPlanId: string, groupId: string): Promise<void> {
  const db = await getDb()
  const walls = await db.getAllFromIndex('walls', 'byFloorPlan', floorPlanId)
  const groupWalls = walls.filter((wall) => wall.groupId === groupId)
  if (groupWalls.length === 0) return
  const remainingWalls = walls.filter((wall) => wall.groupId !== groupId)
  const referencedElsewhere = new Set<string>()
  for (const wall of remainingWalls) {
    referencedElsewhere.add(wall.startVertexId)
    referencedElsewhere.add(wall.endVertexId)
  }
  const orphanCandidateIds = new Set<string>()
  for (const wall of groupWalls) {
    orphanCandidateIds.add(wall.startVertexId)
    orphanCandidateIds.add(wall.endVertexId)
  }
  const tx = db.transaction(['walls', 'wallVertices'], 'readwrite')
  for (const wall of groupWalls) {
    await tx.objectStore('walls').delete(wall.id)
  }
  for (const vertexId of orphanCandidateIds) {
    if (!referencedElsewhere.has(vertexId)) {
      await tx.objectStore('wallVertices').delete(vertexId)
    }
  }
  await tx.done
}

/** Desloca os dois vértices de uma parede pelo mesmo delta — move o segmento inteiro sem alterar seu comprimento/ângulo. */
export async function moveWall(id: string, dx: number, dy: number, imageWidth: number, imageHeight: number): Promise<void> {
  const db = await getDb()
  const wall = await db.get('walls', id)
  if (!wall) return
  const tx = db.transaction('wallVertices', 'readwrite')
  for (const vertexId of [wall.startVertexId, wall.endVertexId]) {
    const vertex = await tx.store.get(vertexId)
    if (!vertex) continue
    const clamped = clampToImage(vertex.x + dx, vertex.y + dy, imageWidth, imageHeight)
    await tx.store.put({ ...vertex, ...clamped })
  }
  await tx.done
}

export async function listWallVertices(floorPlanId: string): Promise<WallVertex[]> {
  const db = await getDb()
  return db.getAllFromIndex('wallVertices', 'byFloorPlan', floorPlanId)
}

export async function listWalls(floorPlanId: string): Promise<Wall[]> {
  const db = await getDb()
  return db.getAllFromIndex('walls', 'byFloorPlan', floorPlanId)
}

/** Substitui a parede inteira — usado para atualizar propriedades (ex.: espessura) sem tocar nos vértices. */
export async function updateWall(wall: Wall): Promise<void> {
  const db = await getDb()
  await db.put('walls', wall)
}

/** Remove só a parede — os vértices ficam, podem estar em uso por outra parede (canto compartilhado via snap). */
export async function deleteWall(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('walls', id)
}

/**
 * Remove o vértice e, em cascata, toda parede que o referencia (uma parede sem um dos dois
 * vértices não tem como ser desenhada) — ação destrutiva, a UI deve confirmar antes de chamar.
 */
export async function deleteWallVertex(id: string): Promise<void> {
  const db = await getDb()
  const floorPlanId = (await db.get('wallVertices', id))?.floorPlanId
  if (!floorPlanId) return
  const walls = await db.getAllFromIndex('walls', 'byFloorPlan', floorPlanId)
  const attached = walls.filter((wall) => wall.startVertexId === id || wall.endVertexId === id)
  const tx = db.transaction(['walls', 'wallVertices'], 'readwrite')
  for (const wall of attached) {
    await tx.objectStore('walls').delete(wall.id)
  }
  await tx.objectStore('wallVertices').delete(id)
  await tx.done
}

/** Quantas paredes seriam removidas em cascata ao excluir este vértice — usado pela confirmação na UI. */
export async function countWallsForVertex(floorPlanId: string, vertexId: string): Promise<number> {
  const db = await getDb()
  const walls = await db.getAllFromIndex('walls', 'byFloorPlan', floorPlanId)
  return walls.filter((wall) => wall.startVertexId === vertexId || wall.endVertexId === vertexId).length
}

/**
 * Substitui todo o conteúdo de vértices/paredes de uma planta por um snapshot — usado pelo
 * undo/redo do editor (ADR-044). Restaurar o estado inteiro de uma vez é mais simples e correto
 * do que inverter manualmente cada tipo de ação (evita reimplementar a cascata de exclusão de
 * vértice compartilhado ao desfazer, por exemplo).
 *
 * ADR-046: o snapshot agora inclui também as formas paramétricas (`wallShapes`) — wipe+rewrite
 * das três stores numa transação só, pra que undo/redo de circle/arc seja coerente com o resto.
 */
export async function replaceWallsForFloorPlan(
  floorPlanId: string,
  vertices: WallVertex[],
  walls: Wall[],
  shapes: WallShape[] = []
): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['wallVertices', 'walls', 'wallShapes'], 'readwrite')
  const vertexStore = tx.objectStore('wallVertices')
  const wallStore = tx.objectStore('walls')
  const shapeStore = tx.objectStore('wallShapes')
  const existingVertexIds = await vertexStore.index('byFloorPlan').getAllKeys(floorPlanId)
  const existingWallIds = await wallStore.index('byFloorPlan').getAllKeys(floorPlanId)
  const existingShapeIds = await shapeStore.index('byFloorPlan').getAllKeys(floorPlanId)
  await Promise.all([
    ...existingVertexIds.map((id) => vertexStore.delete(id)),
    ...existingWallIds.map((id) => wallStore.delete(id)),
    ...existingShapeIds.map((id) => shapeStore.delete(id)),
    ...vertices.map((vertex) => vertexStore.put(vertex)),
    ...walls.map((wall) => wallStore.put(wall)),
    ...shapes.map((shape) => shapeStore.put(shape))
  ])
  await tx.done
}

// ─── Formas paramétricas (ADR-046) ─────────────────────────────────────────────

/** Input de criação: omite `id` e `floorPlanId` (preenchidos aqui). */
export type WallShapeInput =
  | Omit<Extract<WallShape, { kind: 'circle' }>, 'id' | 'floorPlanId'>
  | Omit<Extract<WallShape, { kind: 'arc' }>, 'id' | 'floorPlanId'>

/** Cria uma forma paramétrica (circle/arc) — NÃO tesselar: a UI renderiza path SVG nativo. */
export async function createWallShape(floorPlanId: string, input: WallShapeInput): Promise<WallShape> {
  const db = await getDb()
  const shape: WallShape = { id: crypto.randomUUID(), floorPlanId, ...input } as WallShape
  await db.put('wallShapes', shape)
  return shape
}

export async function listWallShapes(floorPlanId: string): Promise<WallShape[]> {
  const db = await getDb()
  return db.getAllFromIndex('wallShapes', 'byFloorPlan', floorPlanId)
}

/** Replace inteiro da forma — undo por snapshot, então a edição nunca é incremental. */
export async function updateWallShape(shape: WallShape): Promise<void> {
  const db = await getDb()
  await db.put('wallShapes', shape)
}

export async function deleteWallShape(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('wallShapes', id)
}
