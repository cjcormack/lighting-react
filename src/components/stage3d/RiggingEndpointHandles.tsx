// Endpoint handles drag freely in 3D against a camera-facing vertical plane.
// With pitchDeg pinned to 0, yawDeg is the bar's horizontal heading and
// rollDeg is its elevation above the floor — see deriveFromEndpoints for the
// YXZ Euler inverse.
import { useMemo, useState } from 'react'
import { type ThreeEvent, useThree } from '@react-three/fiber'
import { Euler, MathUtils, Vector3 } from 'three'
import type { RiggingDto } from '../../api/riggingApi'
import type { RiggingPositionUpdate } from './Stage3D'
import { toThree, fromThree } from '../../lib/stageCoords'
import { useHandleDrag, verticalPlaneThroughR3F } from './useHandleDrag'
import { DEFAULT_RIGGING_LENGTH_M } from './RiggingMeshes'
import { snap, SNAP_DISTANCE_M } from './useShiftHeld'

type EndpointIndex = 0 | 1

interface RiggingEndpointHandlesProps {
  rig: RiggingDto
  onChange: (next: RiggingPositionUpdate, settled: boolean) => void
  /** When .current is true (Shift held), drag positions snap to the grid. */
  shiftHeldRef?: React.RefObject<boolean>
  onDragStart?: () => void
  onDragEnd?: () => void
}

const HANDLE_SIZE = 0.16

/**
 * The rig's local +X axis spans the bar; endpoints sit at (±L/2, 0, 0). The
 * rig's pitch/yaw/roll YXZ Euler is applied as an R3F mesh rotation (see
 * RiggingMeshes), so applyEuler produces a vector in R3F space — convert it
 * back to lighting space via fromThree before offsetting from the rig's
 * lighting-coord position. Endpoint 0 is the -X end, endpoint 1 is the +X end.
 */
function worldEndpointsFor(rig: RiggingDto): [Vector3, Vector3] {
  const px = rig.positionX ?? 0
  const py = rig.positionY ?? 0
  const pz = rig.positionZ ?? 0
  const length = rig.lengthM ?? DEFAULT_RIGGING_LENGTH_M
  const euler = new Euler(
    MathUtils.degToRad(rig.pitchDeg ?? 0),
    MathUtils.degToRad(rig.yawDeg ?? 0),
    MathUtils.degToRad(rig.rollDeg ?? 0),
    'YXZ',
  )
  const halfR3F = new Vector3(length / 2, 0, 0).applyEuler(euler)
  const half = fromThree(halfR3F)
  return [
    new Vector3(px - half.x, py - half.y, pz - half.z),
    new Vector3(px + half.x, py + half.y, pz + half.z),
  ]
}

/**
 * Inverse of the forward kinematics R_y(yaw)·R_z(roll)·(L/2, 0, 0) with
 * pitch=0, expressed in lighting space (three.js Euler 'YXZ' is intrinsic so
 * the matrix is R_y · R_x · R_z applied to the column vector). Derivation:
 *   dx = L·cos(roll)·cos(yaw)
 *   dy = L·cos(roll)·sin(yaw)
 *   dz = L·sin(roll)
 * giving yaw = atan2(dy, dx) and roll = atan2(dz, hypot(dx, dy)). pitchDeg is
 * forced to 0 — it's a twist along the bar's own axis with no derivable
 * value from endpoint positions alone.
 *
 * Endpoints are passed in canonical (A=index-0, B=index-1) order so the
 * (dx, dy, dz) vector points along the bar's +X (forward) direction.
 */
function deriveFromEndpoints(
  aX: number, aY: number, aZ: number,
  bX: number, bY: number, bZ: number,
): { positionX: number; positionY: number; positionZ: number; yawDeg: number; pitchDeg: number; rollDeg: number; lengthM: number } {
  const dx = bX - aX
  const dy = bY - aY
  const dz = bZ - aZ
  return {
    positionX: (aX + bX) / 2,
    positionY: (aY + bY) / 2,
    positionZ: (aZ + bZ) / 2,
    lengthM: Math.hypot(dx, dy, dz),
    yawDeg: MathUtils.radToDeg(Math.atan2(dy, dx)),
    pitchDeg: 0,
    rollDeg: MathUtils.radToDeg(Math.atan2(dz, Math.hypot(dx, dy))),
  }
}

export function RiggingEndpointHandles({ rig, onChange, shiftHeldRef, onDragStart, onDragEnd }: RiggingEndpointHandlesProps) {
  const startDrag = useHandleDrag()
  const { camera } = useThree()
  const [dragging, setDragging] = useState<EndpointIndex | null>(null)

  const endpoints = useMemo(() => worldEndpointsFor(rig), [rig])
  const r3fEnds = useMemo(
    () => endpoints.map((p) => toThree(p.x, p.y, p.z)),
    [endpoints],
  )

  const onPointerDown = (idx: EndpointIndex, e: ThreeEvent<PointerEvent>) => {
    setDragging(idx)
    onDragStart?.()
    // Capture pinned-endpoint coords at drag-start; the source array re-allocates
    // when the optimistic store update fires mid-drag, but we want stable refs.
    const pinned = endpoints[idx === 0 ? 1 : 0]
    const pinnedX = pinned.x
    const pinnedY = pinned.y
    const pinnedZ = pinned.z
    // Camera-facing vertical plane through the endpoint — gives the user a
    // stable "screen-aligned" plane to drag against, including vertical motion.
    const handleR3F = r3fEnds[idx]
    const plane = verticalPlaneThroughR3F(handleR3F, camera.position)

    const updateFromHit = (p: Vector3, settled: boolean) => {
      const { x, y, z } = fromThree(p)
      const dx = shiftHeldRef?.current ? snap(x, SNAP_DISTANCE_M) : x
      const dy = shiftHeldRef?.current ? snap(y, SNAP_DISTANCE_M) : y
      const dz = shiftHeldRef?.current ? snap(z, SNAP_DISTANCE_M) : z
      // Pass endpoints in canonical (A=index-0, B=index-1) order so yaw/roll
      // reflect the bar's "+X forward" direction consistently.
      const d =
        idx === 0
          ? deriveFromEndpoints(dx, dy, dz, pinnedX, pinnedY, pinnedZ)
          : deriveFromEndpoints(pinnedX, pinnedY, pinnedZ, dx, dy, dz)
      onChange(
        {
          positionX: d.positionX,
          positionY: d.positionY,
          positionZ: d.positionZ,
          yawDeg: d.yawDeg,
          pitchDeg: d.pitchDeg,
          rollDeg: d.rollDeg,
          lengthM: d.lengthM,
        },
        settled,
      )
    }

    startDrag(
      {
        plane,
        handleWorld: handleR3F,
        onDrag: (p) => updateFromHit(p, false),
        onSettle: (lastPoint) => {
          setDragging(null)
          onDragEnd?.()
          if (lastPoint) updateFromHit(lastPoint, true)
        },
      },
      e,
    )
  }

  return (
    <>
      {r3fEnds.map((pos, i) => (
        <mesh
          key={i}
          position={pos}
          onPointerDown={(e) => onPointerDown(i as EndpointIndex, e)}
        >
          <sphereGeometry args={[HANDLE_SIZE, 16, 12]} />
          <meshStandardMaterial
            color={dragging === i ? '#ffe082' : '#c8d3e2'}
            emissive={dragging === i ? '#ffae42' : '#3a4a5a'}
            emissiveIntensity={dragging === i ? 0.6 : 0.3}
          />
        </mesh>
      ))}
    </>
  )
}
