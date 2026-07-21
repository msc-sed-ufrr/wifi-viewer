import type { FloorPlanCalibration } from '../types/domain'

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024

/**
 * Planta em branco (sem imagem do usuário): terreno ~40 m × 30 m.
 * 30 px/m → 1200×900 px — cabe no viewport típico do app em zoom 100%
 * (largura ~ viewport útil; proporção 4:3).
 * Calibração embutida pra réguas/Size já virem em metros.
 */
export const BLANK_FLOOR_PLAN_PPM = 30
export const BLANK_FLOOR_PLAN_WIDTH_M = 40
export const BLANK_FLOOR_PLAN_HEIGHT_M = 30
export const BLANK_FLOOR_PLAN_WIDTH_PX = BLANK_FLOOR_PLAN_WIDTH_M * BLANK_FLOOR_PLAN_PPM
export const BLANK_FLOOR_PLAN_HEIGHT_PX = BLANK_FLOOR_PLAN_HEIGHT_M * BLANK_FLOOR_PLAN_PPM

/** Formato/tamanho aceitáveis pra imagem de planta — null quando válido. */
export function validateFloorPlanImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Formato inválido. Use PNG, JPG, JPEG ou WEBP.'
  }
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return 'A imagem deve ter no máximo 10 MB.'
  }
  return null
}

export function loadImageDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      reject(new Error('Não foi possível ler a imagem da planta.'))
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

/** Dimensões + calibração da planta em branco (puro, sem DOM — testável no Node). */
export function getBlankFloorPlanSpec(): {
  width: number
  height: number
  calibration: FloorPlanCalibration
} {
  const width = BLANK_FLOOR_PLAN_WIDTH_PX
  const height = BLANK_FLOOR_PLAN_HEIGHT_PX
  return {
    width,
    height,
    calibration: {
      pointA: { x: 0, y: height / 2 },
      pointB: { x: width, y: height / 2 },
      realDistanceMeters: BLANK_FLOOR_PLAN_WIDTH_M
    }
  }
}

/**
 * Gera um PNG branco no tamanho da planta em branco + calibração ponta-a-ponta horizontal
 * (pointA→pointB = largura real em metros). Usado quando o usuário cria planta sem imagem.
 * Requer DOM (`document`/`canvas`) — roda só no renderer.
 */
export function createBlankFloorPlanImage(): Promise<{
  blob: Blob
  width: number
  height: number
  calibration: FloorPlanCalibration
}> {
  const { width, height, calibration } = getBlankFloorPlanSpec()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Não foi possível criar a planta em branco.'))

  // Fundo branco — canvas de desenho de arestas, não uma planta fotográfica.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  // Grade sutil a cada 1 m (BLANK_FLOOR_PLAN_PPM px) — ajuda a dimensionar terrenos sem carregar imagem.
  ctx.strokeStyle = '#f3f4f6'
  ctx.lineWidth = 1
  for (let x = BLANK_FLOOR_PLAN_PPM; x < width; x += BLANK_FLOOR_PLAN_PPM) {
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, height)
    ctx.stroke()
  }
  for (let y = BLANK_FLOOR_PLAN_PPM; y < height; y += BLANK_FLOOR_PLAN_PPM) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(width, y + 0.5)
    ctx.stroke()
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Não foi possível criar a planta em branco.'))
        return
      }
      resolve({ blob, width, height, calibration })
    }, 'image/png')
  })
}
