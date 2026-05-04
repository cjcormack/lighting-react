import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Edges, OrbitControls, TransformControls } from '@react-three/drei'
import { Euler, MathUtils, NoToneMapping, Object3D, Vector3 } from 'three'
import { usePatchListQuery } from '../../store/patches'
import { useRiggingListQuery } from '../../store/riggings'
import { useStageRegionListQuery } from '../../store/stageRegions'
import { useProjectQuery } from '../../store/projects'
import { Bloom } from './Bloom'
import { StageRegionMeshes } from './StageRegionMeshes'
import { RiggingMeshes } from './RiggingMeshes'
import { FixtureModel } from './FixtureModel'
import type { RiggingDto } from '../../api/riggingApi'
import type { FixturePatch } from '../../api/patchApi'
import type { StageRegionDto } from '../../api/stageRegionApi'
import { fromThree } from '../../lib/stageCoords'
import { useFixtureLookup } from '../../hooks/useFixtureLookup'

const EMPTY_RIGGINGS: RiggingDto[] = []

export type Selection =
  | { kind: 'patch'; patchKey: string }
  | { kind: 'region'; uuid: string }
  | { kind: 'rigging'; uuid: string }
  | null

export type GizmoMode = 'translate' | 'rotate'

export interface PatchPlacementUpdate {
  riggingUuid: string | null
  stageX: number | null
  stageY: number | null
  stageZ: number | null
}

export interface RegionPositionUpdate {
  centerX: number | null
  centerY: number | null
  centerZ: number | null
  yawDeg: number | null
}

export interface RiggingPositionUpdate {
  positionX: number | null
  positionY: number | null
  positionZ: number | null
  yawDeg: number | null
  pitchDeg: number | null
  rollDeg: number | null
}

interface Stage3DProps {
  projectId: number
  editMode: boolean
  selection: Selection
  onSelectionChange: (s: Selection) => void
  onPatchPlacementChange?: (patch: FixturePatch, next: PatchPlacementUpdate, settled: boolean) => void
  onRegionPositionChange?: (region: StageRegionDto, next: RegionPositionUpdate, settled: boolean) => void
  onRiggingPositionChange?: (rig: RiggingDto, next: RiggingPositionUpdate, settled: boolean) => void
}

export function Stage3D({
  projectId,
  editMode,
  selection,
  onSelectionChange,
  onPatchPlacementChange,
  onRegionPositionChange,
  onRiggingPositionChange,
}: Stage3DProps) {
  const { data: project } = useProjectQuery(projectId)
  const { data: regions } = useStageRegionListQuery(projectId)
  const { data: riggings } = useRiggingListQuery(projectId)
  const { data: patches } = usePatchListQuery(projectId)
  const { fixtureByKey, typeByKey } = useFixtureLookup()

  const stageW = project?.stageWidthM ?? 10
  const stageD = project?.stageDepthM ?? 8
  const stageH = project?.stageHeightM ?? 6

  const cameraDistance = Math.max(stageW, stageD) * 1.4
  const gridSize = Math.max(stageW, stageD) * 1.6
  const safeRiggings = riggings ?? EMPTY_RIGGINGS
  const safeRegions = regions ?? []

  const [target, setTarget] = useState<Object3D | null>(null)
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate')

  const handleRegionClick = useCallback(
    (region: StageRegionDto, mesh: Object3D) => {
      onSelectionChange({ kind: 'region', uuid: region.uuid })
      if (editMode) setTarget(mesh)
    },
    [editMode, onSelectionChange],
  )
  const handleRiggingClick = useCallback(
    (rig: RiggingDto, mesh: Object3D) => {
      onSelectionChange({ kind: 'rigging', uuid: rig.uuid })
      if (editMode) setTarget(mesh)
    },
    [editMode, onSelectionChange],
  )
  const handleFixtureClick = useCallback(
    (patch: FixturePatch, group: Object3D) => {
      onSelectionChange({ kind: 'patch', patchKey: patch.key })
      if (editMode) setTarget(group)
    },
    [editMode, onSelectionChange],
  )

  // Drop the gizmo target whenever edit mode turns off or selection clears.
  useEffect(() => {
    if (!editMode || !selection) setTarget(null)
  }, [editMode, selection])

  // Patches never rotate via gizmo — base orientation uses numeric fields. Derived
  // rather than stateful so the user's intended mode survives re-selection.
  const effectiveGizmoMode: GizmoMode = selection?.kind === 'patch' ? 'translate' : gizmoMode
  const showRotateToggle = editMode && (selection?.kind === 'region' || selection?.kind === 'rigging')

  return (
    <div className="relative h-full w-full">
      <Canvas
        flat
        dpr={[1, 2]}
        gl={{ toneMapping: NoToneMapping, antialias: true }}
        camera={{ position: [0, stageH * 0.7, cameraDistance], fov: 45 }}
        style={{ background: '#0b0e14' }}
      >
        <ambientLight intensity={0.35} />
        <gridHelper args={[gridSize, 20, '#3a3a3a', '#1f1f1f']} />
        <StageBoxOutline width={stageW} depth={stageD} height={stageH} />
        <StageRegionMeshes
          regions={safeRegions}
          selectedUuid={selection?.kind === 'region' ? selection.uuid : null}
          onClick={editMode ? handleRegionClick : undefined}
        />
        <RiggingMeshes
          riggings={safeRiggings}
          selectedUuid={selection?.kind === 'rigging' ? selection.uuid : null}
          onClick={editMode ? handleRiggingClick : undefined}
        />
        {(patches ?? []).map((patch) => {
          const fixture = fixtureByKey.get(patch.key)
          const fixtureType = fixture ? typeByKey.get(fixture.typeKey) : undefined
          return (
            <FixtureModel
              key={patch.id}
              patch={patch}
              fixture={fixture}
              fixtureType={fixtureType}
              riggings={safeRiggings}
              selected={selection?.kind === 'patch' && selection.patchKey === patch.key}
              onClick={(group) => handleFixtureClick(patch, group)}
            />
          )
        })}
        <Controls
          target={editMode ? target : null}
          gizmoMode={effectiveGizmoMode}
          selection={selection}
          patches={patches ?? null}
          regions={safeRegions}
          riggings={safeRiggings}
          stageH={stageH}
          onPatchPlacementChange={onPatchPlacementChange}
          onRegionPositionChange={onRegionPositionChange}
          onRiggingPositionChange={onRiggingPositionChange}
        />
        <Bloom />
      </Canvas>
      {showRotateToggle && (
        <div className="pointer-events-auto absolute right-3 top-3 flex gap-1 rounded-md bg-background/85 p-1 text-xs shadow-md backdrop-blur">
          <button
            type="button"
            onClick={() => setGizmoMode('translate')}
            className={`rounded px-2 py-1 ${gizmoMode === 'translate' ? 'bg-accent' : 'hover:bg-muted'}`}
          >
            Move
          </button>
          <button
            type="button"
            onClick={() => setGizmoMode('rotate')}
            className={`rounded px-2 py-1 ${gizmoMode === 'rotate' ? 'bg-accent' : 'hover:bg-muted'}`}
          >
            Rotate
          </button>
        </div>
      )}
    </div>
  )
}

