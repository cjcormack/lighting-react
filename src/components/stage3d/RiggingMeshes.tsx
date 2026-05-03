import { MathUtils } from 'three'
import type { RiggingDto } from '../../api/riggingApi'
import { toThree } from '../../lib/stageCoords'

interface RiggingMeshesProps {
  riggings: RiggingDto[]
}

// Each rigging renders as a 3 m bar (no length field on the DTO yet — Session
// 7 polish). Yaw/pitch/roll come from the DTO; rotation order 'YXZ' matches
// the convention used by panTiltToDir in stageCoords.
export function RiggingMeshes({ riggings }: RiggingMeshesProps) {
  return (
    <>
      {riggings.map((rig) => {
        const pos = toThree(rig.positionX ?? 0, rig.positionY ?? 0, rig.positionZ ?? 0)
        return (
          <mesh
            key={rig.uuid}
            position={pos}
            rotation={[
              MathUtils.degToRad(rig.pitchDeg ?? 0),
              MathUtils.degToRad(rig.yawDeg ?? 0),
              MathUtils.degToRad(rig.rollDeg ?? 0),
              'YXZ',
            ]}
          >
            <boxGeometry args={[3.0, 0.18, 0.18]} />
            <meshStandardMaterial color="#444" metalness={0.4} roughness={0.6} />
          </mesh>
        )
      })}
    </>
  )
}
