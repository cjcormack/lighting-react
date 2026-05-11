/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest"
import { MathUtils, Vector3 } from "three"
import { cullRegionCookies, updateFloorCookie } from "./FixtureModel"

const HALF_ANGLE_RAD = MathUtils.degToRad(15)
const COS_CONE = Math.cos(HALF_ANGLE_RAD)
const SIN_CONE = Math.sin(HALF_ANGLE_RAD)

function makeRegion(topCenter: Vector3, topBoundingRadius: number) {
  return { topCenter, topBoundingRadius }
}

describe("cullRegionCookies", () => {
  const origin = new Vector3(0, 0, 0)
  const dir = new Vector3(0, 0, 1)
  const beamLength = 8
  const slot = 3

  function makeCullWriter() {
    const writeRegionVisibility = vi.fn()
    return { emitters: { writeRegionVisibility }, writeRegionVisibility }
  }

  it("marks an aligned region within reach as visible", () => {
    const { emitters, writeRegionVisibility } = makeCullWriter()
    const regions = [makeRegion(new Vector3(0, 0, 4), 0.5)]
    cullRegionCookies(emitters, slot, origin, dir, beamLength, COS_CONE, SIN_CONE, regions)
    expect(writeRegionVisibility).toHaveBeenCalledWith(slot, 0, true)
  })

  it("hides a region behind the fixture (distance + radius > beamLength)", () => {
    const { emitters, writeRegionVisibility } = makeCullWriter()
    const regions = [makeRegion(new Vector3(0, 0, -10), 0.5)]
    cullRegionCookies(emitters, slot, origin, dir, beamLength, COS_CONE, SIN_CONE, regions)
    expect(writeRegionVisibility).toHaveBeenCalledWith(slot, 0, false)
  })

  it("hides a region on the cone axis but past beamLength", () => {
    const { emitters, writeRegionVisibility } = makeCullWriter()
    const regions = [makeRegion(new Vector3(0, 0, 12), 0.5)]
    cullRegionCookies(emitters, slot, origin, dir, beamLength, COS_CONE, SIN_CONE, regions)
    expect(writeRegionVisibility).toHaveBeenCalledWith(slot, 0, false)
  })

  it("marks visible when origin is inside the region's bounding sphere (fixture mounted on it)", () => {
    const { emitters, writeRegionVisibility } = makeCullWriter()
    const regions = [makeRegion(new Vector3(0.1, 0, 0), 1.0)]
    cullRegionCookies(emitters, slot, origin, dir, beamLength, COS_CONE, SIN_CONE, regions)
    expect(writeRegionVisibility).toHaveBeenCalledWith(slot, 0, true)
  })

  it("hides a region inside reach but outside the cone's angular boundary", () => {
    const { emitters, writeRegionVisibility } = makeCullWriter()
    const regions = [makeRegion(new Vector3(0, 0, -4), 0.5)]
    cullRegionCookies(emitters, slot, origin, dir, beamLength, COS_CONE, SIN_CONE, regions)
    expect(writeRegionVisibility).toHaveBeenCalledWith(slot, 0, false)
  })
})

describe("updateFloorCookie", () => {
  const side = 4
  const slot = 7

  function makeWriter() {
    const writeFloorMatrix = vi.fn()
    return { emitters: { writeFloorMatrix }, writeFloorMatrix }
  }

  it("hides the floor and skips repositioning when the beam is aimed up (dir.y >= sinCone)", () => {
    const { emitters, writeFloorMatrix } = makeWriter()
    const origin = new Vector3(0, 5, 0)
    const dir = new Vector3(0, 0.5, 0)
    updateFloorCookie(emitters, slot, origin, dir, 8, SIN_CONE, side)
    expect(writeFloorMatrix).toHaveBeenCalledWith(slot, false, 0, 0, 0)
  })

  it("projects straight-down beam to the fixture's XZ and scales by side", () => {
    const { emitters, writeFloorMatrix } = makeWriter()
    const origin = new Vector3(3, 5, -2)
    const dir = new Vector3(0, -1, 0)
    updateFloorCookie(emitters, slot, origin, dir, 8, SIN_CONE, side)
    expect(writeFloorMatrix).toHaveBeenCalledTimes(1)
    const [argSlot, visible, cx, cz, sideOut] = writeFloorMatrix.mock.calls[0]
    expect(argSlot).toBe(slot)
    expect(visible).toBe(true)
    expect(cx).toBeCloseTo(3, 10)
    expect(cz).toBeCloseTo(-2, 10)
    expect(sideOut).toBe(side)
  })

  it("offsets along dir.xz when the beam is tilted toward the stage", () => {
    const { emitters, writeFloorMatrix } = makeWriter()
    const origin = new Vector3(0, 5, 0)
    const dir = new Vector3(0.6, -0.8, 0).normalize()
    const beamLength = 100
    updateFloorCookie(emitters, slot, origin, dir, beamLength, SIN_CONE, side)
    const t = -origin.y / dir.y
    const [, visible, cx, cz, sideOut] = writeFloorMatrix.mock.calls[0]
    expect(visible).toBe(true)
    expect(cx).toBeCloseTo(origin.x + t * dir.x, 9)
    expect(cz).toBeCloseTo(origin.z + t * dir.z, 9)
    expect(sideOut).toBe(side)
  })

  it("clamps to beamLength when -origin.y / dir.y exceeds it (dir.y tiny)", () => {
    const { emitters, writeFloorMatrix } = makeWriter()
    const origin = new Vector3(0, 5, 0)
    const dir = new Vector3(0.6, -0.01, 0.8)
    const beamLength = 4
    updateFloorCookie(emitters, slot, origin, dir, beamLength, SIN_CONE, side)
    const [, visible, cx, cz] = writeFloorMatrix.mock.calls[0]
    expect(visible).toBe(true)
    expect(cx).toBeCloseTo(origin.x + beamLength * dir.x, 9)
    expect(cz).toBeCloseTo(origin.z + beamLength * dir.z, 9)
  })
})
