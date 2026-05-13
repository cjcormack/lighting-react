import { useEffect, useMemo, useRef, useState } from 'react'
import { useCursor } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { StageLabel } from './StageLabel'
import {
  Color,
  Euler,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three'
import type { FixturePatch } from '../../api/patchApi'
import type { RiggingDto } from '../../api/riggingApi'
import {
  findColourSource,
  findDimmerProperty,
  type ColourPropertyDescriptor,
  type Fixture,
  type FixtureTypeInfo,
  type SettingPropertyDescriptor,
  type SliderPropertyDescriptor,
  findPanProperty,
  findTiltProperty,
  findPanFineProperty,
  findTiltFineProperty,
  resolveFixtureKind,
} from '../../store/fixtures'
import {
  useColourValue,
  useSettingColourPreview,
  useSliderValue,
} from '../../hooks/usePropertyValues'
import { makeFallbackSlider, useNormalizedIntensity } from '../../hooks/useNormalizedIntensity'
import { findGel } from '../../data/gels'
import {
  dmxToDegrees,
  headQuaternionFor,
  panTiltToDir,
  worldPositionFor,
} from '../../lib/stageCoords'
import { BEAM_LENGTH, useEmitters, type EmittersHandle, type RegionGeometry } from './StageEmitters'
import { FixtureBody } from './fixtureBodies'

const DEFAULT_BEAM_DEG = 30
const COLOR_TMP = new Color()
const UNIT_Y = new Vector3(0, 1, 0)
const SCRATCH_DIR = new Vector3()
const SCRATCH_NEG_DIR = new Vector3()
const SCRATCH_ORIGIN = new Vector3()
const SCRATCH_QUAT = new Quaternion()
const SCRATCH_QUAT_EULER = new Euler()
const SCRATCH_CONE_POS = new Vector3()
const SCRATCH_CONE_SCALE = new Vector3()
const SCRATCH_CONE_MAT = new Matrix4()

// Slack on the cone half-angle so cookies fade in before the shader's
// cosAngle test would clip them — masks the boundary even on a wide spot
// at the edge of its reach.
const REGION_CULL_SLACK_RAD = MathUtils.degToRad(3)

// ~1% intensity, below one DMX step at the pool's 0.55x opacity scale.
const LIGHT_OFF_OPACITY = 0.005

interface FixtureModelProps {
  patch: FixturePatch
  fixture: Fixture | undefined
  fixtureType: FixtureTypeInfo | undefined
  riggings: RiggingDto[]
  regionGeometry: ReadonlyArray<RegionGeometry>
  slot: number
  selected: boolean
  editMode?: boolean
  showLabel?: boolean
  onClick?: (group: Group) => void
  /** Called when this fixture becomes the edit-mode selection target, so the
   *  parent can bind TransformControls to its group. Lets picker-based and
   *  click-based selection share the same gizmo wiring. */
  onEditFocus?: (group: Group) => void
}

export function FixtureModel({
  patch,
  fixture,
  fixtureType,
  riggings,
  regionGeometry,
  slot,
  selected,
  editMode,
  showLabel,
  onClick,
  onEditFocus,
}: FixtureModelProps) {
  const [hovered, setHovered] = useState(false)
  useCursor(!!editMode && hovered)
  const active = selected || (!!editMode && hovered)
  const emitters = useEmitters()

  const colourSource = useMemo(
    () => (fixture?.properties ? findColourSource(fixture.properties) : undefined),
    [fixture?.properties],
  )
  const dimmerProp = useMemo(
    () => findDimmerProperty(fixture?.properties),
    [fixture?.properties],
  )
  const panProp = useMemo(() => findPanProperty(fixture?.properties), [fixture?.properties])
  const tiltProp = useMemo(() => findTiltProperty(fixture?.properties), [fixture?.properties])
  const panFineProp = useMemo(() => findPanFineProperty(fixture?.properties), [fixture?.properties])
  const tiltFineProp = useMemo(() => findTiltFineProperty(fixture?.properties), [fixture?.properties])
  const gel =
    !colourSource && fixtureType?.acceptsGel && patch.gelCode ? findGel(patch.gelCode) : null

  const fixturePos = useMemo(() => {
    const v = worldPositionFor(patch, riggings)
    return [v.x, v.y, v.z] as const
  }, [
    patch.stageX,
    patch.stageY,
    patch.stageZ,
    patch.riggingUuid,
    riggings,
  ])

  const beamDeg = patch.beamAngleDeg ?? DEFAULT_BEAM_DEG
  const beamRadius = BEAM_LENGTH * Math.tan(MathUtils.degToRad(beamDeg / 2))
  const showCone = !!fixtureType?.acceptsBeamAngle && !!emitters

  const groupRef = useRef<Group>(null)
  const headRef = useRef<Group>(null)
  const lensRef = useRef<Mesh>(null)

  useEffect(() => {
    if (selected && editMode && onEditFocus && groupRef.current) {
      onEditFocus(groupRef.current)
    }
  }, [selected, editMode, onEditFocus])

  const halfBeamRad = MathUtils.degToRad(beamDeg / 2)
  const coneHalfAngleRad = halfBeamRad + REGION_CULL_SLACK_RAD
  const cullTrig = useMemo(
    () => ({ cosCone: Math.cos(coneHalfAngleRad), sinCone: Math.sin(coneHalfAngleRad) }),
    [coneHalfAngleRad],
  )

  // Shared per-fixture color state. ColourSync writes here (React-rate);
  // useBeamDirector reads here (per-frame) and pushes to the emitter slot.
  const colorStateRef = useRef<ColorState>({
    color: new Color('#fff8d5'),
    coneOpacity: 0,
    poolOpacity: 0,
  })

  // Slot zeroing — emitter slots persist across renders. If a fixture loses
  // its beam (or showCone otherwise turns off), the per-frame writes stop;
  // hide the slot once so its last frame doesn't ghost on screen.
  useEffect(() => {
    if (!emitters || showCone) return
    emitters.hideSlot(slot)
  }, [emitters, showCone, slot])

  // Unmount cleanup — same reason. A slot belongs to whichever FixtureModel
  // owns it; vacate before re-allocation can give it to a different fixture.
  useEffect(() => {
    return () => {
      if (emitters) emitters.hideSlot(slot)
    }
  }, [emitters, slot])

  useBeamDirector({
    panProp,
    tiltProp,
    panFineProp,
    tiltFineProp,
    baseYawDeg: patch.baseYawDeg ?? 0,
    basePitchDeg: patch.basePitchDeg ?? 0,
    beamRadius,
    cullCosCone: cullTrig.cosCone,
    cullSinCone: cullTrig.sinCone,
    floorCookieSide: 2 * BEAM_LENGTH * cullTrig.sinCone,
    cosHalfBeam: Math.cos(halfBeamRad),
    groupRef,
    headRef,
    slot,
    emitters: showCone ? emitters : null,
    regionGeometry,
    colorStateRef,
  })

  return (
    <group
      ref={groupRef}
      position={fixturePos}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(e.eventObject as Group) } : undefined}
      onPointerOver={editMode ? (e) => { e.stopPropagation(); setHovered(true) } : undefined}
      onPointerOut={editMode ? () => setHovered(false) : undefined}
    >
      <FixtureBody
        kind={resolveFixtureKind(patch.kindOverride, fixtureType?.kind)}
        active={active}
        headRef={headRef}
        lensRef={lensRef}
      />

      {active && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.1, 0.012, 12, 32]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}

      {showLabel && <StageLabel position={[0, 0.18, 0]}>{patch.displayName}</StageLabel>}

      <ColourSync
        colourSource={colourSource}
        gel={gel}
        dimmerProp={dimmerProp}
        lensRef={lensRef}
        colorStateRef={colorStateRef}
      />
    </group>
  )
}

