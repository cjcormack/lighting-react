// Region corner handles drag on a horizontal plane through the dragged
// corner's current height: floor corners (indices 0-3) drag on the floor
// plane (z=centerZ), top corners (indices 4-7) drag on z=centerZ+heightM.
// All 8 corners control only the footprint (width/depth/center, yaw preserved);
// height stays on the form field.
import { useMemo, useState } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { MathUtils, Plane, Vector3 } from 'three'
import type { StageRegionDto } from '../../api/stageRegionApi'
import type { RegionPositionUpdate } from './Stage3D'
import { toThree, fromThree } from '../../lib/stageCoords'
import { useHandleDrag } from './useHandleDrag'

interface RegionCornerHandlesProps {
  region: StageRegionDto
  /** Live update during drag; final settled call also fired on pointerup. */
  onChange: (next: RegionPositionUpdate, settled: boolean) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

// Corner index 0-3 around the floor of the rectangle:
//   0 = (-w/2, -d/2)   1 = (+w/2, -d/2)
//   3 = (-w/2, +d/2)   2 = (+w/2, +d/2)
// Indices 4-7 are the corresponding top corners (same XY, z=centerZ+heightM).
// Diagonally-opposite (pinned) corner is at the SAME height as the dragged
// corner: floor↔floor and top↔top.
const PLANE_NORMAL_UP = new Vector3(0, 1, 0)
const HANDLE_SIZE = 0.18

function localCorners(w: number, d: number): Array<[number, number]> {
  return [
    [-w / 2, -d / 2],
    [+w / 2, -d / 2],
    [+w / 2, +d / 2],
    [-w / 2, +d / 2],
  ]
}

function rotateXY(x: number, y: number, yawRad: number): [number, number] {
  const c = Math.cos(yawRad)
  const s = Math.sin(yawRad)
  return [x * c - y * s, x * s + y * c]
}

/**
 * Returns the 8 world corners (lighting coords) of the region box: indices 0-3
 * are the floor corners, 4-7 are the top corners at the same XY.
 */
function worldCornersFor(region: StageRegionDto): Array<[number, number, number]> {
  const cx = region.centerX ?? 0
  const cy = region.centerY ?? 0
  const cz = region.centerZ ?? 0
  const h = region.heightM ?? 1
  const w = region.widthM ?? 1
  const d = region.depthM ?? 1
  const yaw = MathUtils.degToRad(region.yawDeg ?? 0)
  const xys = localCorners(w, d).map(([lx, ly]) => rotateXY(lx, ly, yaw))
  const floor: Array<[number, number, number]> = xys.map(([rx, ry]) => [cx + rx, cy + ry, cz])
  const top: Array<[number, number, number]> = xys.map(([rx, ry]) => [cx + rx, cy + ry, cz + h])
  return [...floor, ...top]
}

function pinnedIndexFor(idx: number): number {
  // Pinned corner is diagonally opposite at the same height level.
  const base = idx < 4 ? 0 : 4
  return base + ((idx - base + 2) % 4)
}

/**
 * Derives new region pose from the dragged corner and the pinned (diagonally
 * opposite) corner. Yaw is preserved — width/depth are absolute projections
 * of the diagonal vector onto the local yawed axes.
 */
function deriveFromDraggedCorner(
  draggedX: number,
  draggedY: number,
  pinnedX: number,
  pinnedY: number,
  yawDeg: number,
): { centerX: number; centerY: number; widthM: number; depthM: number } {
  const cx = (draggedX + pinnedX) / 2
  const cy = (draggedY + pinnedY) / 2
  const dx = draggedX - pinnedX
  const dy = draggedY - pinnedY
  const yaw = MathUtils.degToRad(yawDeg)
  const widthM = Math.abs(dx * Math.cos(yaw) + dy * Math.sin(yaw))
  const depthM = Math.abs(-dx * Math.sin(yaw) + dy * Math.cos(yaw))
  return { centerX: cx, centerY: cy, widthM, depthM }
}

export function RegionCornerHandles({ region, onChange, onDragStart, onDragEnd }: RegionCornerHandlesProps) {
  const startDrag = useHandleDrag()
  const [dragging, setDragging] = useState<number | null>(null)

  const worldCorners = useMemo(() => worldCornersFor(region), [region])
  const r3fCorners = useMemo(
    () => worldCorners.map(([x, y, z]) => toThree(x, y, z)),
    [worldCorners],
  )

  const onPointerDown = (idx: number, e: ThreeEvent<PointerEvent>) => {
    setDragging(idx)
    onDragStart?.()
    const pinnedIdx = pinnedIndexFor(idx)
    const pinnedX = worldCorners[pinnedIdx][0]
    const pinnedY = worldCorners[pinnedIdx][1]
    const yawDeg = region.yawDeg ?? 0
    const cz = region.centerZ ?? 0
    // Drag plane matches the handle's z (floor corners on floor plane, top
    // corners on the top-of-box plane) so drag stays at the same height.
    const dragPlaneZ = worldCorners[idx][2]
    const plane = new Plane(PLANE_NORMAL_UP, -dragPlaneZ)

    const updateFromHit = (p: Vector3, settled: boolean) => {
      const { x, y } = fromThree(p)
      const d = deriveFromDraggedCorner(x, y, pinnedX, pinnedY, yawDeg)
      onChange(
        {
          centerX: d.centerX,
          centerY: d.centerY,
          centerZ: cz,
          yawDeg,
          widthM: d.widthM,
          depthM: d.depthM,
        },
        settled,
      )
    }

    startDrag(
      {
        plane,
        handleWorld: r3fCorners[idx],
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
      {r3fCorners.map((pos, i) => (
        <mesh
          key={i}
          position={pos}
          onPointerDown={(e) => onPointerDown(i, e)}
        >
          <sphereGeometry args={[HANDLE_SIZE, 16, 12]} />
          <meshStandardMaterial
            color={dragging === i ? '#ffe082' : '#9fc1d8'}
            emissive={dragging === i ? '#ffae42' : '#3a4a5a'}
            emissiveIntensity={dragging === i ? 0.6 : 0.3}
          />
        </mesh>
      ))}
    </>
  )
}
