import { Edges } from '@react-three/drei'
import { MathUtils, type Object3D } from 'three'
import type { StageRegionDto } from '../../api/stageRegionApi'
import { toThree } from '../../lib/stageCoords'

interface StageRegionMeshesProps {
  regions: StageRegionDto[]
  selectedUuid?: string | null
  onClick?: (region: StageRegionDto, mesh: Object3D) => void
}

export function StageRegionMeshes({ regions, selectedUuid, onClick }: StageRegionMeshesProps) {
  return (
    <>
      {regions.map((region) => {
        const cx = region.centerX ?? 0
        const cy = region.centerY ?? 0
        const cz = region.centerZ ?? 0
        const w = region.widthM ?? 1
        const d = region.depthM ?? 1
        const h = region.heightM ?? 1
        // toThree swizzles lighting (X, Y, Z) → R3F (X, Z, -Y); region centre
        // is the floor of the box so we lift the box up by half its height.
        const pos = toThree(cx, cy, cz + h / 2)
        const selected = region.uuid === selectedUuid
        return (
          <mesh
            key={region.uuid}
            position={pos}
            rotation={[0, MathUtils.degToRad(region.yawDeg ?? 0), 0]}
            onClick={onClick ? (e) => { e.stopPropagation(); onClick(region, e.eventObject) } : undefined}
          >
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={selected ? '#5a7a98' : '#3a4a5a'} transparent opacity={selected ? 0.32 : 0.18} />
            <Edges color={selected ? '#9fc1d8' : '#7a93a9'} />
          </mesh>
        )
      })}
    </>
  )
}
