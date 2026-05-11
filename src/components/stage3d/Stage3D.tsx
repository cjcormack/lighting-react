import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Edges, OrbitControls, Text, TransformControls } from '@react-three/drei'
import { Euler, MathUtils, NoToneMapping, Object3D, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { usePatchListQuery } from '../../store/patches'
import { useRiggingListQuery } from '../../store/riggings'
import { useStageRegionListQuery } from '../../store/stageRegions'
import { useProjectQuery } from '../../store/projects'
import { Bloom } from './Bloom'
import { StageRegionMeshes } from './StageRegionMeshes'
import { RiggingMeshes } from './RiggingMeshes'
import { FixtureModel } from './FixtureModel'
import { RegionCornerHandles } from './RegionCornerHandles'
import { RiggingEndpointHandles } from './RiggingEndpointHandles'
import { useShiftHeld, SNAP_ANGLE_RAD, SNAP_DISTANCE_M } from './useShiftHeld'
import { DEFAULT_VIEW_FLAGS, type StageViewFlags } from './useStageView'
import type { RiggingDto } from '../../api/riggingApi'
import type { FixturePatch } from '../../api/patchApi'
import type { StageRegionDto } from '../../api/stageRegionApi'
import { fromThree } from '../../lib/stageCoords'
import { formatTriple } from '../../lib/utils'
import { useFixtureLookup } from '../../hooks/useFixtureLookup'
import { NO_RAYCAST } from './raycast'

const EMPTY_RIGGINGS: RiggingDto[] = []

export type Selection =
  | { kind: 'patch'; patchKey: string }
  | { kind: 'region'; uuid: string }
  | { kind: 'rigging'; uuid: string }
  | null

export type GizmoMode = 'translate' | 'rotate' | 'points'

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
  widthM?: number | null
  depthM?: number | null
}

export interface RiggingPositionUpdate {
  positionX: number | null
  positionY: number | null
  positionZ: number | null
  yawDeg: number | null
  pitchDeg: number | null
  rollDeg: number | null
  lengthM?: number | null
}

interface Stage3DProps {
  projectId: number
  editMode: boolean
  selection: Selection
  placing?: 'region' | 'rigging' | null
  view?: StageViewFlags
  /** Lighting-Z (up) height of the plane the placement click should land on.
   *  Matches the new object's anchor height so the click projects WYSIWYG. */
  placementZ?: number
  onSelectionChange: (s: Selection) => void
  onPlacementClick?: (worldX: number, worldY: number) => void
  onPatchPlacementChange?: (patch: FixturePatch, next: PatchPlacementUpdate, settled: boolean) => void
  onRegionPositionChange?: (region: StageRegionDto, next: RegionPositionUpdate, settled: boolean) => void
  onRiggingPositionChange?: (rig: RiggingDto, next: RiggingPositionUpdate, settled: boolean) => void
}

