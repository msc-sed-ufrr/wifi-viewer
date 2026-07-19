export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024

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
