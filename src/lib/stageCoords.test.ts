import { describe, it, expect } from "vitest"
import { Vector3 } from "three"
import {
  toThree,
  fromThree,
  panTiltToDir,
  headQuaternionFor,
  worldPositionFor,
  dmxToDegrees,
} from "./stageCoords"
import type { FixturePatch } from "../api/patchApi"
import type { RiggingDto } from "../api/riggingApi"
import type { SliderPropertyDescriptor } from "../store/fixtures"

const APPROX = 1e-9

function basePatch(overrides: Partial<FixturePatch> = {}): FixturePatch {
  return {
    id: 1,
    key: "p1",
    displayName: "P1",
    fixtureTypeKey: "tk",
    startChannel: 1,
    channelCount: 1,
    manufacturer: null,
    model: null,
    modeName: null,
    universe: 1,
    subnet: 0,
    sortOrder: 0,
    groups: [],
    stageX: null,
    stageY: null,
    stageZ: null,
    baseYawDeg: null,
    basePitchDeg: null,
    riggingUuid: null,
    worldPositionX: null,
    worldPositionY: null,
    worldPositionZ: null,
    riggingPosition: null,
    beamAngleDeg: null,
    gelCode: null,
    kindOverride: null,
    ...overrides,
  }
}

function baseRig(overrides: Partial<RiggingDto> = {}): RiggingDto {
  return {
    id: 1,
    uuid: "rig-1",
    name: "Rig 1",
    kind: "truss",
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    lengthM: 3,
    sortOrder: 0,
    ...overrides,
  }
}

function baseSlider(overrides: Partial<SliderPropertyDescriptor> = {}): SliderPropertyDescriptor {
  return {
    type: "slider",
    name: "pan",
    displayName: "Pan",
    category: "pan",
    channel: { universe: 1, channelNo: 1 },
    min: 0,
    max: 255,
    ...overrides,
  }
}

describe("toThree / fromThree", () => {
  it("round-trips arbitrary inputs", () => {
    const samples: [number, number, number][] = [
      [0, 0, 0],
      [1.5, -2.25, 4],
      [-3.7, 8.1, -0.001],
      [1000, -1000, 1000],
    ]
    for (const [x, y, z] of samples) {
      const r3f = toThree(x, y, z)
      const back = fromThree(r3f)
      expect(back.x).toBeCloseTo(x, 10)
      expect(back.y).toBeCloseTo(y, 10)
      expect(back.z).toBeCloseTo(z, 10)
    }
  })

  it("swizzles stage axes into R3F (X right, Y up, Z toward camera)", () => {
    const v = toThree(2, 5, 7)
    expect(v.x).toBeCloseTo(2, 10)
    expect(v.y).toBeCloseTo(7, 10)
    expect(v.z).toBeCloseTo(-5, 10)
  })

  it("toThree writes into a caller-provided target", () => {
    const target = new Vector3(99, 99, 99)
    const result = toThree(1, 2, 3, target)
    expect(result).toBe(target)
    expect(target.x).toBeCloseTo(1, 10)
    expect(target.y).toBeCloseTo(3, 10)
    expect(target.z).toBeCloseTo(-2, 10)
  })
})

describe("panTiltToDir", () => {
  it("at DMX-centre (pan=270, tilt=0) points straight down", () => {
    const v = panTiltToDir(270, 0)
    expect(v.x).toBeCloseTo(0, APPROX)
    expect(v.y).toBeCloseTo(-1, APPROX)
    expect(v.z).toBeCloseTo(0, APPROX)
  })

  it("produces a unit vector for arbitrary inputs", () => {
    const cases: [number, number][] = [
      [0, 0],
      [90, 45],
      [180, 30],
      [270, 90],
      [45, -60],
      [359, 89],
    ]
    for (const [pan, tilt] of cases) {
      const v = panTiltToDir(pan, tilt)
      const mag = Math.hypot(v.x, v.y, v.z)
      expect(mag).toBeCloseTo(1, 9)
    }
  })

  it("writes into a caller-provided target", () => {
    const target = new Vector3(99, 99, 99)
    const result = panTiltToDir(270, 0, target)
    expect(result).toBe(target)
    expect(target.y).toBeCloseTo(-1, APPROX)
  })
})

describe("headQuaternionFor", () => {
  it("applied to the rest direction reproduces panTiltToDir", () => {
    const cases: [number, number][] = [
      [270, 0],
      [0, 0],
      [90, 45],
      [180, 30],
      [45, -60],
      [315, 75],
    ]
    for (const [pan, tilt] of cases) {
      const q = headQuaternionFor(pan, tilt)
      const rest = new Vector3(0, -1, 0)
      rest.applyQuaternion(q)
      const expected = panTiltToDir(pan, tilt)
      expect(rest.x).toBeCloseTo(expected.x, 9)
      expect(rest.y).toBeCloseTo(expected.y, 9)
      expect(rest.z).toBeCloseTo(expected.z, 9)
    }
  })
})

