import { Edges } from '@react-three/drei'
import { MathUtils } from 'three'
import type { StageRegionDto } from '../../api/stageRegionApi'
import { toThree } from '../../lib/stageCoords'

interface StageRegionMeshesProps {
  regions: StageRegionDto[]
}

export function StageRegionMeshes({ regions }: StageRegionMeshesProps) {
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
        return (
          <mesh
            key={region.uuid}
            position={pos}
            rotation={[0, MathUtils.degToRad(region.yawDeg ?? 0), 0]}
          >
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color="#3a4a5a" transparent opacity={0.18} />
            <Edges color="#7a93a9" />
          </mesh>
        )
      })}
    </>
  )
}