interface ColorState {
  color: Color
  coneOpacity: number
  poolOpacity: number
}

interface BeamDirectorOpts {
  panProp: SliderPropertyDescriptor | undefined
  tiltProp: SliderPropertyDescriptor | undefined
  panFineProp: SliderPropertyDescriptor | undefined
  tiltFineProp: SliderPropertyDescriptor | undefined
  baseYawDeg: number
  basePitchDeg: number
  beamRadius: number
  cullCosCone: number
  cullSinCone: number
  floorCookieSide: number
  cosHalfBeam: number
  groupRef: React.RefObject<Group | null>
  headRef: React.RefObject<Group | null>
  slot: number
  emitters: EmittersHandle | null
  regionGeometry: ReadonlyArray<RegionGeometry>
  colorStateRef: React.RefObject<ColorState>
}

const FALLBACK_PAN = makeFallbackSlider('pan')
const FALLBACK_TILT = makeFallbackSlider('tilt')
const FALLBACK_PAN_FINE = makeFallbackSlider('pan_fine')
const FALLBACK_TILT_FINE = makeFallbackSlider('tilt_fine')

// 8-bit fine DMX channel divides one coarse step into 256 sub-steps.
const FINE_STEPS = 256

function combineFine(
  coarseProp: SliderPropertyDescriptor | undefined,
  coarseRaw: number,
  fineProp: SliderPropertyDescriptor | undefined,
  fineRaw: number,
): number {
  if (!coarseProp) return 0
  return fineProp ? coarseRaw + fineRaw / FINE_STEPS : coarseRaw
}

