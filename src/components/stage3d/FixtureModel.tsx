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
import { lightingApi } from '../../api/lightingApi'
import {
  findColourSource,
  findDimmerProperty,
  findGroupColourSource,
  type ChannelRef,
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
import type { GroupColourPropertyDescriptor } from '../../api/groupsApi'
import {
  channelKey,
  computeCombinedCss,
  getChannelValue,
  resolveSettingOption,
} from '../../hooks/usePropertyValues'
import { computeGroupColourValues } from '../../hooks/useGroupPropertyValues'
import { colourFactor } from '../../hooks/useNormalizedIntensity'
import { findGel } from '../../data/gels'
import {
  dmxToDegrees,
  headQuaternionFor,
  panTiltToDir,
  worldPositionFor,
} from '../../lib/stageCoords'
import {
  BEAM_LENGTH,
  MAX_WASH_PIXELS,
  useEmitters,
  type EmittersHandle,
  type RegionGeometry,
} from './StageEmitters'
import { FixtureBody } from './fixtureBodies'
import { STRIP_HEIGHT, STRIP_LEN } from './fixtureBodies/StripBody'
import type { FixtureBodyDims, PixelColorWriter } from './fixtureBodies/types'
import { WASH_ANGLE_DEG, WASH_OPACITY } from './washConfig'

const DEFAULT_BEAM_DEG = 30
const COLOR_TMP = new Color()
const PIXEL_COLOR = new Color()
const WASH_COLOR = new Color()
const UNIT_Y = new Vector3(0, 1, 0)
const LOCAL_DOWN = new Vector3(0, -1, 0)
const SCRATCH_DIR = new Vector3()
const SCRATCH_NEG_DIR = new Vector3()
const SCRATCH_ORIGIN = new Vector3()
const SCRATCH_QUAT = new Quaternion()
const SCRATCH_QUAT_EULER = new Euler()
const SCRATCH_CONE_POS = new Vector3()
const SCRATCH_CONE_SCALE = new Vector3()
const SCRATCH_CONE_MAT = new Matrix4()
const SCRATCH_WASH_DIR = new Vector3()
const SCRATCH_WASH_QUAT = new Quaternion()
const SCRATCH_PIXEL_POS = new Vector3()

// Slack on the cone half-angle so cookies fade in before the shader's
// cosAngle test would clip them — masks the boundary even on a wide spot
// at the edge of its reach.
const REGION_CULL_SLACK_RAD = MathUtils.degToRad(3)

// ~1% intensity, below one DMX step at the pool's 0.55x opacity scale.
const LIGHT_OFF_OPACITY = 0.005

// Wash cone trig derived from the (tuneable) full wash angle in degrees.
interface WashGeom {
  cosHalf: number
  cosCull: number
  sinCull: number
  floorSide: number
}
function washGeomFor(angleDeg: number): WashGeom {
  const half = MathUtils.degToRad(angleDeg / 2)
  const cull = half + REGION_CULL_SLACK_RAD
  return {
    cosHalf: Math.cos(half),
    cosCull: Math.cos(cull),
    sinCull: Math.sin(cull),
    floorSide: 2 * BEAM_LENGTH * Math.sin(cull),
  }
}
// Wash angle is a fixed code constant, so the cone trig is computed once.
const WASH_GEOM = washGeomFor(WASH_ANGLE_DEG)

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
  // Per-element colour control of a multi-element fixture (e.g. a pixel bar).
  const groupColour = useMemo(() => findGroupColourSource(fixture), [fixture])
  const pixelCount = groupColour ? groupColour.memberColourChannels.length : 0
  const pixelColorsRef = useRef<PixelColorWriter | null>(null)
  const kind = resolveFixtureKind(patch.kindOverride, fixtureType?.kind)
  // Only the STRIP body lays pixels out linearly (PixelStrip); that's where a
  // per-pixel wash makes sense.
  const isPixelStrip = kind === 'STRIP' && pixelCount > 1

  // Per-pixel colour+intensity snapshot: MultiPixelColourSync writes it on every
  // channel change; useWashDirector reads it each frame (same event-driven-colour
  // / per-frame-geometry split as the beam path's colorStateRef). Cached in the
  // render body so it's ready before the child colour-sync's mount effect runs.
  const pixelWashStateRef = useRef<PixelWashState | null>(null)
  if (isPixelStrip) {
    if (pixelWashStateRef.current?.count !== pixelCount) {
      pixelWashStateRef.current = {
        count: pixelCount,
        colors: new Float32Array(pixelCount * 3),
        intensities: new Float32Array(pixelCount),
      }
    }
  } else if (pixelWashStateRef.current) {
    pixelWashStateRef.current = null
  }
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

  // Real physical size for body scaling; undefined when the backend didn't send
  // dimensions, so bodies keep their hard-coded design size.
  const bodyDims = useMemo<FixtureBodyDims | undefined>(() => {
    const l = fixtureType?.lengthM
    const w = fixtureType?.widthM
    const h = fixtureType?.heightM
    if (l == null || w == null || h == null) return undefined
    return { lengthM: l, widthM: w, heightM: h }
  }, [fixtureType?.lengthM, fixtureType?.widthM, fixtureType?.heightM])

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

  // Wash-slot zeroing — mirror the beam path. Vacate the wash block when this
  // fixture isn't a per-pixel strip (slots persist across renders), and on
  // unmount before the slot can be reused by a different fixture.
  useEffect(() => {
    if (!emitters || isPixelStrip) return
    emitters.hideWashSlot(slot)
  }, [emitters, isPixelStrip, slot])
  useEffect(() => {
    return () => {
      if (emitters) emitters.hideWashSlot(slot)
    }
  }, [emitters, slot])

  useWashDirector({
    enabled: isPixelStrip,
    pixelCount,
    lengthM: bodyDims?.lengthM ?? STRIP_LEN,
    heightM: bodyDims?.heightM ?? STRIP_HEIGHT,
    headRef,
    slot,
    emitters,
    regionGeometry,
    colorStateRef,
    pixelWashStateRef,
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
        kind={kind}
        active={active}
        headRef={headRef}
        lensRef={lensRef}
        dims={bodyDims}
        pixelCount={pixelCount > 1 ? pixelCount : undefined}
        pixelColorsRef={pixelColorsRef}
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
        groupColour={pixelCount > 1 ? groupColour : undefined}
        gel={gel}
        dimmerProp={dimmerProp}
        lensRef={lensRef}
        colorStateRef={colorStateRef}
        pixelColorsRef={pixelColorsRef}
        pixelWashStateRef={pixelWashStateRef}
      />
    </group>
  )
}

interface ColorState {
  color: Color
  coneOpacity: number
  poolOpacity: number
}

// Per-pixel colour (0..1 RGB, packed) + effective intensity (0..1), written by
// MultiPixelColourSync and read each frame by useWashDirector.
interface PixelWashState {
  count: number
  colors: Float32Array
  intensities: Float32Array
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
  // Pan/tilt feed geometry that's recomputed every frame anyway (TransformControls
  // can move the group mid-drag), so read them straight from the live channel
  // store in the frame loop rather than via React subscriptions — same reasoning
  // as the colour sync below: the R3F reconciler can drop hook-driven updates,
  // the frame loop can't. Keys are pre-baked so the per-frame read allocates nothing.
  const panKeys = useMemo(
    () => ({
      pan: panProp ? channelKey(panProp.channel) : null,
      tilt: tiltProp ? channelKey(tiltProp.channel) : null,
      panFine: panFineProp ? channelKey(panFineProp.channel) : null,
      tiltFine: tiltFineProp ? channelKey(tiltFineProp.channel) : null,
    }),
    [panProp, tiltProp, panFineProp, tiltFineProp],
  )

  useFrame(() => {
    const vals = lightingApi.channels.getAll()
    const panRaw = panKeys.pan ? vals.get(panKeys.pan) ?? 0 : 0
    const tiltRaw = panKeys.tilt ? vals.get(panKeys.tilt) ?? 0 : 0
    const panFineRaw = panKeys.panFine ? vals.get(panKeys.panFine) ?? 0 : 0
    const tiltFineRaw = panKeys.tiltFine ? vals.get(panKeys.tiltFine) ?? 0 : 0

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


// — colour sync (event-driven via live channel subscriptions) —————————
//
// Colour is applied to the scene imperatively from a raw channel subscription,
// NOT through useSyncExternalStore → render → useEffect. Inside the R3F Canvas
// (a separate reconciler root) those store-driven re-renders flush on the loop's
// own cadence and drop beat-rate changes; the subscription callback fires
// synchronously from the channel store, outside React, so every change lands.
// The lens material is written here directly; the beam's colorStateRef is read
// each frame by useBeamDirector and pushed to the emitter buffers.

interface ColourSyncBaseProps {
  dimmerProp: SliderPropertyDescriptor | undefined
  lensRef: React.RefObject<Mesh | null>
  colorStateRef: React.RefObject<ColorState>
  pixelColorsRef: React.RefObject<PixelColorWriter | null>
  pixelWashStateRef?: React.RefObject<PixelWashState | null>
}

function ColourSync({
  colourSource,
  groupColour,
  gel,
  ...refs
}: ColourSyncBaseProps & {
  colourSource:
    | { type: 'colour'; property: ColourPropertyDescriptor }
    | { type: 'setting'; property: SettingPropertyDescriptor }
    | undefined
  groupColour: GroupColourPropertyDescriptor | undefined
  gel: { color: string } | null
}) {
  // Multi-element fixtures drive per-pixel bodies + one aggregate beam.
  if (groupColour) {
    return <MultiPixelColourSync groupColour={groupColour} {...refs} />
  }
  if (colourSource?.type === 'colour') {
    return <ColourBeamSync colourProp={colourSource.property} {...refs} />
  }
  if (colourSource?.type === 'setting') {
    return <SettingColourBeamSync settingProp={colourSource.property} {...refs} />
  }
  return <FixedColourBeamSync hex={gel?.color ?? '#fff8d5'} {...refs} />
}

interface ColourApplyRefs {
  lensRef: React.RefObject<Mesh | null>
  colorStateRef: React.RefObject<ColorState>
}

function applyColour(hex: string, intensity: number, refs: ColourApplyRefs) {
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

// 0..1 dimmer factor from live DMX; 1 when the fixture has no dimmer ("always
// on"). Mirrors useNormalizedIntensity but reads the store imperatively.
function liveDimmerFactor(dimmerProp: SliderPropertyDescriptor | undefined): number {
  if (!dimmerProp) return 1
  return Math.max(0, Math.min(1, getChannelValue(dimmerProp.channel) / 255))
}

// Subscribe to live DMX for `channels` and run `apply` on every change — plus
// once on mount and after each (rare) re-render, so descriptor/gel/dimmer-prop
// changes also take effect. `channels` must be referentially stable across
// renders or the subscription will thrash.
function useLiveColour(channels: ChannelRef[], apply: () => void) {
  const applyRef = useRef(apply)
  applyRef.current = apply
  // Re-apply after every render. These components no longer subscribe through
  // React, so renders only happen on config/selection changes — cheap to redo,
  // and it covers inputs (gel hex, dimmer prop) that aren't channel values.
  useEffect(() => {
    applyRef.current()
  })
  // Live path: write straight to the scene from the channel callback, bypassing
  // React entirely so beat-rate changes can't be dropped by the reconciler.
  useEffect(() => {
    const cb = () => applyRef.current()
    const subs = channels.map((ch) =>
      lightingApi.channels.subscribeToChannel(channelKey(ch), cb),
    )
    return () => subs.forEach((s) => s.unsubscribe())
  }, [channels])
}

function ColourBeamSync({
  colourProp,
  dimmerProp,
  ...refs
}: ColourSyncBaseProps & { colourProp: ColourPropertyDescriptor }) {
  const channels = useMemo(() => {
    const cs: ChannelRef[] = [
      colourProp.redChannel,
      colourProp.greenChannel,
      colourProp.blueChannel,
    ]
    if (colourProp.whiteChannel) cs.push(colourProp.whiteChannel)
    if (colourProp.amberChannel) cs.push(colourProp.amberChannel)
    if (colourProp.uvChannel) cs.push(colourProp.uvChannel)
    if (dimmerProp) cs.push(dimmerProp.channel)
    return cs
  }, [colourProp, dimmerProp])

  useLiveColour(channels, () => {
    const r = getChannelValue(colourProp.redChannel)
    const g = getChannelValue(colourProp.greenChannel)
    const b = getChannelValue(colourProp.blueChannel)
    const w = colourProp.whiteChannel ? getChannelValue(colourProp.whiteChannel) : undefined
    const a = colourProp.amberChannel ? getChannelValue(colourProp.amberChannel) : undefined
    const uv = colourProp.uvChannel ? getChannelValue(colourProp.uvChannel) : undefined
    // Effective intensity = dimmer × colour so a colour-only fixture at RGB 0
    // reads as dark rather than beaming at full.
    const intensity = liveDimmerFactor(dimmerProp) * colourFactor(r, g, b, w)
    applyColour(computeCombinedCss(r, g, b, w, a, uv), intensity, refs)
  })
  return null
}

function SettingColourBeamSync({
  settingProp,
  dimmerProp,
  ...refs
}: ColourSyncBaseProps & { settingProp: SettingPropertyDescriptor }) {
  const channels = useMemo(() => {
    const cs: ChannelRef[] = [settingProp.channel]
    if (dimmerProp) cs.push(dimmerProp.channel)
    return cs
  }, [settingProp, dimmerProp])

  useLiveColour(channels, () => {
    const level = getChannelValue(settingProp.channel)
    const preview = resolveSettingOption(settingProp.options, level)?.colourPreview
    // A selected colour preset reads as fully on; no selection ⇒ dark. A separate
    // dimmer at 0 still wins via the dimmer factor.
    const intensity = liveDimmerFactor(dimmerProp) * (preview ? 1 : 0)
    applyColour(preview ?? '#888888', intensity, refs)
  })
  return null
}

function FixedColourBeamSync({
  hex,
  dimmerProp,
  ...refs
}: ColourSyncBaseProps & { hex: string }) {
  // No colour channels (gel / dimmer-only), so colourFactor is implicitly 1 —
  // intensity is the dimmer alone. A gel/setting fixture with no dimmer beams
  // full by design (no brightness signal to gate on).
  const channels = useMemo(() => (dimmerProp ? [dimmerProp.channel] : []), [dimmerProp])
  useLiveColour(channels, () => {
    applyColour(hex, liveDimmerFactor(dimmerProp), refs)
  })
  return null
}

// Multi-element fixture: drive each pixel's body lens from its own colour, and
// feed the single aggregate beam (intensity-weighted hue + peak-blended level).
function MultiPixelColourSync({
  groupColour,
  dimmerProp,
  colorStateRef,
  pixelColorsRef,
  pixelWashStateRef,
}: ColourSyncBaseProps & { groupColour: GroupColourPropertyDescriptor }) {
  const channels = useMemo(() => {
    const cs: ChannelRef[] = []
    groupColour.memberColourChannels.forEach((m) => {
      cs.push(m.redChannel, m.greenChannel, m.blueChannel)
      if (m.whiteChannel) cs.push(m.whiteChannel)
      if (m.amberChannel) cs.push(m.amberChannel)
      if (m.uvChannel) cs.push(m.uvChannel)
    })
    if (dimmerProp) cs.push(dimmerProp.channel)
    return cs
  }, [groupColour, dimmerProp])

  useLiveColour(channels, () => {
    const group = computeGroupColourValues(groupColour)
    const dimmerFactor = liveDimmerFactor(dimmerProp)
    const writer = pixelColorsRef.current
    const wash = pixelWashStateRef?.current ?? null
    // reset() first so a pixel that just dropped to zero is explicitly driven
    // dark — imperative material writes get no React default.
    if (writer) writer.reset()
    for (let i = 0; i < group.members.length; i++) {
      const m = group.members[i]
      const ci = colourFactor(m.r, m.g, m.b, m.w) * dimmerFactor
      if (writer) {
        PIXEL_COLOR.set(`rgb(${m.r}, ${m.g}, ${m.b})`)
        writer.setPixel(i, PIXEL_COLOR, ci)
      }
      if (wash && i < wash.count) {
        wash.colors[i * 3] = m.r / 255
        wash.colors[i * 3 + 1] = m.g / 255
        wash.colors[i * 3 + 2] = m.b / 255
        wash.intensities[i] = ci
      }
    }
    // Zero any wash pixels past the live member count (mode change shrinking it).
    if (wash) {
      for (let i = group.members.length; i < wash.count; i++) wash.intensities[i] = 0
    }
    // Aggregate beam state — only consumed when a multi-element fixture also
    // projects an emitter beam (beamShape ≠ NONE). Strips render per-head glows
    // instead, so this is dormant for them.
    const eff = group.beamIntensity * dimmerFactor
    const state = colorStateRef.current
    state.color.set(`rgb(${group.beamR}, ${group.beamG}, ${group.beamB})`)
    state.coneOpacity = 0.32 * eff
    state.poolOpacity = 0.55 * eff
  })
  return null
}

// — per-pixel wash director (strips/bars) ————————————————————————————
//
// A pixel bar has no tight beam — each pixel throws a wide soft wash. Every
// frame this transforms each pixel to world space, derives the bar's wash
// direction from its mounted orientation, and writes one floor pool (+ region
// cookies) per pixel, coloured from the live per-pixel snapshot. Overlapping
// per-pixel pools additively blend into a continuous coloured wash on the floor.

interface WashDirectorOpts {
  enabled: boolean
  pixelCount: number
  lengthM: number
  heightM: number
  headRef: React.RefObject<Group | null>
  slot: number
  emitters: EmittersHandle | null
  regionGeometry: ReadonlyArray<RegionGeometry>
  colorStateRef: React.RefObject<ColorState>
  pixelWashStateRef: React.RefObject<PixelWashState | null>
}

function useWashDirector({
  enabled,
  pixelCount,
  lengthM,
  heightM,
  headRef,
  slot,
  emitters,
  regionGeometry,
  colorStateRef,
  pixelWashStateRef,
}: WashDirectorOpts) {
  useFrame(() => {
    if (!enabled || !emitters) return
    const wash = pixelWashStateRef.current
    const agg = colorStateRef.current
    // Whole-bar off (aggregate below threshold) → drop the block in one go.
    if (!wash || !agg || agg.poolOpacity < LIGHT_OFF_OPACITY) {
      emitters.hideWashSlot(slot)
      return
    }
    const head = headRef.current
    if (!head) return

    // Wash direction = the bar's local down (its emitting face) in world space.
    head.updateWorldMatrix(true, false)
    head.getWorldQuaternion(SCRATCH_WASH_QUAT)
    SCRATCH_WASH_DIR.copy(LOCAL_DOWN).applyQuaternion(SCRATCH_WASH_QUAT).normalize()
    const dir = SCRATCH_WASH_DIR

    const pitch = lengthM / pixelCount
    const lensY = -heightM / 2 - 0.001
    const live = Math.min(pixelCount, wash.count, MAX_WASH_PIXELS)
    const regionCount = regionGeometry.length

    for (let i = 0; i < live; i++) {
      const intensity = wash.intensities[i]
      if (intensity < LIGHT_OFF_OPACITY) {
        emitters.writeWashFloorMatrix(slot, i, false, 0, 0, 0)
        for (let r = 0; r < regionCount; r++) emitters.writeWashRegionVisibility(slot, i, r, false)
        continue
      }
      const x = -lengthM / 2 + pitch * (i + 0.5)
      SCRATCH_PIXEL_POS.set(x, lensY, 0).applyMatrix4(head.matrixWorld)
      WASH_COLOR.setRGB(wash.colors[i * 3], wash.colors[i * 3 + 1], wash.colors[i * 3 + 2])
      const opacity = WASH_OPACITY * intensity

      updateWashFloorCookie(emitters, slot, i, SCRATCH_PIXEL_POS, dir, WASH_GEOM)
      emitters.writeWashFloorAttrs(slot, i, SCRATCH_PIXEL_POS, dir, WASH_COLOR, opacity, WASH_GEOM.cosHalf)
      writeWashRegionCookies(
        emitters,
        slot,
        i,
        SCRATCH_PIXEL_POS,
        dir,
        regionGeometry,
        WASH_COLOR,
        opacity,
        WASH_GEOM,
      )
    }
    // Hide the unused tail of this slot's block (fewer pixels than the cap).
    for (let i = live; i < MAX_WASH_PIXELS; i++) {
      emitters.writeWashFloorMatrix(slot, i, false, 0, 0, 0)
      for (let r = 0; r < regionCount; r++) emitters.writeWashRegionVisibility(slot, i, r, false)
    }
  })
}

// Project one pixel's wash onto the floor (same maths as updateFloorCookie,
// per-pixel). Hidden when the pixel faces up.
function updateWashFloorCookie(
  emitters: EmittersHandle,
  slot: number,
  pixelIdx: number,
  origin: Vector3,
  dir: Vector3,
  geom: WashGeom,
): void {
  if (dir.y >= geom.sinCull) {
    emitters.writeWashFloorMatrix(slot, pixelIdx, false, 0, 0, 0)
    return
  }
  let cx = origin.x
  let cz = origin.z
  if (dir.y < -1e-3) {
    const t = Math.min(-origin.y / dir.y, BEAM_LENGTH)
    if (t > 0) {
      cx = origin.x + t * dir.x
      cz = origin.z + t * dir.z
    }
  }
  emitters.writeWashFloorMatrix(slot, pixelIdx, true, cx, cz, geom.floorSide)
}

// Per-pixel region-top cookies: cull (conservative cone-vs-sphere, same as
// cullRegionCookies) then write this pixel's wash attrs for the region block.
function writeWashRegionCookies(
  emitters: EmittersHandle,
  slot: number,
  pixelIdx: number,
  origin: Vector3,
  dir: Vector3,
  regions: ReadonlyArray<RegionGeometry>,
  color: Color,
  opacity: number,
  geom: WashGeom,
): void {
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i]
    const dx = r.topCenter.x - origin.x
    const dy = r.topCenter.y - origin.y
    const dz = r.topCenter.z - origin.z
    const dist2 = dx * dx + dy * dy + dz * dz
    const reach = BEAM_LENGTH + r.topBoundingRadius
    let visible: boolean
    if (dist2 > reach * reach) {
      visible = false
    } else if (dist2 < r.topBoundingRadius * r.topBoundingRadius) {
      visible = true
    } else {
      const dist = Math.sqrt(dist2)
      const sinAR = r.topBoundingRadius / dist
      const cosAR = Math.sqrt(Math.max(0, 1 - sinAR * sinAR))
      const cosBoundary = geom.cosCull * cosAR - geom.sinCull * sinAR
      const cosAngle = (dir.x * dx + dir.y * dy + dir.z * dz) / dist
      visible = cosAngle >= cosBoundary
    }
    emitters.writeWashRegionVisibility(slot, pixelIdx, i, visible)
  }
  emitters.writeWashRegionAttrs(slot, pixelIdx, origin, dir, color, opacity, geom.cosHalf)
}
