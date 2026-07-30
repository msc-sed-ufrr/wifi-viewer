import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../types/domain'
import { upsertFloorPlanInMap } from './floorPlanMap'

/**
 * Regressão do bug "calibrar escala, trocar de planta, voltar — escala some".
 * A calibração era persistida no IndexedDB e atualizada no estado local do
 * Workspace, mas o mapa `floorPlansByProject` do App ficava com a referência
 * antiga. Ao trocar de planta e voltar, o App repassava a planta stale pro
 * Workspace, sobrescrevendo a cópia calibrada. Este teste garante que o
 * helper que sincroniza a planta atualizada de volta ao mapa preserva a
 * calibração e mantém as outras plantas intactas.
 */
describe('upsertFloorPlanInMap', () => {
  const baseFloorPlan = (overrides: Partial<FloorPlan> = {}): FloorPlan => ({
    id: 'fp-1',
    projectId: 'proj-1',
    name: 'Planta 1',
    image: new Blob(),
    imageWidth: 100,
    imageHeight: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  })

  it('substitui a planta stale pela atualizada, preservando a calibração', () => {
    const stale = baseFloorPlan()
    const other = baseFloorPlan({ id: 'fp-2', name: 'Planta 2' })
    const prev = new Map([['proj-1', [stale, other]]])

    const calibration = { pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 }, realDistanceMeters: 10 }
    const updated = baseFloorPlan({ calibration })

    const next = upsertFloorPlanInMap(prev, updated)
    const result = next.get('proj-1')!.find((fp) => fp.id === 'fp-1')!

    expect(result.calibration).toEqual(calibration)
  })

  it('não muta o mapa anterior', () => {
    const stale = baseFloorPlan()
    const prev = new Map([['proj-1', [stale]]])
    const updated = baseFloorPlan({ calibration: undefined })

    upsertFloorPlanInMap(prev, updated)

    expect(prev.get('proj-1')!.find((fp) => fp.id === 'fp-1')!.calibration).toBeUndefined()
  })

  it('mantém as outras plantas do projeto intactas', () => {
    const a = baseFloorPlan({ id: 'fp-a', name: 'A' })
    const b = baseFloorPlan({ id: 'fp-b', name: 'B' })
    const c = baseFloorPlan({ id: 'fp-c', name: 'C' })
    const prev = new Map([['proj-1', [a, b, c]]])

    const updatedB = baseFloorPlan({ id: 'fp-b', name: 'B', calibration: undefined })
    const next = upsertFloorPlanInMap(prev, updatedB)
    const list = next.get('proj-1')!

    expect(list.map((fp) => fp.id)).toEqual(['fp-a', 'fp-b', 'fp-c'])
    expect(list.find((fp) => fp.id === 'fp-a')).toBe(a)
    expect(list.find((fp) => fp.id === 'fp-c')).toBe(c)
  })

  it('cria a entrada do projeto se ainda não existir', () => {
    const prev = new Map<string, FloorPlan[]>()
    const updated = baseFloorPlan({ id: 'fp-new' })

    const next = upsertFloorPlanInMap(prev, updated)

    expect(next.get('proj-1')).toEqual([updated])
  })

  it('espelha o bug original: sem sync, o mapa retém a versão sem calibração', () => {
    // Este teste documenta o comportamento quebrado: se NÃO chamarmos o helper,
    // o mapa continua apontando pra planta stale. Rodar o helper deve mudar isso.
    const stale = baseFloorPlan() // sem calibração
    const prev = new Map([['proj-1', [stale]]])

    expect(prev.get('proj-1')!.find((fp) => fp.id === 'fp-1')!.calibration).toBeUndefined()

    const calibration = { pointA: { x: 0, y: 0 }, pointB: { x: 50, y: 0 }, realDistanceMeters: 5 }
    const updated = baseFloorPlan({ calibration })
    const next = upsertFloorPlanInMap(prev, updated)

    expect(next.get('proj-1')!.find((fp) => fp.id === 'fp-1')!.calibration).toEqual(calibration)
    expect(prev.get('proj-1')!.find((fp) => fp.id === 'fp-1')!.calibration).toBeUndefined()
  })
})