interface ControlsProps {
  target: Object3D | null
  gizmoMode: GizmoMode
  selection: Selection
  patches: FixturePatch[] | null
  regions: StageRegionDto[]
  riggings: RiggingDto[]
  stageH: number
  onPatchPlacementChange?: (patch: FixturePatch, next: PatchPlacementUpdate, settled: boolean) => void
  onRegionPositionChange?: (region: StageRegionDto, next: RegionPositionUpdate, settled: boolean) => void
  onRiggingPositionChange?: (rig: RiggingDto, next: RiggingPositionUpdate, settled: boolean) => void
}

// OrbitControls + TransformControls live inside <Canvas> so they have access
// to the R3F renderer/event system. drei's TransformControls auto-disables
// OrbitControls during drag via its `makeDefault` hookup, but we ALSO listen
// to dragging-changed to fire a single PUT on release.
function Controls({
  target,
  gizmoMode,
  selection,
  patches,
  regions,
  riggings,
  stageH,
  onPatchPlacementChange,
  onRegionPositionChange,
  onRiggingPositionChange,
}: ControlsProps) {
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null!)
  const tcRef = useRef<React.ComponentRef<typeof TransformControls>>(null!)

  const selectedPatch = useMemo(
    () => (selection?.kind === 'patch' ? patches?.find((p) => p.key === selection.patchKey) ?? null : null),
    [selection, patches],
  )
  const selectedRegion = useMemo(
    () => (selection?.kind === 'region' ? regions.find((r) => r.uuid === selection.uuid) ?? null : null),
    [selection, regions],
  )
  const selectedRigging = useMemo(
    () => (selection?.kind === 'rigging' ? riggings.find((r) => r.uuid === selection.uuid) ?? null : null),
    [selection, riggings],
  )
  const riggingByUuid = useMemo(() => {
    const map = new Map<string, RiggingDto>()
    riggings.forEach((r) => map.set(r.uuid, r))
    return map
  }, [riggings])

  const flush = useCallback(
    (settled: boolean) => {
      if (!target) return
      target.updateMatrixWorld(true)
      target.getWorldPosition(SCRATCH_VEC1)
      if (selectedPatch) {
        const next = patchPlacementFromWorld(selectedPatch, SCRATCH_VEC1, riggingByUuid)
        onPatchPlacementChange?.(selectedPatch, next, settled)
      } else if (selectedRegion) {
        // Region mesh is rendered at centerZ + height/2 (geometric centre);
        // back the lift out so we persist the floor anchor.
        const halfH = (selectedRegion.heightM ?? 1) / 2
        const next: RegionPositionUpdate = {
          centerX: SCRATCH_VEC1.x,
          centerY: -SCRATCH_VEC1.z,
          centerZ: SCRATCH_VEC1.y - halfH,
          yawDeg: gizmoMode === 'rotate' ? MathUtils.radToDeg(target.rotation.y) : selectedRegion.yawDeg,
        }
        onRegionPositionChange?.(selectedRegion, next, settled)
      } else if (selectedRigging) {
        const next: RiggingPositionUpdate = {
          positionX: SCRATCH_VEC1.x,
          positionY: -SCRATCH_VEC1.z,
          positionZ: SCRATCH_VEC1.y,
          yawDeg: gizmoMode === 'rotate' ? MathUtils.radToDeg(target.rotation.y) : selectedRigging.yawDeg,
          pitchDeg: gizmoMode === 'rotate' ? MathUtils.radToDeg(target.rotation.x) : selectedRigging.pitchDeg,
          rollDeg: gizmoMode === 'rotate' ? MathUtils.radToDeg(target.rotation.z) : selectedRigging.rollDeg,
        }
        onRiggingPositionChange?.(selectedRigging, next, settled)
      }
    },
    [target, selectedPatch, selectedRegion, selectedRigging, riggingByUuid, gizmoMode, onPatchPlacementChange, onRegionPositionChange, onRiggingPositionChange],
  )

  // OrbitControls and TransformControls fight for pointer events; we listen to
  // TC's underlying THREE 'dragging-changed' event to disable Orbit during drag
  // and fire a single settled flush on release.
  useEffect(() => {
    if (!target) return
    const tc = tcRef.current as unknown as { addEventListener: (t: string, l: (e: { value: boolean }) => void) => void; removeEventListener: (t: string, l: (e: { value: boolean }) => void) => void } | null
    if (!tc) return
    const onDrag = (e: { value: boolean }) => {
      if (orbitRef.current) orbitRef.current.enabled = !e.value
      if (!e.value) flush(true)
    }
    tc.addEventListener('dragging-changed', onDrag)
    return () => tc.removeEventListener('dragging-changed', onDrag)
  }, [target, flush])

  return (
    <>
      <OrbitControls ref={orbitRef} makeDefault enableDamping target={[0, stageH / 4, 0]} />
      {target && (
        <TransformControls
          ref={tcRef as never}
          object={target}
          mode={gizmoMode}
          onObjectChange={() => flush(false)}
        />
      )}
    </>
  )
}

