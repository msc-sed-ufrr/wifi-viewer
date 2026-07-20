import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { FloorPlan, MeasurementPoint } from '../types/domain'

interface Props {
  floorPlan: FloorPlan
  points: MeasurementPoint[]
  file: File
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

/** Faixa e passo do zoom da imagem em relação aos pontos fixos — bem mais ampla que o zoom de visualização (ADR-030), já que a imagem nova pode ter qualquer proporção em relação à antiga. */
const MIN_SCALE = 0.1
const MAX_SCALE = 5
const SCALE_STEP_FACTOR = 1.25
/** Largura de exibição do canvas dentro do modal — a altura acompanha proporcionalmente (ver FloorPlanCanvas.tsx). */
const DISPLAY_WIDTH_PX = 560

interface Transform {
  scale: number
  offsetX: number
  offsetY: number
}

interface DragState {
  startX: number
  startY: number
  startOffsetX: number
  startOffsetY: number
}

/**
 * Modal de ajuste manual da imagem ao substituir a planta (ADR-040): ao contrário do
 * reposicionamento automático (ADR-039, que move os PONTOS pra caber na imagem nova), aqui os
 * pontos ficam fixos e é a IMAGEM nova que se move/escala por baixo deles — útil quando a nova
 * imagem tem proporção diferente da antiga e a reescala por eixo distorceria a posição relativa
 * dos pontos. O canvas desenha só a imagem (os pontos são `<div>`s sobrepostos por porcentagem,
 * nunca entram no canvas) porque ao confirmar ele é exportado direto via `toBlob` — precisa
 * conter exatamente o que vai virar a nova imagem da planta, nada de marcador desenhado nele.
 */
export function ImageAlignEditor({ floorPlan, points, file, onCancel, onConfirm }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [transform, setTransform] = useState<Transform>({ scale: 1, offsetX: 0, offsetY: 0 })
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // Contain-fit centralizado: ponto de partida razoável antes do usuário ajustar.
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, Math.min(floorPlan.imageWidth / img.naturalWidth, floorPlan.imageHeight / img.naturalHeight))
      )
      const offsetX = (floorPlan.imageWidth - img.naturalWidth * scale) / 2
      const offsetY = (floorPlan.imageHeight - img.naturalHeight * scale) / 2
      setTransform({ scale, offsetX, offsetY })
      setImage(img)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file, floorPlan.imageWidth, floorPlan.imageHeight])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !image) return

    canvas.width = floorPlan.imageWidth
    canvas.height = floorPlan.imageHeight

    // Fundo branco opaco em vez de transparente: contain-fit (o ponto de partida) quase sempre deixa
    // faixas sem cobertura quando a imagem nova tem proporção diferente da antiga — esse é o caso
    // central deste editor, não uma borda — e o resto do app (FloorPlanCanvas, heatmap) assume uma
    // imagem de planta opaca. Sem isso, essas faixas ficariam transparentes na imagem final.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(
      image,
      transform.offsetX,
      transform.offsetY,
      image.naturalWidth * transform.scale,
      image.naturalHeight * transform.scale
    )
  }, [image, transform, floorPlan.imageWidth, floorPlan.imageHeight])

  function handleMouseDown(event: MouseEvent<HTMLCanvasElement>): void {
    if (event.button !== 0) return
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: transform.offsetX,
      startOffsetY: transform.offsetY
    }
    setIsDragging(true)
  }

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>): void {
    const drag = dragStateRef.current
    const canvas = canvasRef.current
    if (!drag || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    setTransform((prev) => ({
      ...prev,
      offsetX: drag.startOffsetX + (event.clientX - drag.startX) * scaleX,
      offsetY: drag.startOffsetY + (event.clientY - drag.startY) * scaleY
    }))
  }

  function endDrag(): void {
    dragStateRef.current = null
    setIsDragging(false)
  }

  /** Zoom ancorado no centro do canvas — o ponto da imagem que está no meio da área visível continua no meio depois de escalar. */
  function applyZoom(factor: number): void {
    setTransform((prev) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor))
      const centerX = floorPlan.imageWidth / 2
      const centerY = floorPlan.imageHeight / 2
      const imagePointX = (centerX - prev.offsetX) / prev.scale
      const imagePointY = (centerY - prev.offsetY) / prev.scale
      return {
        scale: nextScale,
        offsetX: centerX - imagePointX * nextScale,
        offsetY: centerY - imagePointY * nextScale
      }
    })
  }

  function handleConfirm(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (blob) onConfirm(blob)
    }, 'image/png')
  }

  const displayHeight = (DISPLAY_WIDTH_PX * floorPlan.imageHeight) / floorPlan.imageWidth

  return (
    <div className="modal-overlay">
      <div className="modal modal--wide">
        <h2>Ajustar imagem manualmente</h2>
        <p className="modal__hint">
          Arraste a imagem para posicioná-la e use +/− para ajustar o tamanho, até que ela coincida com os pontos
          existentes (marcados abaixo). Os pontos não se movem.
        </p>

        <div className="align-editor__canvas-wrap" style={{ width: DISPLAY_WIDTH_PX, height: displayHeight }}>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            style={{ width: `${DISPLAY_WIDTH_PX}px` }}
            className={`align-editor__canvas${isDragging ? ' align-editor__canvas--dragging' : ''}`}
          />
          {points.map((point, index) => (
            <div
              key={point.id}
              className="align-editor__marker"
              style={{
                left: `${(point.x / floorPlan.imageWidth) * 100}%`,
                top: `${(point.y / floorPlan.imageHeight) * 100}%`
              }}
            >
              {index + 1}
            </div>
          ))}
        </div>

        <div className="align-editor__zoom-controls">
          <button type="button" onClick={() => applyZoom(1 / SCALE_STEP_FACTOR)} disabled={transform.scale <= MIN_SCALE}>
            −
          </button>
          <span>{Math.round(transform.scale * 100)}%</span>
          <button type="button" onClick={() => applyZoom(SCALE_STEP_FACTOR)} disabled={transform.scale >= MAX_SCALE}>
            +
          </button>
        </div>

        <div className="modal__actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" onClick={handleConfirm}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
