import { Euler, MathUtils, Quaternion, Vector3 } from "three"
import type { FixturePatch } from "../api/patchApi"
import type { RiggingDto } from "../api/riggingApi"
import type { SliderPropertyDescriptor } from "../store/fixtures"

// Lighting coords are Z-up, FOH-relative (X = stage right, Y = upstage, Z = up).
// R3F's default scene is Y-up, with camera looking down -Z. The swizzle below
// keeps default-up Three.js everywhere else and avoids reframing the camera.
//
//   R3F X = lighting X
//   R3F Y = lighting Z
//   R3F Z = -lighting Y    (downstage is +Z, toward the camera)

export function toThree(stageX: number, stageY: number, stageZ: number, target = new Vector3()): Vector3 {
  return target.set(stageX, stageZ, -stageY)
}

// Build a unit beam direction (in R3F space) from DMX-decoded pan and tilt
// degrees. Mirrors the prototype in stage-vis-discovery.md lines 109-116:
// pan rotates around world Y, then tilt around the fixture's local X. Pan is
// re-centred so 0° points downstage rather than the DMX raw 270° centre.
//
// `target`/`scratchEuler` let per-frame callers pre-allocate to keep the
// useFrame hot path free of per-call Vector3/Euler allocations.
const SCRATCH_EULER = new Euler()
export function panTiltToDir(
  panDeg: number,
  tiltDeg: number,
  target = new Vector3(),
  scratchEuler: Euler = SCRATCH_EULER,
): Vector3 {
  const pan = MathUtils.degToRad(panDeg - 270)
  const tilt = MathUtils.degToRad(tiltDeg)
  scratchEuler.set(tilt, pan, 0, "YXZ")
  return target.set(0, -1, 0).applyEuler(scratchEuler)
}

// Quaternion-only variant of panTiltToDir for the head group on a fixture
// model. Returns the rotation that should be applied to a head whose rest
// pose points down (-Y in R3F). Allocation-free when target/scratchEuler are
// passed in.
const SCRATCH_QUAT_EULER = new Euler()
export function headQuaternionFor(
  panDeg: number,
  tiltDeg: number,
  target = new Quaternion(),
  scratchEuler: Euler = SCRATCH_QUAT_EULER,
): Quaternion {
  const pan = MathUtils.degToRad(panDeg - 270)
  const tilt = MathUtils.degToRad(tiltDeg)
  scratchEuler.set(tilt, pan, 0, "YXZ")
  return target.setFromEuler(scratchEuler)
}

// Convert a raw DMX slider value into degrees using the descriptor's
// degMin/degMax mapping. Returns null when the descriptor lacks both bounds
// (we never invent ranges — the 3D view treats the head as static instead).
// `base` is added after mapping to support per-patch baseYawDeg/basePitchDeg.
export function dmxToDegrees(
  dmx: number,
  slider: SliderPropertyDescriptor,
  base = 0,
): number | null {
  if (slider.degMin == null || slider.degMax == null) return null
  const span = slider.max - slider.min
  if (span <= 0) return null
  const t = Math.max(0, Math.min(1, (dmx - slider.min) / span))
  const tt = slider.inverted ? 1 - t : t
  return slider.degMin + tt * (slider.degMax - slider.degMin) + base
}

// Resolve a patch's world position in R3F space.
//
// 1. If the backend has populated `worldPositionX/Y/Z`, trust it — that's the
//    composed result of any rig frame and is authoritative.
// 2. If `riggingUuid` matches a known rigging, compose stage* (treated as an
//    offset in the rigging's local frame) with the rigging's pose.
// 3. Otherwise stage* is a free-space world coordinate.
//
// TODO(Session 4): the rigging-frame composition below is a simple translate
// that ignores rigging yaw/pitch/roll. Patching ergonomics in Session 4 will
// drive the full rotated-frame composition; until then the backend's pre-
// composed worldPosition* (preferred path) covers the real cases.
export function worldPositionFor(
  patch: FixturePatch,
  riggings: RiggingDto[],
  target = new Vector3(),
): Vector3 {
  if (
    patch.worldPositionX != null &&
    patch.worldPositionY != null &&
    patch.worldPositionZ != null
  ) {
    return toThree(patch.worldPositionX, patch.worldPositionY, patch.worldPositionZ, target)
  }

  const sx = patch.stageX ?? 0
  const sy = patch.stageY ?? 0
  const sz = patch.stageZ ?? 0

  if (patch.riggingUuid) {
    const rig = riggings.find((r) => r.uuid === patch.riggingUuid)
    if (rig) {
      const rx = rig.positionX ?? 0
      const ry = rig.positionY ?? 0
      const rz = rig.positionZ ?? 0
      return toThree(rx + sx, ry + sy, rz + sz, target)
    }
  }

  return toThree(sx, sy, sz, target)
}

// Lighting-coords variant of worldPositionFor — same composition logic but
// returns the FOH-relative (X = stage right, Y = upstage, Z = up) triple
// instead of the R3F swizzle. Used by the 2D top-down fallback panel which
// reasons in stage metres rather than R3F space.
export function worldPositionLighting(
  patch: FixturePatch,
  riggings: RiggingDto[],
): { x: number; y: number; z: number } | null {
  if (
    patch.worldPositionX != null &&
    patch.worldPositionY != null &&
    patch.worldPositionZ != null
  ) {
    return { x: patch.worldPositionX, y: patch.worldPositionY, z: patch.worldPositionZ }
  }

  const sx = patch.stageX
  const sy = patch.stageY
  if (sx == null || sy == null) return null
  const sz = patch.stageZ ?? 0

  if (patch.riggingUuid) {
    const rig = riggings.find((r) => r.uuid === patch.riggingUuid)
    if (rig) {
      return {
        x: (rig.positionX ?? 0) + sx,
        y: (rig.positionY ?? 0) + sy,
        z: (rig.positionZ ?? 0) + sz,
      }
    }
  }

  return { x: sx, y: sy, z: sz }
}
