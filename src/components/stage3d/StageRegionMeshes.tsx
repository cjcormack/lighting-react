import { useMemo, useState } from 'react'
import { Edges, useCursor } from '@react-three/drei'
import { Color, MathUtils, type Object3D } from 'three'
import type { StageRegionDto } from '../../api/stageRegionApi'
import { toThree } from '../../lib/stageCoords'
import { StageLabel } from './StageLabel'

interface StageRegionMeshesProps {
  regions: StageRegionDto[]
  selectedUuid?: string | null
  editMode?: boolean
  showLabel?: boolean
  onClick?: (region: StageRegionDto, mesh: Object3D) => void
}

export function StageRegionMeshes({ regions, selectedUuid, editMode, showLabel, onClick }: StageRegionMeshesProps) {
  return (
    <>
      {regions.map((region) => (
        <RegionMesh
          key={region.uuid}
          region={region}
          selected={region.uuid === selectedUuid}
          editMode={editMode}
          showLabel={showLabel}
          onClick={onClick}
        />
      ))}
    </>
  )
}

interface RegionMeshProps {
  region: StageRegionDto
  selected: boolean
  editMode?: boolean
  showLabel?: boolean
  onClick?: (region: StageRegionDto, mesh: Object3D) => void
}

// Base slate-blue rotated ±20° in hue by a stable hash of the uuid so multiple
// regions are visually distinguishable without straying from the muted palette.
const BASE_REGION_HSL = { h: 210 / 360, s: 0.22, l: 0.29 }
const BASE_EDGE_HSL = { h: 205 / 360, s: 0.30, l: 0.65 }
const BASE_REGION_HSL_SELECTED = { h: 210 / 360, s: 0.30, l: 0.45 }
const BASE_EDGE_HSL_SELECTED = { h: 205 / 360, s: 0.40, l: 0.78 }

const TMP_COLOR = new Color()

function hueShiftForUuid(uuid: string): number {
  let h = 0
  for (let i = 0; i < uuid.length; i++) h = (h * 31 + uuid.charCodeAt(i)) | 0
  // Range: roughly ±0.055 of hue space (~ ±20°)
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.11
}

function colorWithHueShift(base: { h: number; s: number; l: number }, shift: number): string {
  TMP_COLOR.setHSL((base.h + shift + 1) % 1, base.s, base.l)
  return `#${TMP_COLOR.getHexString()}`
}

function RegionMesh({ region, selected, editMode, showLabel, onClick }: RegionMeshProps) {
  const [hovered, setHovered] = useState(false)
  useCursor(!!editMode && hovered)

  const cx = region.centerX ?? 0
  const cy = region.centerY ?? 0
  const cz = region.centerZ ?? 0
  const w = region.widthM ?? 1
  const d = region.depthM ?? 1
  const h = region.heightM ?? 1

  // toThree swizzles lighting (X, Y, Z) → R3F (X, Z, -Y); region centre
  // is the floor of the box so we lift the box up by half its height.
  const pos = toThree(cx, cy, cz + h / 2)

  const shift = useMemo(() => hueShiftForUuid(region.uuid), [region.uuid])
  const active = selected || (!!editMode && hovered)
  const fillColor = active
    ? colorWithHueShift(BASE_REGION_HSL_SELECTED, shift)
    : colorWithHueShift(BASE_REGION_HSL, shift)
  const edgeColor = active
    ? colorWithHueShift(BASE_EDGE_HSL_SELECTED, shift)
    : colorWithHueShift(BASE_EDGE_HSL, shift)

  return (
    <mesh
      position={pos}
      rotation={[0, MathUtils.degToRad(region.yawDeg ?? 0), 0]}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(region, e.eventObject) } : undefined}
      onPointerOver={editMode ? (e) => { e.stopPropagation(); setHovered(true) } : undefined}
      onPointerOut={editMode ? () => setHovered(false) : undefined}
    >
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={fillColor} transparent opacity={active ? 0.38 : 0.28} />
      <Edges color={edgeColor} />
      {showLabel && (
        <StageLabel position={[0, h / 2 + 0.05, 0]}>{region.name}</StageLabel>
      )}
    </mesh>
  )
}
