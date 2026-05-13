import { Euler, MathUtils, Object3D, Quaternion, Vector3 } from "three"
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

// Inverse of `toThree` — convert R3F (X, Y, Z) back to lighting (X, Y, Z).
export function fromThree(v: Vector3): { x: number; y: number; z: number } {
  return { x: v.x, y: -v.z, z: v.y }
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

// Build the YXZ Euler that maps the rig's lighting-coord pitch/yaw/roll to a
// three.js rotation. YXZ is intrinsic: yaw applies first (around lighting Z =
// R3F Y), then pitch (lighting X = R3F X), then roll (lighting Y = R3F -Z).
// Pass `target` to keep per-frame callers allocation-free.
export function rigEuler(
  rig: { pitchDeg: number | null; yawDeg: number | null; rollDeg: number | null },
  target: Euler = new Euler(),
): Euler {
  target.set(
    MathUtils.degToRad(rig.pitchDeg ?? 0),
    MathUtils.degToRad(rig.yawDeg ?? 0),
    MathUtils.degToRad(rig.rollDeg ?? 0),
    "YXZ",
  )
  return target
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

// Resolve a patch's world position in R3F space. When `riggingUuid` matches a
// known rigging, stage* is treated as an offset in the rigging's local lighting
// frame and composed with the rig's full pose (position + yaw/pitch/roll).
// Otherwise stage* is a free-space world coordinate.
const SCRATCH_RIG_EULER = new Euler()
const SCRATCH_OFFSET = new Vector3()
export function worldPositionFor(
  patch: FixturePatch,
  riggings: RiggingDto[],
  target = new Vector3(),
): Vector3 {
  const sx = patch.stageX ?? 0
  const sy = patch.stageY ?? 0
  const sz = patch.stageZ ?? 0

  if (patch.riggingUuid) {
    const rig = riggings.find((r) => r.uuid === patch.riggingUuid)
    if (rig) {
      // Swizzle stage offset into R3F-local, rotate by the rig's pose, then
      // translate by the rig's R3F world position. rigEuler matches the YXZ
      // Euler that RiggingMeshes applies to the visual mesh.
      SCRATCH_OFFSET.set(sx, sz, -sy).applyEuler(rigEuler(rig, SCRATCH_RIG_EULER))
      toThree(rig.positionX ?? 0, rig.positionY ?? 0, rig.positionZ ?? 0, target)
      return target.add(SCRATCH_OFFSET)
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
  const sx = patch.stageX
  const sy = patch.stageY
  if (sx == null || sy == null) return null
  const sz = patch.stageZ ?? 0

  if (patch.riggingUuid) {
    const rig = riggings.find((r) => r.uuid === patch.riggingUuid)
    if (rig) {
      // Apply the rig's pose to the offset by going through R3F space (where
      // rigEuler is defined), then swizzle back to lighting coords.
      SCRATCH_OFFSET.set(sx, sz, -sy).applyEuler(rigEuler(rig, SCRATCH_RIG_EULER))
      return {
        x: (rig.positionX ?? 0) + SCRATCH_OFFSET.x,
        y: (rig.positionY ?? 0) - SCRATCH_OFFSET.z,
        z: (rig.positionZ ?? 0) + SCRATCH_OFFSET.y,
      }
    }
  }

  return { x: sx, y: sy, z: sz }
}

// Inverse of `worldPositionFor`: project an R3F world point into a patch's
// rig-local frame and recover stage* offsets in lighting coords. With no
// rigging the world point is treated as a free-space lighting position.
export interface RigPlacement {
  riggingUuid: string | null
  stageX: number | null
  stageY: number | null
  stageZ: number | null
}
const SCRATCH_OBJ = new Object3D()
const SCRATCH_WORLDPOS = new Vector3()
export function patchPlacementFromWorld(
  patch: FixturePatch,
  worldR3F: Vector3,
  riggings: RiggingDto[],
): RigPlacement {
  if (!patch.riggingUuid) {
    const l = fromThree(worldR3F)
    return { riggingUuid: null, stageX: l.x, stageY: l.y, stageZ: l.z }
  }

  const rig = riggings.find((r) => r.uuid === patch.riggingUuid)
  if (!rig) {
    return {
      riggingUuid: patch.riggingUuid,
      stageX: patch.stageX,
      stageY: patch.stageY,
      stageZ: patch.stageZ,
    }
  }

  SCRATCH_OBJ.position.set(rig.positionX ?? 0, rig.positionZ ?? 0, -(rig.positionY ?? 0))
  rigEuler(rig, SCRATCH_OBJ.rotation)
  SCRATCH_OBJ.updateMatrixWorld()
  const local = SCRATCH_OBJ.worldToLocal(SCRATCH_WORLDPOS.copy(worldR3F))
  return {
    riggingUuid: patch.riggingUuid,
    stageX: local.x,
    stageY: -local.z,
    stageZ: local.y,
  }
}