describe("worldPositionFor", () => {
  it("uses backend-composed worldPosition* when present (swizzled)", () => {
    const patch = basePatch({
      worldPositionX: 2,
      worldPositionY: 5,
      worldPositionZ: 7,
      stageX: 99,
      stageY: 99,
      stageZ: 99,
    })
    const v = worldPositionFor(patch, [])
    expect(v.x).toBeCloseTo(2, 10)
    expect(v.y).toBeCloseTo(7, 10)
    expect(v.z).toBeCloseTo(-5, 10)
  })

  it("composes stage offset with a matching rigging position", () => {
    const rig = baseRig({ uuid: "rig-X", positionX: 1, positionY: 2, positionZ: 3 })
    const patch = basePatch({
      stageX: 0.5,
      stageY: 0.25,
      stageZ: 0.1,
      riggingUuid: "rig-X",
    })
    const v = worldPositionFor(patch, [rig])
    expect(v.x).toBeCloseTo(1.5, 10)
    expect(v.y).toBeCloseTo(3.1, 10)
    expect(v.z).toBeCloseTo(-2.25, 10)
  })

  it("falls back to stage* when riggingUuid does not match", () => {
    const rig = baseRig({ uuid: "rig-X" })
    const patch = basePatch({
      stageX: 4,
      stageY: 1,
      stageZ: 2,
      riggingUuid: "rig-NOTFOUND",
    })
    const v = worldPositionFor(patch, [rig])
    expect(v.x).toBeCloseTo(4, 10)
    expect(v.y).toBeCloseTo(2, 10)
    expect(v.z).toBeCloseTo(-1, 10)
  })

  it("treats stage* as free-space world coords when no rigging is set", () => {
    const patch = basePatch({ stageX: 3, stageY: -2, stageZ: 1 })
    const v = worldPositionFor(patch, [])
    expect(v.x).toBeCloseTo(3, 10)
    expect(v.y).toBeCloseTo(1, 10)
    expect(v.z).toBeCloseTo(2, 10)
  })

  it("treats null stage* as zero", () => {
    const patch = basePatch()
    const v = worldPositionFor(patch, [])
    expect(v.x).toBeCloseTo(0, 10)
    expect(v.y).toBeCloseTo(0, 10)
    expect(v.z).toBeCloseTo(0, 10)
  })
})

describe("dmxToDegrees", () => {
  it("returns null when degMin or degMax is missing", () => {
    expect(dmxToDegrees(128, baseSlider())).toBeNull()
    expect(dmxToDegrees(128, baseSlider({ degMin: 0 }))).toBeNull()
    expect(dmxToDegrees(128, baseSlider({ degMax: 540 }))).toBeNull()
  })

  it("maps boundaries to degMin/degMax", () => {
    const s = baseSlider({ degMin: 0, degMax: 540 })
    expect(dmxToDegrees(0, s)).toBeCloseTo(0, 9)
    expect(dmxToDegrees(255, s)).toBeCloseTo(540, 9)
  })

  it("clamps below min and above max", () => {
    const s = baseSlider({ degMin: 0, degMax: 540 })
    expect(dmxToDegrees(-10, s)).toBeCloseTo(0, 9)
    expect(dmxToDegrees(999, s)).toBeCloseTo(540, 9)
  })

  it("interpolates linearly at the midpoint", () => {
    const s = baseSlider({ degMin: 0, degMax: 540 })
    expect(dmxToDegrees(127.5, s)).toBeCloseTo(270, 9)
  })

  it("honours the inverted flag", () => {
    const s = baseSlider({ degMin: 0, degMax: 540, inverted: true })
    expect(dmxToDegrees(0, s)).toBeCloseTo(540, 9)
    expect(dmxToDegrees(255, s)).toBeCloseTo(0, 9)
  })

  it("adds the base offset after mapping", () => {
    const s = baseSlider({ degMin: 0, degMax: 540 })
    expect(dmxToDegrees(0, s, 30)).toBeCloseTo(30, 9)
    expect(dmxToDegrees(255, s, -45)).toBeCloseTo(540 - 45, 9)
  })

  it("returns null when span is zero or negative", () => {
    expect(dmxToDegrees(0, baseSlider({ min: 10, max: 10, degMin: 0, degMax: 540 }))).toBeNull()
  })
})
