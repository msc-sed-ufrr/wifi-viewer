export function clampToImage(x: number, y: number, width: number, height: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 0), width),
    y: Math.min(Math.max(y, 0), height)
  }
}
