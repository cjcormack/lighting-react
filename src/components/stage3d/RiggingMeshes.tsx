import { MathUtils, type Object3D } from 'three'
import type { RiggingDto } from '../../api/riggingApi'
import { toThree } from '../../lib/stageCoords'

interface RiggingMeshesProps {
  riggings: RiggingDto[]
  selectedUuid?: string | null
  onClick?: (rig: RiggingDto, mesh: Object3D) => void
}

// Each rigging renders as a 3 m bar (no length field on the DTO yet — Session
// 7 polish). Yaw/pitch/roll come from the DTO; rotation order 'YXZ' matches
// the convention used by panTiltToDir in stageCoords.
export function RiggingMeshes({ riggings, selectedUuid, onClick }: RiggingMeshesProps) {
  return (
    <>
      {riggings.map((rig) => {
        const pos = toThree(rig.positionX ?? 0, rig.positionY ?? 0, rig.positionZ ?? 0)
        const selected = rig.uuid === selectedUuid
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
            onClick={onClick ? (e) => { e.stopPropagation(); onClick(rig, e.eventObject) } : undefined}
          >
            <boxGeometry args={[3.0, 0.18, 0.18]} />
            <meshStandardMaterial
              color={selected ? '#7a8aa0' : '#444'}
              metalness={0.4}
              roughness={0.6}
              emissive={selected ? '#3a4a5a' : '#000'}
              emissiveIntensity={selected ? 0.4 : 0}
            />
          </mesh>
        )
      })}
    </>
  )
}
