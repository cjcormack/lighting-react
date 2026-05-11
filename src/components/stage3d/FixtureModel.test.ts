/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest"
import { MathUtils, Vector3, Group, Mesh } from "three"
import {
  cullRegionCookies,
  updateFloorCookie,
  type RegionData,
} from "./FixtureModel"

const HALF_ANGLE_RAD = MathUtils.degToRad(15)
const COS_CONE = Math.cos(HALF_ANGLE_RAD)
const SIN_CONE = Math.sin(HALF_ANGLE_RAD)
const COOKIE_LIFT_M = 0.001

function makeCookieGroup(): Group {
  // Stub only carries `.visible`; cull never touches anything else.
  return { visible: false } as unknown as Group
}

function makeRegion(
  topCenter: Vector3,
  topBoundingRadius: number,
  cookieGroup: Group | null,
): RegionData {
  return {
    uuid: "r",
    widthM: 1,
    depthM: 1,
    yawRad: 0,
    obbCenter: new Vector3(),
    obbHalfX: 0.5,
    obbHalfY: 0.5,
    obbHalfZ: 0.5,
    topCenter,
    topBoundingRadius,
    cookieGroup,
  }
}

describe("cullRegionCookies", () => {
  const origin = new Vector3(0, 0, 0)
  const dir = new Vector3(0, 0, 1)
  const beamLength = 8

  it("marks an aligned region within reach as visible", () => {
    const group = makeCookieGroup()
    const regions = [makeRegion(new Vector3(0, 0, 4), 0.5, group)]
    cullRegionCookies(origin, dir, beamLength, COS_CONE, SIN_CONE, regions)
    expect(group.visible).toBe(true)
  })

  it("hides a region behind the fixture (distance + radius > beamLength)", () => {
    const group = makeCookieGroup()
    group.visible = true
    const regions = [makeRegion(new Vector3(0, 0, -10), 0.5, group)]
    cullRegionCookies(origin, dir, beamLength, COS_CONE, SIN_CONE, regions)
    expect(group.visible).toBe(false)
  })

  it("hides a region on the cone axis but past beamLength", () => {
    const group = makeCookieGroup()
    group.visible = true
    const regions = [makeRegion(new Vector3(0, 0, 12), 0.5, group)]
    cullRegionCookies(origin, dir, beamLength, COS_CONE, SIN_CONE, regions)
    expect(group.visible).toBe(false)
  })

  it("marks visible when origin is inside the region's bounding sphere (fixture mounted on it)", () => {
    const group = makeCookieGroup()
    const regions = [makeRegion(new Vector3(0.1, 0, 0), 1.0, group)]
    cullRegionCookies(origin, dir, beamLength, COS_CONE, SIN_CONE, regions)
    expect(group.visible).toBe(true)
  })

  it("hides a region inside reach but outside the cone's angular boundary", () => {
    const group = makeCookieGroup()
    group.visible = true
    const regions = [makeRegion(new Vector3(0, 0, -4), 0.5, group)]
    cullRegionCookies(origin, dir, beamLength, COS_CONE, SIN_CONE, regions)
    expect(group.visible).toBe(false)
  })

  it("skips regions whose cookieGroup is null", () => {
    const regions = [makeRegion(new Vector3(0, 0, 4), 0.5, null)]
    expect(() => cullRegionCookies(origin, dir, beamLength, COS_CONE, SIN_CONE, regions)).not.toThrow()
  })
})

describe("updateFloorCookie", () => {
  const side = 4

  function makePool() {
    const positionSet = vi.fn()
    const scaleSet = vi.fn()
    const pool = {
      visible: true,
      position: { set: positionSet },
      scale: { set: scaleSet },
    } as unknown as Mesh
    return { pool, positionSet, scaleSet }
  }

  it("hides the pool and skips writes when the beam is aimed up (dir.y >= sinCone)", () => {
    const { pool, positionSet, scaleSet } = makePool()
    const origin = new Vector3(0, 5, 0)
    const dir = new Vector3(0, 0.5, 0)
    updateFloorCookie(pool, origin, dir, 8, SIN_CONE, side)
    expect(pool.visible).toBe(false)
    expect(positionSet).not.toHaveBeenCalled()
    expect(scaleSet).not.toHaveBeenCalled()
  })

  it("projects straight-down beam to the fixture's XZ and scales by side", () => {
    const { pool, positionSet, scaleSet } = makePool()
    const origin = new Vector3(3, 5, -2)
    const dir = new Vector3(0, -1, 0)
    updateFloorCookie(pool, origin, dir, 8, SIN_CONE, side)
    expect(pool.visible).toBe(true)
    expect(positionSet).toHaveBeenCalledTimes(1)
    const [cx, cy, cz] = positionSet.mock.calls[0]
    expect(cx).toBeCloseTo(3, 10)
    expect(cy).toBeCloseTo(COOKIE_LIFT_M, 10)
    expect(cz).toBeCloseTo(-2, 10)
    expect(scaleSet).toHaveBeenCalledWith(side, side, 1)
  })

  it("offsets along dir.xz when the beam is tilted toward the stage", () => {
    const { pool, positionSet, scaleSet } = makePool()
    const origin = new Vector3(0, 5, 0)
    const dir = new Vector3(0.6, -0.8, 0).normalize()
    const beamLength = 100
    updateFloorCookie(pool, origin, dir, beamLength, SIN_CONE, side)
    expect(pool.visible).toBe(true)
    const t = -origin.y / dir.y
    const [cx, , cz] = positionSet.mock.calls[0]
    expect(cx).toBeCloseTo(origin.x + t * dir.x, 9)
    expect(cz).toBeCloseTo(origin.z + t * dir.z, 9)
    expect(scaleSet).toHaveBeenCalledWith(side, side, 1)
  })

  it("clamps to beamLength when -origin.y / dir.y exceeds it (dir.y tiny)", () => {
    const { pool, positionSet } = makePool()
    const origin = new Vector3(0, 5, 0)
    const dir = new Vector3(0.6, -0.01, 0.8)
    const beamLength = 4
    updateFloorCookie(pool, origin, dir, beamLength, SIN_CONE, side)
    expect(pool.visible).toBe(true)
    const [cx, , cz] = positionSet.mock.calls[0]
    expect(cx).toBeCloseTo(origin.x + beamLength * dir.x, 9)
    expect(cz).toBeCloseTo(origin.z + beamLength * dir.z, 9)
  })
})