// Per-frame: decode pan/tilt to a beam direction, point the head, then push
// the fixture's slot in the shared instanced emitters. Origin has to come
// from the THREE group (not the React `fixturePos` prop) — TransformControls
// mutates the group position directly during drag and React state lags.
function useBeamDirector({
  panProp,
  tiltProp,
  panFineProp,
  tiltFineProp,
  baseYawDeg,
  basePitchDeg,
  beamRadius,
  cullCosCone,
  cullSinCone,
  floorCookieSide,
  cosHalfBeam,
  groupRef,
  headRef,
  slot,
  emitters,
  regionGeometry,
  colorStateRef,
}: BeamDirectorOpts) {
  const panRaw = useSliderValue(panProp ?? FALLBACK_PAN)
  const tiltRaw = useSliderValue(tiltProp ?? FALLBACK_TILT)
  const panFineRaw = useSliderValue(panFineProp ?? FALLBACK_PAN_FINE)
  const tiltFineRaw = useSliderValue(tiltFineProp ?? FALLBACK_TILT_FINE)

  useFrame(() => {
    const panCombined = combineFine(panProp, panRaw, panFineProp, panFineRaw)
    const tiltCombined = combineFine(tiltProp, tiltRaw, tiltFineProp, tiltFineRaw)
    const panDeg = panProp ? dmxToDegrees(panCombined, panProp, baseYawDeg) : baseYawDeg
    const tiltDeg = tiltProp
      ? dmxToDegrees(tiltCombined, tiltProp, basePitchDeg)
      : basePitchDeg
    const finalPan = panDeg ?? baseYawDeg
    const finalTilt = tiltDeg ?? basePitchDeg

    const dir = panTiltToDir(finalPan, finalTilt, SCRATCH_DIR)

    if (headRef.current) {
      headRef.current.quaternion.copy(
        headQuaternionFor(finalPan, finalTilt, SCRATCH_QUAT, SCRATCH_QUAT_EULER),
      )
    }

    if (!emitters) return

    const colorState = colorStateRef.current
    const lightOn = colorState.poolOpacity >= LIGHT_OFF_OPACITY
    if (!lightOn) {
      emitters.hideSlot(slot)
      return
    }

    if (groupRef.current) {
      groupRef.current.updateMatrixWorld()
      groupRef.current.getWorldPosition(SCRATCH_ORIGIN)
    }

    // Cone matrix: unit cone scaled to (beamRadius, BEAM_LENGTH, beamRadius),
    // rotated so UNIT_Y → -dir (apex back toward fixture), translated to the
    // midpoint along the beam. Apex ends up at fixture origin in world space.
    SCRATCH_NEG_DIR.copy(dir).multiplyScalar(-1)
    SCRATCH_QUAT.setFromUnitVectors(UNIT_Y, SCRATCH_NEG_DIR)
    SCRATCH_CONE_POS.set(
      SCRATCH_ORIGIN.x + (dir.x * BEAM_LENGTH) / 2,
      SCRATCH_ORIGIN.y + (dir.y * BEAM_LENGTH) / 2,
      SCRATCH_ORIGIN.z + (dir.z * BEAM_LENGTH) / 2,
    )
    SCRATCH_CONE_SCALE.set(beamRadius, BEAM_LENGTH, beamRadius)
    SCRATCH_CONE_MAT.compose(SCRATCH_CONE_POS, SCRATCH_QUAT, SCRATCH_CONE_SCALE)
    emitters.writeConeMatrix(slot, SCRATCH_CONE_MAT)
    emitters.writeConeAttrs(slot, SCRATCH_ORIGIN, colorState.color, colorState.coneOpacity)

    updateFloorCookie(
      emitters,
      slot,
      SCRATCH_ORIGIN,
      dir,
      BEAM_LENGTH,
      cullSinCone,
      floorCookieSide,
    )
    emitters.writeFloorAttrs(
      slot,
      SCRATCH_ORIGIN,
      dir,
      colorState.color,
      colorState.poolOpacity,
      cosHalfBeam,
    )

    cullRegionCookies(
      emitters,
      slot,
      SCRATCH_ORIGIN,
      dir,
      BEAM_LENGTH,
      cullCosCone,
      cullSinCone,
      regionGeometry,
    )
    emitters.writeRegionAttrs(
      slot,
      SCRATCH_ORIGIN,
      dir,
      colorState.color,
      colorState.poolOpacity,
      cosHalfBeam,
    )
  })
}

