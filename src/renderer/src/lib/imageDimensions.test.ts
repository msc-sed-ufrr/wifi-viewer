import { describe, expect, it } from 'vitest'
import {
  BLANK_FLOOR_PLAN_HEIGHT_PX,
  BLANK_FLOOR_PLAN_PPM,
  BLANK_FLOOR_PLAN_WIDTH_M,
  BLANK_FLOOR_PLAN_WIDTH_PX,
  getBlankFloorPlanSpec,
  MAX_IMAGE_FILE_SIZE,
  validateFloorPlanImageFile
} from './imageDimensions'

function makeFile(type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], 'planta', { type })
}

describe('validateFloorPlanImageFile', () => {
  it('accepts PNG, JPEG and WEBP within the size limit', () => {
    expect(validateFloorPlanImageFile(makeFile('image/png', 1024))).toBeNull()
    expect(validateFloorPlanImageFile(makeFile('image/jpeg', 1024))).toBeNull()
    expect(validateFloorPlanImageFile(makeFile('image/webp', 1024))).toBeNull()
  })

  it('rejects an unsupported type', () => {
    expect(validateFloorPlanImageFile(makeFile('image/gif', 1024))).toMatch(/formato inválido/i)
  })

  it('rejects a file over the size limit', () => {
    expect(validateFloorPlanImageFile(makeFile('image/png', MAX_IMAGE_FILE_SIZE + 1))).toMatch(/10 mb/i)
  })

  it('accepts a file exactly at the size limit', () => {
    expect(validateFloorPlanImageFile(makeFile('image/png', MAX_IMAGE_FILE_SIZE))).toBeNull()
  })
})

describe('getBlankFloorPlanSpec', () => {
  it('describes a calibrated blank canvas for ~40 m × 30 m', () => {
    const blank = getBlankFloorPlanSpec()
    expect(blank.width).toBe(BLANK_FLOOR_PLAN_WIDTH_PX)
    expect(blank.height).toBe(BLANK_FLOOR_PLAN_HEIGHT_PX)
    expect(blank.calibration.realDistanceMeters).toBe(BLANK_FLOOR_PLAN_WIDTH_M)
    const pixelSpan = Math.hypot(
      blank.calibration.pointB.x - blank.calibration.pointA.x,
      blank.calibration.pointB.y - blank.calibration.pointA.y
    )
    expect(pixelSpan / blank.calibration.realDistanceMeters).toBeCloseTo(BLANK_FLOOR_PLAN_PPM)
  })
})