export function Stage3D({
  projectId,
  editMode,
  selection,
  placing,
  view = DEFAULT_VIEW_FLAGS,
  placementZ,
  onSelectionChange,
  onPlacementClick,
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
  // Hover/click is disabled during placement so the PlacementPlane catches the
  // click. Otherwise meshes are clickable in both edit and view modes — view
  // mode uses the click for "select to inspect" (info overlay); edit mode also
  // opens the side panel.
  const interactable = !placing

  return (
    <div className={`relative h-full w-full ${placing ? 'cursor-crosshair' : ''}`}>
      <Canvas
        flat
        dpr={[1, 2]}
        gl={{ toneMapping: NoToneMapping, antialias: true }}
        camera={{ position: [0, stageH * 0.7, cameraDistance], fov: 45 }}
        style={{ background: '#0b0e14' }}
      >
        <ambientLight intensity={0.5} />
        <gridHelper args={[gridSize, 20, '#4a5a6a', '#2a3540']} />
        <StageFloor width={stageW} depth={stageD} />
        <StageBoxOutline width={stageW} depth={stageD} height={stageH} />
        <OriginMarkers depth={stageD} />
        {placing && onPlacementClick && (
          <PlacementClickCatcher targetY={placementZ ?? 0} onClick={onPlacementClick} />
        )}
        {view.regions && (
          <StageRegionMeshes
            regions={safeRegions}
            selectedUuid={selection?.kind === 'region' ? selection.uuid : null}
            editMode={interactable}
            showLabel={view.labels}
            onClick={interactable ? handleRegionClick : undefined}
          />
        )}
        {view.riggings && (
          <RiggingMeshes
            riggings={safeRiggings}
            selectedUuid={selection?.kind === 'rigging' ? selection.uuid : null}
            editMode={interactable}
            showLabel={view.labels}
            onClick={interactable ? handleRiggingClick : undefined}
          />
        )}
        {view.fixtures && (patches ?? []).map((patch) => {
          const fixture = fixtureByKey.get(patch.key)
          const fixtureType = fixture ? typeByKey.get(fixture.typeKey) : undefined
          return (
            <FixtureModel
              key={patch.id}
              patch={patch}
              fixture={fixture}
              fixtureType={fixtureType}
              riggings={safeRiggings}
              regions={safeRegions}
              selected={selection?.kind === 'patch' && selection.patchKey === patch.key}
              editMode={interactable}
              showLabel={view.labels}
              showBeamCones={view.beamCones}
              onClick={interactable ? (group) => handleFixtureClick(patch, group) : undefined}
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
      {showRotateToggle && !placing && (
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
            onClick={() => setGizmoMode('points')}
            className={`rounded px-2 py-1 ${gizmoMode === 'points' ? 'bg-accent' : 'hover:bg-muted'}`}
          >
            {selection?.kind === 'region' ? 'Corners' : 'Endpoints'}
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
      {placing && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-background/85 px-3 py-1.5 text-xs shadow-md backdrop-blur">
          Click on the stage to place {placing === 'region' ? 'region' : 'rigging'} · Esc to cancel
        </div>
      )}
      {!editMode && !placing && (
        <SelectionInfo selection={selection} patches={patches} regions={safeRegions} riggings={safeRiggings} />
      )}
    </div>
  )
}

function SelectionInfo({
  selection,
  patches,
  regions,
  riggings,
}: {
  selection: Selection
  patches: FixturePatch[] | undefined
  regions: StageRegionDto[]
  riggings: RiggingDto[]
}) {
  if (!selection) return null
  let label = ''
  let detail = ''
  if (selection.kind === 'patch') {
    const p = patches?.find((x) => x.key === selection.patchKey)
    if (!p) return null
    label = p.displayName
    const ch = p.channelCount ?? 1
    detail = `${[p.manufacturer, p.model].filter(Boolean).join(' ') || 'Fixture'} · ${p.startChannel}–${p.startChannel + ch - 1} on U${p.universe}`
  } else if (selection.kind === 'region') {
    const r = regions.find((x) => x.uuid === selection.uuid)
    if (!r) return null
    label = r.name
    detail = `Region · ${formatTriple(r.widthM, r.depthM, r.heightM, ' × ')} m`
  } else {
    const r = riggings.find((x) => x.uuid === selection.uuid)
    if (!r) return null
    label = r.name
    detail = `${r.kind ?? 'Rigging'} · ${r.lengthM == null ? '—' : r.lengthM.toFixed(1)} m`
  }
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-background/85 px-3 py-1.5 text-xs shadow-md backdrop-blur">
      <span className="font-semibold">{label}</span>
      <span className="ml-2 text-muted-foreground">{detail}</span>
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

  const disableOrbit = useCallback(() => {
    if (orbitRef.current) orbitRef.current.enabled = false
  }, [])
  const enableOrbit = useCallback(() => {
    if (orbitRef.current) orbitRef.current.enabled = true
  }, [])

  const inPointsMode = gizmoMode === 'points'
  const { held: shiftHeld, ref: shiftHeldRef } = useShiftHeld()

  return (
    <>
      <OrbitControls ref={orbitRef} makeDefault enableDamping target={[0, stageH / 4, 0]} />
      {target && !inPointsMode && (
        // TransformControls only supports translate/rotate; points mode is
        // gated above so this narrowing is safe.
        <TransformControls
          ref={tcRef as never}
          object={target}
          mode={gizmoMode as 'translate' | 'rotate'}
          translationSnap={shiftHeld ? SNAP_DISTANCE_M : null}
          rotationSnap={shiftHeld ? SNAP_ANGLE_RAD : null}
          onObjectChange={() => flush(false)}
        />
      )}
      {inPointsMode && selectedRegion && (
        <RegionCornerHandles
          region={selectedRegion}
          shiftHeldRef={shiftHeldRef}
          onChange={(next, settled) => onRegionPositionChange?.(selectedRegion, next, settled)}
          onDragStart={disableOrbit}
          onDragEnd={enableOrbit}
        />
      )}
      {inPointsMode && selectedRigging && (
        <RiggingEndpointHandles
          rig={selectedRigging}
          shiftHeldRef={shiftHeldRef}
          onChange={(next, settled) => onRiggingPositionChange?.(selectedRigging, next, settled)}
          onDragStart={disableOrbit}
          onDragEnd={enableOrbit}
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
    <mesh position={[0, height / 2, -depth / 2]} raycast={NO_RAYCAST}>
      <boxGeometry args={[width, height, depth]} />
      <meshBasicMaterial visible={false} />
      <Edges color="#7a8a9e" />
    </mesh>
  )
}

// Captures any canvas click while placement mode is active. Raycasts from the
// camera against the y=targetY plane so a click anywhere on screen projects
// onto the height the new object will live at — WYSIWYG even for raised
// objects like trusses. Skips clicks that turn into orbit drags.
const PLACEMENT_NORMAL = new Vector3(0, 1, 0)
const DRAG_PX_THRESHOLD = 4

function PlacementClickCatcher({ targetY, onClick }: { targetY: number; onClick: (worldX: number, worldY: number) => void }) {
  const { camera, gl } = useThree()
  useEffect(() => {
    const el = gl.domElement
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const hit = new Vector3()
    // Plane equation n·X + d = 0 with n=(0,1,0) means y + d = 0, so d=-targetY.
    const plane = new Plane(PLACEMENT_NORMAL, -targetY)
    let downX = 0
    let downY = 0
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY }
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return
      if (Math.abs(e.clientX - downX) > DRAG_PX_THRESHOLD || Math.abs(e.clientY - downY) > DRAG_PX_THRESHOLD) return
      const rect = el.getBoundingClientRect()
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(plane, hit)) return
      const { x, y } = fromThree(hit)
      onClick(x, y)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
    }
  }, [camera, gl, onClick, targetY])
  return null
}

// Subtle filled floor across the stage footprint so the stage area reads as
// a solid surface rather than just a grid. Sits just below the grid lines.
function StageFloor({ width, depth }: { width: number; depth: number }) {
  return (
    <mesh
      position={[0, -0.002, -depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={NO_RAYCAST}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial color="#1c2330" transparent opacity={0.55} />
    </mesh>
  )
}

// Lighting → R3F: X right (R3F +X) red, Y upstage (R3F −Z) green, Z up (R3F +Y) blue.
function OriginMarkers({ depth }: { depth: number }) {
  const len = 0.6
  return (
    <group>
      <arrowHelper args={[AXIS_X, ORIGIN, len, 0xd45757, 0.12, 0.08]} />
      <arrowHelper args={[AXIS_UPSTAGE, ORIGIN, len, 0x6cc36c, 0.12, 0.08]} />
      <arrowHelper args={[AXIS_UP, ORIGIN, len, 0x6ba8e8, 0.12, 0.08]} />
      <Text
        position={[0, 0.002, 0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.35}
        color="#a3b6c9"
        anchorX="center"
        anchorY="middle"
        raycast={NO_RAYCAST}
      >
        FOH
      </Text>
      <Text
        position={[0, 0.002, -depth - 0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.28}
        color="#6a7d92"
        anchorX="center"
        anchorY="middle"
        raycast={NO_RAYCAST}
      >
        upstage
      </Text>
    </group>
  )
}

const ORIGIN = new Vector3(0, 0, 0)
const AXIS_X = new Vector3(1, 0, 0)
const AXIS_UPSTAGE = new Vector3(0, 0, -1)
const AXIS_UP = new Vector3(0, 1, 0)