// Resize + reposition the floor cookie to bound the cone's actual floor reach.
// `sinCone` and `side` are precomputed against the same slacked half-angle as
// the region cull so the horizon fade and bounding box share that padding.
export function updateFloorCookie(
  emitters: { writeFloorMatrix: (slot: number, visible: boolean, cx: number, cz: number, side: number) => void },
  slot: number,
  origin: Vector3,
  dir: Vector3,
  beamLength: number,
  sinCone: number,
  side: number,
): void {
  if (dir.y >= sinCone) {
    emitters.writeFloorMatrix(slot, false, 0, 0, 0)
    return
  }
  // dir.y near zero would project the centerline to a huge distance; fall
  // back to fixture XZ in that case (lit area starts at origin anyway).
  let cx = origin.x
  let cz = origin.z
  if (dir.y < -1e-3) {
    const t = Math.min(-origin.y / dir.y, beamLength)
    if (t > 0) {
      cx = origin.x + t * dir.x
      cz = origin.z + t * dir.z
    }
  }
  emitters.writeFloorMatrix(slot, true, cx, cz, side)
}

// Toggle each region-top cookie's visibility via a conservative cone-vs-sphere
// test. Conservative so we never pop a cookie out while the cone is still
// touching its bounding sphere — the shader's per-fragment shadow + cosAngle
// tests handle the exact silhouette.
export function cullRegionCookies(
  emitters: { writeRegionVisibility: (slot: number, regionIdx: number, visible: boolean) => void },
  slot: number,
  origin: Vector3,
  dir: Vector3,
  beamLength: number,
  cosCone: number,
  sinCone: number,
  regions: ReadonlyArray<{ topCenter: Vector3; topBoundingRadius: number }>,
): void {
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i]
    const dx = r.topCenter.x - origin.x
    const dy = r.topCenter.y - origin.y
    const dz = r.topCenter.z - origin.z
    const dist2 = dx * dx + dy * dy + dz * dz
    const reach = beamLength + r.topBoundingRadius
    if (dist2 > reach * reach) {
      emitters.writeRegionVisibility(slot, i, false)
      continue
    }
    if (dist2 < r.topBoundingRadius * r.topBoundingRadius) {
      emitters.writeRegionVisibility(slot, i, true)
      continue
    }
    const dist = Math.sqrt(dist2)
    const sinAR = r.topBoundingRadius / dist
    const cosAR = Math.sqrt(Math.max(0, 1 - sinAR * sinAR))
    const cosBoundary = cosCone * cosAR - sinCone * sinAR
    const cosAngle = (dir.x * dx + dir.y * dy + dir.z * dz) / dist
    emitters.writeRegionVisibility(slot, i, cosAngle >= cosBoundary)
  }
}


