import { Euler, MathUtils, Vector3 } from "three"
import type { FixturePatch } from "../api/patchApi"
import type { RiggingDto } from "../api/riggingApi"

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
