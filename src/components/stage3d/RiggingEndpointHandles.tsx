// Rigging endpoint handles drag on a horizontal plane through the dragged
// endpoint's current Z, so free-XY drag preserves the endpoint height.
// Pitched trusses need the numeric pitch/Z fields on the form to change Z.
import { useMemo, useState } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { Euler, MathUtils, Plane, Vector3 } from 'three'
import type { RiggingDto } from '../../api/riggingApi'
import type { RiggingPositionUpdate } from './Stage3D'
import { toThree, fromThree } from '../../lib/stageCoords'
import { useHandleDrag } from './useHandleDrag'
import { DEFAULT_RIGGING_LENGTH_M } from './RiggingMeshes'

type EndpointIndex = 0 | 1

interface RiggingEndpointHandlesProps {
  rig: RiggingDto
  onChange: (next: RiggingPositionUpdate, settled: boolean) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

const PLANE_NORMAL_UP = new Vector3(0, 1, 0)
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
 * Yaw comes from the endpoint delta in the lighting XY plane. Pitch and roll
 * are reset to zero because, with RiggingMeshes' YXZ-applied-to-mesh
 * convention, "pitch" has no effect on a bar lying along local +X and "roll"
 * unexpectedly affects the bar's direction (not its own axis). Forcing both
 * to zero keeps the forward+inverse math exact for the horizontal-drag case
 * and means dragging the endpoint always produces a flat bar — users who want
 * a tilted truss can set pitch/roll explicitly in the form afterwards.
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
    rollDeg: 0,
  }
}

export function RiggingEndpointHandles({ rig, onChange, onDragStart, onDragEnd }: RiggingEndpointHandlesProps) {
  const startDrag = useHandleDrag()
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
    const dragStartZ = endpoints[idx].z
    const plane = new Plane(PLANE_NORMAL_UP, -dragStartZ)

    const updateFromHit = (p: Vector3, settled: boolean) => {
      const { x, y, z } = fromThree(p)
      // Pass endpoints in canonical (A=index-0, B=index-1) order so yaw/pitch
      // reflect the bar's "+X forward" direction consistently.
      const d =
        idx === 0
          ? deriveFromEndpoints(x, y, z, pinnedX, pinnedY, pinnedZ)
          : deriveFromEndpoints(pinnedX, pinnedY, pinnedZ, x, y, z)
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
        handleWorld: r3fEnds[idx],
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