// — colour sync (React-rate via property hooks) —————————————————————

interface ColourSyncBaseProps {
  dimmerProp: SliderPropertyDescriptor | undefined
  lensRef: React.RefObject<Mesh | null>
  colorStateRef: React.RefObject<ColorState>
}

function ColourSync({
  colourSource,
  gel,
  ...refs
}: ColourSyncBaseProps & {
  colourSource:
    | { type: 'colour'; property: ColourPropertyDescriptor }
    | { type: 'setting'; property: SettingPropertyDescriptor }
    | undefined
  gel: { color: string } | null
}) {
  if (colourSource?.type === 'colour') {
    return <ColourBeamSync colourProp={colourSource.property} {...refs} />
  }
  if (colourSource?.type === 'setting') {
    return <SettingColourBeamSync settingProp={colourSource.property} {...refs} />
  }
  return <FixedColourBeamSync hex={gel?.color ?? '#fff8d5'} {...refs} />
}

function applyColour(hex: string, intensity: number, refs: ColourSyncBaseProps) {
  COLOR_TMP.set(hex)
  // Lens stays partially visible at idle (it's the lamp body, not the beam).
  if (refs.lensRef.current) {
    const mat = refs.lensRef.current.material as MeshBasicMaterial
    mat.color.copy(COLOR_TMP)
    mat.opacity = 0.5 + 0.5 * intensity
    mat.transparent = true
  }
  const state = refs.colorStateRef.current
  state.color.copy(COLOR_TMP)
  state.coneOpacity = 0.32 * intensity
  state.poolOpacity = 0.55 * intensity
}

function BeamColourSync({
  css,
  intensity,
  ...refs
}: ColourSyncBaseProps & { css: string; intensity: number }) {
  useEffect(() => {
    applyColour(css, intensity, refs)
    // refs object identity changes per render but its members are stable
    // RefObjects, so we only re-run on meaningful inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [css, intensity])
  return null
}

function ColourBeamSync({
  colourProp,
  dimmerProp,
  ...refs
}: ColourSyncBaseProps & { colourProp: ColourPropertyDescriptor }) {
  const colour = useColourValue(colourProp)
  const intensity = useNormalizedIntensity(dimmerProp)
  return <BeamColourSync css={colour.combinedCss} intensity={intensity} dimmerProp={dimmerProp} {...refs} />
}

function SettingColourBeamSync({
  settingProp,
  dimmerProp,
  ...refs
}: ColourSyncBaseProps & { settingProp: SettingPropertyDescriptor }) {
  const preview = useSettingColourPreview(settingProp) ?? '#888888'
  const intensity = useNormalizedIntensity(dimmerProp)
  return <BeamColourSync css={preview} intensity={intensity} dimmerProp={dimmerProp} {...refs} />
}

function FixedColourBeamSync({
  hex,
  dimmerProp,
  ...refs
}: ColourSyncBaseProps & { hex: string }) {
  const intensity = useNormalizedIntensity(dimmerProp)
  return <BeamColourSync css={hex} intensity={intensity} dimmerProp={dimmerProp} {...refs} />
}
