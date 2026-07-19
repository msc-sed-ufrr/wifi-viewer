import { describe, expect, it } from 'vitest'
import { clampToImage } from './clampToImage'

describe('clampToImage', () => {
  it('passes a position through unchanged when it is already within bounds', () => {
    expect(clampToImage(100, 50, 400, 300)).toEqual({ x: 100, y: 50 })
  })

  it('clamps negative coordinates to 0', () => {
    expect(clampToImage(-10, -5, 400, 300)).toEqual({ x: 0, y: 0 })
  })

  it('clamps coordinates beyond the image dimensions to the edge', () => {
    expect(clampToImage(900, 500, 400, 300)).toEqual({ x: 400, y: 300 })
  })

  it('clamps each axis independently', () => {
    expect(clampToImage(-10, 500, 400, 300)).toEqual({ x: 0, y: 300 })
  })

  it('treats a position exactly on the boundary as within bounds', () => {
    expect(clampToImage(400, 300, 400, 300)).toEqual({ x: 400, y: 300 })
    expect(clampToImage(0, 0, 400, 300)).toEqual({ x: 0, y: 0 })
  })
})
