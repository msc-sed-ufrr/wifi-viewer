import type { FloorPlan } from '../../types/domain'

/**
 * Mescla uma planta atualizada de volta no mapa `floorPlansByProject` do App.
 *
 * Por que existe: mutações que rodam DENTRO do Workspace (calibração de escala,
 * medir parede, undo/redo) precisam subir a planta atualizada pro App, senão o
 * `activeFloorPlan` derivado desse mapa fica stale — trocar de planta e voltar
 * sobrescrevia a cópia local do Workspace com a versão antiga e "perdia" a
 * calibração (ela estava no IndexedDB, só não aparecia).
 *
 * Não bumpa `workspaceReloadNonce` de propósito: o Workspace já tem a planta
 * certa no estado local; só precisamos refrescar a referência do mapa pra a
 * próxima troca não pegar uma versão desatualizada.
 */
export function upsertFloorPlanInMap(
  prev: Map<string, FloorPlan[]>,
  updated: FloorPlan
): Map<string, FloorPlan[]> {
  const next = new Map(prev)
  const list = next.get(updated.projectId) ?? []
  // Se a planta já está na lista, substitui pela versão atualizada; caso
  // contrário, insere (protege contra projetos recém-criados sem a planta no mapa).
  const found = list.some((fp) => fp.id === updated.id)
  next.set(
    updated.projectId,
    found ? list.map((fp) => (fp.id === updated.id ? updated : fp)) : [...list, updated]
  )
  return next
}