// — math helpers ———————————————————————————————————————————————————

const SCRATCH_VEC1 = new Vector3()
const SCRATCH_VEC2 = new Vector3()
const SCRATCH_OBJ = new Object3D()
const SCRATCH_EULER = new Euler()

function patchPlacementFromWorld(
  patch: FixturePatch,
  worldR3F: Vector3,
  riggingByUuid: Map<string, RiggingDto>,
): PatchPlacementUpdate {
  if (!patch.riggingUuid) {
    const l = fromThree(worldR3F)
    return { riggingUuid: null, stageX: l.x, stageY: l.y, stageZ: l.z }
  }

  const rig = riggingByUuid.get(patch.riggingUuid)
  if (!rig) {
    return {
      riggingUuid: patch.riggingUuid,
      stageX: patch.stageX,
      stageY: patch.stageY,
      stageZ: patch.stageZ,
    }
  }

  // Project the dragged world point into the rigging's local frame; constrain
  // to the rig's local X axis (stageY=0, stageZ=0) so a free-XYZ gizmo still
  // produces an on-bar position. Rig frame is rotated by yaw/pitch/roll around
  // its origin per the Y/X/Z Euler order used in RiggingMeshes.
  SCRATCH_OBJ.position.set(rig.positionX ?? 0, rig.positionZ ?? 0, -(rig.positionY ?? 0))
  SCRATCH_EULER.set(
    MathUtils.degToRad(rig.pitchDeg ?? 0),
    MathUtils.degToRad(rig.yawDeg ?? 0),
    MathUtils.degToRad(rig.rollDeg ?? 0),
    'YXZ',
  )
  SCRATCH_OBJ.rotation.copy(SCRATCH_EULER)
  SCRATCH_OBJ.updateMatrixWorld(true)
  const rigLocal = SCRATCH_OBJ.worldToLocal(SCRATCH_VEC2.copy(worldR3F))
  return {
    riggingUuid: patch.riggingUuid,
    stageX: rigLocal.x,
    stageY: 0,
    stageZ: 0,
  }
}

// Wireframe box marking the stage boundary. Stage occupies lighting
// (X∈[-w/2,w/2], Y∈[0,d], Z∈[0,h]) → R3F (x∈[-w/2,w/2], y∈[0,h], z∈[-d,0]);
// box centre is therefore (0, h/2, -d/2).
function StageBoxOutline({
  width,
  depth,
  height,
}: {
  width: number
  depth: number
  height: number
}) {
  return (
    <mesh position={[0, height / 2, -depth / 2]}>
      <boxGeometry args={[width, height, depth]} />
      <meshBasicMaterial visible={false} />
      <Edges color="#5a6a7a" />
    </mesh>
  )
}
