import { useState } from 'react'
import { useCursor } from '@react-three/drei'
import { MathUtils, type Object3D } from 'three'
import type { RiggingDto } from '../../api/riggingApi'
import { toThree } from '../../lib/stageCoords'
import { StageLabel } from './StageLabel'

interface RiggingMeshesProps {
  riggings: RiggingDto[]
  selectedUuid?: string | null
  editMode?: boolean
  onClick?: (rig: RiggingDto, mesh: Object3D) => void
}

// Each rigging renders as a bar along its local X axis. lengthM defaults to 3 m
// for un-set DTOs. Yaw/pitch/roll come from the DTO; rotation order 'YXZ' matches
// the convention used by panTiltToDir in stageCoords.
const DEFAULT_RIGGING_LENGTH_M = 3
const RIGGING_THICKNESS_M = 0.18

export function RiggingMeshes({ riggings, selectedUuid, editMode, onClick }: RiggingMeshesProps) {
  return (
    <>
      {riggings.map((rig) => (
        <RiggingMesh
          key={rig.uuid}
          rig={rig}
          selected={rig.uuid === selectedUuid}
          editMode={editMode}
          onClick={onClick}
        />
      ))}
    </>
  )
}

interface RiggingMeshProps {
  rig: RiggingDto
  selected: boolean
  editMode?: boolean
  onClick?: (rig: RiggingDto, mesh: Object3D) => void
}

function RiggingMesh({ rig, selected, editMode, onClick }: RiggingMeshProps) {
  const [hovered, setHovered] = useState(false)
  useCursor(!!editMode && hovered)

  const pos = toThree(rig.positionX ?? 0, rig.positionY ?? 0, rig.positionZ ?? 0)
  const length = rig.lengthM ?? DEFAULT_RIGGING_LENGTH_M
  const active = selected || (!!editMode && hovered)

  return (
    <mesh
      position={pos}
      rotation={[
        MathUtils.degToRad(rig.pitchDeg ?? 0),
        MathUtils.degToRad(rig.yawDeg ?? 0),
        MathUtils.degToRad(rig.rollDeg ?? 0),
        'YXZ',
      ]}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(rig, e.eventObject) } : undefined}
      onPointerOver={editMode ? (e) => { e.stopPropagation(); setHovered(true) } : undefined}
      onPointerOut={editMode ? () => setHovered(false) : undefined}
    >
      <boxGeometry args={[length, RIGGING_THICKNESS_M, RIGGING_THICKNESS_M]} />
      <meshStandardMaterial
        color={active ? '#c8d3e2' : '#9aa5b4'}
        metalness={0.4}
        roughness={0.55}
        emissive={selected ? '#3a4a5a' : '#000'}
        emissiveIntensity={selected ? 0.4 : 0}
      />
      {editMode && (
        <StageLabel position={[0, RIGGING_THICKNESS_M / 2 + 0.05, 0]}>
          {rig.name}
        </StageLabel>
      )}
    </mesh>
  )
}
