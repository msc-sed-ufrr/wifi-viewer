import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  CalibrateIcon,
  CircleIcon,
  DeleteIcon,
  DiagonalLineIcon,
  LayersIcon,
  LineCurveIcon,
  LineWeightIcon,
  PanToolIcon,
  RedoIcon,
  SquareIcon,
  UndoIcon
} from './icons'
import type { WallTool } from './WallLayer'

const IS_MAC = navigator.platform.toUpperCase().includes('MAC')
const UNDO_SHORTCUT_LABEL = IS_MAC ? '⌘Z' : 'Ctrl+Z'
const REDO_SHORTCUT_LABEL = IS_MAC ? '⌘⇧Z' : 'Ctrl+Shift+Z'

interface Props {
  showHeatmap: boolean
  onToggleShowHeatmap: (value: boolean) => void
  showMeasurements: boolean
  onToggleShowMeasurements: (value: boolean) => void
  showImage: boolean
  onToggleShowImage: (value: boolean) => void
  showWalls: boolean
  onToggleShowWalls: (value: boolean) => void
  calibrating: boolean
  onToggleCalibrate: () => void
  wallEditing: boolean
  wallTool: WallTool
  onSelectWallTool: (tool: WallTool) => void
  hasSelection: boolean
  onDeleteSelection: () => void
  /** Total de arestas na planta — o controle global de espessura só aparece quando há ao menos uma. */
  totalWallCount: number
  allWallsStrokeWidth: number | null
  onChangeAllWallsStrokeWidth: (value: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

/**
 * Toolbar vertical à direita do workspace, no padrão da barra lateral de um app de imagem/vetor
 * (ícones empilhados, label só em tooltip) — camadas, calibração e ferramentas do editor vetorial
 * de paredes (ADR-041/045). "Camadas" abre um dropdown com os toggles de visibilidade (heatmap,
 * medições, imagem, objetos).
 *
 * Ferramentas se comportam como um app vetorial (Illustrator/Corel — ADR-043): clicar numa
 * ferramenta já ativa o modo de edição com ela, sem um toggle "Editar paredes" separado antes.
 * Clicar na ferramenta já ativa desliga o modo de edição.
 *
 * Espessura de aresta selected/grupo é editada pelo dialog Size/Thickness da ferramenta régua;
 * o painel só expõe o controle global (ícone Line Weight).
 */
export function WallEditorPanel({
  showHeatmap,
  onToggleShowHeatmap,
  showMeasurements,
  onToggleShowMeasurements,
  showImage,
  onToggleShowImage,
  showWalls,
  onToggleShowWalls,
  calibrating,
  onToggleCalibrate,
  wallEditing,
  wallTool,
  onSelectWallTool,
  hasSelection,
  onDeleteSelection,
  totalWallCount,
  allWallsStrokeWidth,
  onChangeAllWallsStrokeWidth,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}: Props): JSX.Element {
  const [layersOpen, setLayersOpen] = useState(false)
  const layersButtonRef = useRef<HTMLButtonElement>(null)
  const [layersMenuStyle, setLayersMenuStyle] = useState<{ top: number; right: number } | null>(null)

  /**
   * O dropdown usa position:fixed ancorado no botão — .workspace__body tem overflow:hidden e
   * cortaria qualquer absolute que tente escapar do painel para a esquerda sobre o canvas.
   */
  useLayoutEffect(() => {
    if (!layersOpen) {
      setLayersMenuStyle(null)
      return
    }
    function updatePosition(): void {
      const button = layersButtonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      setLayersMenuStyle({
        top: rect.top,
        right: window.innerWidth - rect.left + 8
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    // scroll em ancestors (futuros) também reancora o menu
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [layersOpen])

  /** Fecha o dropdown de camadas ao clicar fora dele ou apertar Escape — mesmo padrão do menu "⋮" da Sidebar. */
  useEffect(() => {
    if (!layersOpen) return
    function handleClickOutside(event: globalThis.MouseEvent): void {
      if (event.target instanceof Element && !event.target.closest('.wall-editor-panel__layers')) {
        setLayersOpen(false)
      }
    }
    function handleEscape(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') setLayersOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [layersOpen])

  function toolClass(tool: WallTool): string {
    return wallEditing && wallTool === tool
      ? 'wall-editor-panel__tool wall-editor-panel__tool--active'
      : 'wall-editor-panel__tool'
  }

  return (
    <div className="wall-editor-panel">
      {/* Toolbar vertical só com ícones (barra lateral de app de imagem/vetor):
          label some do botão e fica no tooltip nativo (`title`), ícone grande e legível. */}
      <div className="wall-editor-panel__toolbar" role="toolbar" aria-label="Camadas e ferramentas de paredes">
        <div className="wall-editor-panel__layers">
          <button
            ref={layersButtonRef}
            type="button"
            className={layersOpen ? 'wall-editor-panel__tool wall-editor-panel__tool--active' : 'wall-editor-panel__tool'}
            onClick={() => setLayersOpen((open) => !open)}
            title="Camadas — visibilidade de heatmap, medições, imagem e objetos"
            aria-label="Camadas"
            aria-expanded={layersOpen}
            aria-haspopup="true"
          >
            <LayersIcon width={22} height={22} />
          </button>
          {layersOpen && layersMenuStyle && (
            <div
              className="wall-editor-panel__layers-dropdown"
              role="menu"
              aria-label="Visibilidade das camadas"
              style={layersMenuStyle}
            >
              <label className="wall-editor-panel__checkbox">
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={(event) => onToggleShowHeatmap(event.target.checked)}
                />
                Heatmap
              </label>
              <label className="wall-editor-panel__checkbox">
                <input
                  type="checkbox"
                  checked={showMeasurements}
                  onChange={(event) => onToggleShowMeasurements(event.target.checked)}
                />
                Medições
              </label>
              <label className="wall-editor-panel__checkbox">
                <input type="checkbox" checked={showImage} onChange={(event) => onToggleShowImage(event.target.checked)} />
                Imagem
              </label>
              <label className="wall-editor-panel__checkbox">
                <input type="checkbox" checked={showWalls} onChange={(event) => onToggleShowWalls(event.target.checked)} />
                Objetos
              </label>
            </div>
          )}
        </div>

        <div className="wall-editor-panel__toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className={toolClass('select')}
          onClick={() => onSelectWallTool('select')}
          title="Mover objetos — selecionar e arrastar vértices, paredes ou formas"
          aria-label="Mover objetos"
          aria-pressed={wallEditing && wallTool === 'select'}
        >
          <PanToolIcon width={22} height={22} />
        </button>
        <button
          type="button"
          className={toolClass('draw')}
          onClick={() => onSelectWallTool('draw')}
          title="Desenhar linhas — clique a clique, encadeia segmentos"
          aria-label="Desenhar linhas"
          aria-pressed={wallEditing && wallTool === 'draw'}
        >
          <DiagonalLineIcon width={22} height={22} />
        </button>
        <button
          type="button"
          className={toolClass('rect')}
          onClick={() => onSelectWallTool('rect')}
          title="Retângulo — arrastar canto a canto; Shift = quadrado"
          aria-label="Retângulo"
          aria-pressed={wallEditing && wallTool === 'rect'}
        >
          <SquareIcon width={22} height={22} />
        </button>
        <button
          type="button"
          className={toolClass('circle')}
          onClick={() => onSelectWallTool('circle')}
          title="Círculo — arrastar do centro até a borda"
          aria-label="Círculo"
          aria-pressed={wallEditing && wallTool === 'circle'}
        >
          <CircleIcon width={22} height={22} />
        </button>
        <button
          type="button"
          className={toolClass('arc')}
          onClick={() => onSelectWallTool('arc')}
          title="Arco — 3 cliques: início, fim e curvatura"
          aria-label="Arco"
          aria-pressed={wallEditing && wallTool === 'arc'}
        >
          <LineCurveIcon width={22} height={22} />
        </button>

        <div className="wall-editor-panel__toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className={calibrating ? 'wall-editor-panel__tool wall-editor-panel__tool--active' : 'wall-editor-panel__tool'}
          onClick={onToggleCalibrate}
          title={
            calibrating
              ? 'Cancelar régua — clique em aresta mede Size/Thickness; clique na planta calibra escala'
              : 'Régua — clique em aresta: Size/Thickness; clique na planta: calibrar escala'
          }
          aria-label={calibrating ? 'Cancelar régua' : 'Régua / calibrar escala'}
          aria-pressed={calibrating}
        >
          <CalibrateIcon width={22} height={22} />
        </button>

        {totalWallCount > 0 && <GlobalStrokeControl value={allWallsStrokeWidth} onChange={onChangeAllWallsStrokeWidth} />}

        {wallEditing && (
          <>
            <div className="wall-editor-panel__toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              className="wall-editor-panel__tool wall-editor-panel__tool--danger"
              onClick={onDeleteSelection}
              disabled={!hasSelection}
              title="Excluir seleção"
              aria-label="Excluir seleção"
            >
              <DeleteIcon width={22} height={22} />
            </button>
          </>
        )}

        <div className="wall-editor-panel__toolbar-divider" aria-hidden="true" />

        <button
          type="button"
          className="wall-editor-panel__tool"
          onClick={onUndo}
          disabled={!canUndo}
          title={`Desfazer (${UNDO_SHORTCUT_LABEL})`}
          aria-label={`Desfazer (${UNDO_SHORTCUT_LABEL})`}
        >
          <UndoIcon width={22} height={22} />
        </button>
        <button
          type="button"
          className="wall-editor-panel__tool"
          onClick={onRedo}
          disabled={!canRedo}
          title={`Refazer (${REDO_SHORTCUT_LABEL})`}
          aria-label={`Refazer (${REDO_SHORTCUT_LABEL})`}
        >
          <RedoIcon width={22} height={22} />
        </button>
      </div>
    </div>
  )
}

const STROKE_MIN = 1
const STROKE_MAX = 30

/**
 * Controle controlado localmente: o valor do pai só muda no commit (blur/Enter/±).
 * Sem isso, um `value={allWallsStrokeWidth}` + filtro no onChange faz a digitação
 * "travar" (estado intermediário inválido ou vazio volta pro valor antigo).
 */
function GlobalStrokeControl({
  value,
  onChange
}: {
  value: number | null
  onChange: (value: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState(value !== null ? String(value) : '')

  // Sincroniza quando o pai muda (após persistir, ou se walls de outra planta entram).
  useEffect(() => {
    setDraft(value !== null ? String(value) : '')
  }, [value])

  function commit(raw: string): void {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < STROKE_MIN || parsed > STROKE_MAX) {
      // Reverte digito inválido/vazio pro valor atual do pai (ou limpa se misto).
      setDraft(value !== null ? String(value) : '')
      return
    }
    setDraft(String(parsed))
    if (parsed !== value) onChange(parsed)
  }

  function nudge(delta: number): void {
    const base = value ?? STROKE_MIN
    const next = Math.min(STROKE_MAX, Math.max(STROKE_MIN, base + delta))
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <>
      <div className="wall-editor-panel__toolbar-divider" aria-hidden="true" />
      <div className="wall-editor-panel__stroke-control" title="Espessura de todas as arestas (px)">
        <label className="wall-editor-panel__stroke-icon" htmlFor="wall-stroke-width-all">
          <LineWeightIcon width={22} height={22} />
          <span className="sr-only">Espessura de todas as arestas</span>
        </label>
        <div className="wall-editor-panel__stroke-row">
          <button
            type="button"
            className="wall-editor-panel__stroke-nudge"
            onClick={() => nudge(-1)}
            disabled={(value ?? STROKE_MIN) <= STROKE_MIN}
            aria-label="Diminuir espessura"
            title="Diminuir"
          >
            −
          </button>
          <input
            id="wall-stroke-width-all"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                commit(draft)
                ;(event.target as HTMLInputElement).blur()
              } else if (event.key === 'Escape') {
                setDraft(value !== null ? String(value) : '')
                ;(event.target as HTMLInputElement).blur()
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                nudge(1)
              } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                nudge(-1)
              }
            }}
            className="wall-editor-panel__stroke-input"
            aria-label="Espessura do traço de todas as paredes"
          />
          <button
            type="button"
            className="wall-editor-panel__stroke-nudge"
            onClick={() => nudge(1)}
            disabled={(value ?? STROKE_MIN) >= STROKE_MAX}
            aria-label="Aumentar espessura"
            title="Aumentar"
          >
            +
          </button>
        </div>
      </div>
    </>
  )
}
