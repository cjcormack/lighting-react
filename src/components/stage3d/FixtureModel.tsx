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
  findFocusProperty,
  findZoomProperty,
  findGoboProperty,
  findGoboRotationProperty,
  findPrismProperty,
  findLedMacroProperty,
  findMovementMacroProperty,
  resolveFixtureKind,
} from '../../store/fixtures'
import type { GroupColourPropertyDescriptor } from '../../api/groupsApi'
import {
  channelKey,
  getChannelValue,
  resolveSettingOption,
} from '../../hooks/usePropertyValues'
import { computeGroupColourValues } from '../../hooks/useGroupPropertyValues'
import { colourFactor } from '../../hooks/useNormalizedIntensity'
import {
  computeNormalizedHue,
  computeNormalizedHueCss,
  perceptualBrightness,
} from '../../lib/colourMath'
import { findGel } from '../../data/gels'
import {
  dmxToDegrees,
  dmxToSignedDegrees,
  headQuaternionFor,
  worldPositionFor,
} from '../../lib/stageCoords'
import {
  computeBeamGeom,
  evalLedMacro,
  evalMovementMacro,
  makeBeamGeom,
  resolveFocusParam,
  resolveGoboSlot,
  resolveGoboSpin,
  resolveMacroIndex,
  resolvePrismFacets,
  type BeamGeom,
  type ByteDescriptor,
  type MacroColour,
  type MacroMovement,
} from './beamOptics'
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
const SCRATCH_DIR = new Vector3()
const SCRATCH_NEG_DIR = new Vector3()
const SCRATCH_ORIGIN = new Vector3()
const SCRATCH_QUAT = new Quaternion()
const SCRATCH_QUAT_EULER = new Euler()
const SCRATCH_CONE_POS = new Vector3()
const SCRATCH_CONE_SCALE = new Vector3()
const SCRATCH_CONE_MAT = new Matrix4()
const SCRATCH_WASH_DIR = new Vector3()
const SCRATCH_PIXEL_POS = new Vector3()
const SCRATCH_RIGHT = new Vector3()
const SCRATCH_MACRO_COLOR = new Color()
const SCRATCH_MOVE_MACRO: MacroMovement = { panDeg: 0, tiltDeg: 0 }
const SCRATCH_LED_MACRO: MacroColour = { hueShift: 0, intensityScale: 1 }
const SCRATCH_HSL = { h: 0, s: 0, l: 0 }
// Saturation floor for a hue-cycling LED macro, so it still reads as a colour
// chase when the fixture's base colour is white.
const LED_MACRO_MIN_SATURATION = 0.8
const TAU = Math.PI * 2

// Prism approximation: the air column widens and dims rather than splitting into
// separate cones, which would need emitter capacity the pool doesn't have.
const PRISM_SPREAD = 2.2
const PRISM_CONE_DIM = 0.6
// Lobe centres sit this many beam half-angles off axis — just past 1 so they
// separate visibly while still overlapping, which is what a real 3-facet prism
// looks like on the floor.
const PRISM_SPLAY = 1.35
// Lobe and centre shares. They sum to roughly 1 so total floor flux is about
// what the un-prismed beam put down — the prism spreads light, it doesn't make
// any. The centre keeps a little extra because all three lobes overlap it.
const PRISM_LOBE_DIM = 0.28
const PRISM_CENTRE_DIM = 0.3
const SCRATCH_PRISM_X = new Vector3()
const SCRATCH_PRISM_Y = new Vector3()
const SCRATCH_LOBE_DIR = new Vector3()

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
  // Beam-shaping channels. All undefined against a backend that predates the
  // categories, which is what makes the optics below degrade to the old look.
  const focusProp = useMemo(() => findFocusProperty(fixture?.properties), [fixture?.properties])
  const zoomProp = useMemo(() => findZoomProperty(fixture?.properties), [fixture?.properties])
  const goboProp = useMemo(() => findGoboProperty(fixture?.properties), [fixture?.properties])
  const goboRotProp = useMemo(
    () => findGoboRotationProperty(fixture?.properties),
    [fixture?.properties],
  )
  const prismProp = useMemo(() => findPrismProperty(fixture?.properties), [fixture?.properties])
  const ledMacroProp = useMemo(
    () => findLedMacroProperty(fixture?.properties),
    [fixture?.properties],
  )
  const moveMacroProp = useMemo(
    () => findMovementMacroProperty(fixture?.properties),
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
    // worldPositionFor reads only these four patch fields, so listing them is
    // complete — and cheaper than recomputing on every new patch object in a
    // per-frame render path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    patch.stageX,
    patch.stageY,
    patch.stageZ,
    patch.riggingUuid,
    riggings,
  ])

  // Fallback beam angle. A ZOOM channel overrides this per frame inside the
  // director, which is why none of the derived trig can live in a React memo
  // any more — see BeamGeom in beamOptics.
  const baseBeamDeg = patch.beamAngleDeg ?? DEFAULT_BEAM_DEG
  const showCone = !!fixtureType?.acceptsBeamAngle && !!emitters

  const groupRef = useRef<Group>(null)
  const yokeRef = useRef<Group>(null)
  const headRef = useRef<Group>(null)
  const lensRef = useRef<Mesh>(null)

  // A fixture with a tilt axis has a head that rests along +Y — mid-DMX tilt
  // points up the body, away from the base. Anything else is a rigid body whose
  // lens faces -Y and which is aimed entirely by baseYaw/basePitch. Keyed off
  // the tilt descriptor rather than `kind`, because a Source 4 Revolution is a
  // PROFILE that tilts and a Scantastic 4 is a SCANNER that does.
  //
  // `kind === 'MOVING_HEAD'` is the second half of the test, not a substitute
  // for the first: a Slender Beam Bar Quad in 1CH or 6CH mode is registered as
  // MOVING_HEAD but declares pan/tilt only on its element heads, so `tiltProp`
  // is undefined. Without this it would draw its head hanging below the yoke
  // pivot and fire straight down through its own base disc.
  const emitAxis: 1 | -1 = tiltProp || kind === 'MOVING_HEAD' ? 1 : -1

  // Mount orientation for the body. Kept on an inner group so groupRef itself
  // stays axis-aligned: TransformControls and the placement raycaster write
  // through it, and the label should stay upright above a fixture hung upside
  // down. YXZ matches rigEuler's convention.
  const baseRotation = useMemo(
    () =>
      new Euler(
        MathUtils.degToRad(patch.basePitchDeg ?? 0),
        MathUtils.degToRad(patch.baseYawDeg ?? 0),
        0,
        'YXZ',
      ),
    [patch.basePitchDeg, patch.baseYawDeg],
  )

  useEffect(() => {
    if (selected && editMode && onEditFocus && groupRef.current) {
      onEditFocus(groupRef.current)
    }
  }, [selected, editMode, onEditFocus])

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
    baseBeamDeg,
    focusProp,
    zoomProp,
    goboProp,
    goboRotProp,
    prismProp,
    ledMacroProp,
    moveMacroProp,
    groupRef,
    yokeRef,
    headRef,
    lensRef,
    emitAxis,
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
      <group rotation={baseRotation}>
        <FixtureBody
          kind={kind}
          active={active}
          headRef={headRef}
          yokeRef={yokeRef}
          lensRef={lensRef}
          emitAxis={emitAxis}
          dims={bodyDims}
          pixelCount={pixelCount > 1 ? pixelCount : undefined}
          pixelColorsRef={pixelColorsRef}
        />
      </group>

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
  baseBeamDeg: number
  focusProp: SliderPropertyDescriptor | undefined
  zoomProp: SliderPropertyDescriptor | undefined
  goboProp: ByteDescriptor | undefined
  goboRotProp: ByteDescriptor | undefined
  prismProp: ByteDescriptor | undefined
  ledMacroProp: ByteDescriptor | undefined
  moveMacroProp: ByteDescriptor | undefined
  groupRef: React.RefObject<Group | null>
  yokeRef: React.RefObject<Group | null>
  headRef: React.RefObject<Group | null>
  lensRef: React.RefObject<Mesh | null>
  emitAxis: 1 | -1
  slot: number
  emitters: EmittersHandle | null
  regionGeometry: ReadonlyArray<RegionGeometry>
  colorStateRef: React.RefObject<ColorState>
}

// 8-bit fine DMX channel divides one coarse step into 256 sub-steps.
const FINE_STEPS = 256

// Module-level, not a per-frame closure: useFrame runs once per fixture per
// frame and this path is deliberately allocation-free (see the SCRATCH_*
// constants above), so a fresh arrow function here would cost ~3k throwaway
// closures a second on the 50-fixture profile harness.
function readChannel(vals: Map<string, number>, key: string | null): number {
  return key ? vals.get(key) ?? 0 : 0
}

function combineFine(
  coarseProp: SliderPropertyDescriptor | undefined,
  coarseRaw: number,
  fineProp: SliderPropertyDescriptor | undefined,
  fineRaw: number,
): number {
  if (!coarseProp) return 0
  return fineProp ? coarseRaw + fineRaw / FINE_STEPS : coarseRaw
}

// Per-frame: decode pan/tilt, articulate the model, then read the beam back off
// the model's own matrices and push the fixture's slot in the shared instanced
// emitters. Origin has to come from the THREE objects (not the React
// `fixturePos` prop) — TransformControls mutates the group position directly
// during drag and React state lags.
function useBeamDirector({
  panProp,
  tiltProp,
  panFineProp,
  tiltFineProp,
  baseBeamDeg,
  focusProp,
  zoomProp,
  goboProp,
  goboRotProp,
  prismProp,
  ledMacroProp,
  moveMacroProp,
  groupRef,
  yokeRef,
  headRef,
  lensRef,
  emitAxis,
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
  const beamKeys = useMemo(
    () => ({
      pan: panProp ? channelKey(panProp.channel) : null,
      tilt: tiltProp ? channelKey(tiltProp.channel) : null,
      panFine: panFineProp ? channelKey(panFineProp.channel) : null,
      tiltFine: tiltFineProp ? channelKey(tiltFineProp.channel) : null,
      focus: focusProp ? channelKey(focusProp.channel) : null,
      zoom: zoomProp ? channelKey(zoomProp.channel) : null,
      gobo: goboProp ? channelKey(goboProp.channel) : null,
      goboRot: goboRotProp ? channelKey(goboRotProp.channel) : null,
      prism: prismProp ? channelKey(prismProp.channel) : null,
      ledMacro: ledMacroProp ? channelKey(ledMacroProp.channel) : null,
      moveMacro: moveMacroProp ? channelKey(moveMacroProp.channel) : null,
    }),
    [
      panProp,
      tiltProp,
      panFineProp,
      tiltFineProp,
      focusProp,
      zoomProp,
      goboProp,
      goboRotProp,
      prismProp,
      ledMacroProp,
      moveMacroProp,
    ],
  )

  // Beam cone trig. Zoom makes the angle per-frame, so this is a mutable struct
  // refreshed behind a dirty check rather than a memo — a static fixture pays
  // one float compare a frame. Per-fixture, not module-level: several readers
  // touch it within the same frame.
  const geomRef = useRef<BeamGeom>(makeBeamGeom())
  // Gobo rotation is an integrated angle, so it has to persist across frames.
  const goboAngleRef = useRef(0)
  // Whether this slot currently owns its wash block for prism lobes, so it can
  // be vacated exactly once when the prism swings out.
  const prismLitRef = useRef(false)
  const lobeGeomRef = useRef<WashGeom>({ cosHalf: 1, cosCull: 1, sinCull: 0, floorSide: 0 })

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime
    const vals = lightingApi.channels.getAll()
    const panRaw = readChannel(vals, beamKeys.pan)
    const tiltRaw = readChannel(vals, beamKeys.tilt)

    const panCombined = combineFine(panProp, panRaw, panFineProp, readChannel(vals, beamKeys.panFine))
    const tiltCombined = combineFine(tiltProp, tiltRaw, tiltFineProp, readChannel(vals, beamKeys.tiltFine))

    // Signed about each axis's own centre. No base angles here: baseYaw and
    // basePitch are the body's mount orientation and are carried by the body
    // group, so folding them in again would apply them twice.
    let panDeg = panProp ? dmxToSignedDegrees(panCombined, panProp) ?? 0 : 0
    let tiltDeg = tiltProp ? dmxToSignedDegrees(tiltCombined, tiltProp) ?? 0 : 0

    // A movement macro is an offset on top of the live pan/tilt, so both the
    // head model and the beam pick it up — they read from the same two values.
    const moveMacro = resolveMacroIndex(moveMacroProp, readChannel(vals, beamKeys.moveMacro))
    if (moveMacro > 0) {
      evalMovementMacro(moveMacro, elapsed, SCRATCH_MOVE_MACRO)
      panDeg += SCRATCH_MOVE_MACRO.panDeg
      tiltDeg += SCRATCH_MOVE_MACRO.tiltDeg
    }

    const yoke = yokeRef.current
    const head = headRef.current
    if (yoke && head) {
      // Split drive: the yoke pans, carrying the arms, and the head tilts
      // between them. Composed this equals headQuaternionFor(pan, tilt), which
      // stageCoords.test asserts so the two drive paths can't drift.
      yoke.rotation.set(0, MathUtils.degToRad(panDeg), 0)
      head.rotation.set(MathUtils.degToRad(tiltDeg), 0, 0)
    } else if (head) {
      head.quaternion.copy(
        headQuaternionFor(panDeg, tiltDeg, SCRATCH_QUAT, SCRATCH_QUAT_EULER),
      )
    }

    if (!emitters) return

    const colorState = colorStateRef.current

    // An LED macro modulates on top of the base colour. Written to a scratch
    // colour, never back into colorState: that field belongs to ColourSync, and
    // folding the macro in would leave the fixture permanently tinted once the
    // macro stops.
    const ledMacro = resolveMacroIndex(ledMacroProp, readChannel(vals, beamKeys.ledMacro))
    let beamColor = colorState.color
    let poolOpacity = colorState.poolOpacity
    let coneOpacity = colorState.coneOpacity
    if (ledMacro > 0) {
      evalLedMacro(ledMacro, elapsed, SCRATCH_LED_MACRO)
      SCRATCH_MACRO_COLOR.copy(colorState.color)
      if (SCRATCH_LED_MACRO.hueShift !== 0) {
        // offsetHSL alone is a no-op on an unsaturated base — every hue maps to
        // the same grey — and white is the common case here (the default beam
        // colour is #fff8d5, and a colour wheel sits at OPEN_WHITE). So pull
        // saturation up to a floor first, or the cycle would do nothing at all
        // on exactly the fixtures most likely to be running it.
        SCRATCH_MACRO_COLOR.getHSL(SCRATCH_HSL)
        SCRATCH_MACRO_COLOR.setHSL(
          (SCRATCH_HSL.h + SCRATCH_LED_MACRO.hueShift) % 1,
          Math.max(SCRATCH_HSL.s, LED_MACRO_MIN_SATURATION),
          SCRATCH_HSL.l,
        )
      }
      beamColor = SCRATCH_MACRO_COLOR
      poolOpacity *= SCRATCH_LED_MACRO.intensityScale
      coneOpacity *= SCRATCH_LED_MACRO.intensityScale
    }

    // Cull on the *base* opacity, not the macro-scaled one, so a pulsing macro
    // doesn't vacate and re-take the emitter slot every cycle.
    if (colorState.poolOpacity < LIGHT_OFF_OPACITY) {
      emitters.hideSlot(slot)
      // hideSlot covers the beam block only; the borrowed prism lobes live in
      // the wash block and would otherwise ghost after a blackout.
      if (prismLitRef.current) {
        emitters.hideWashSlot(slot)
        prismLitRef.current = false
      }
      return
    }

    // Zoom overrides the patch's static beam angle. dmxToDegrees is reused
    // as-is: on a ZOOM slider degMin/degMax are the beam angle at each end, and
    // it returns null when the fixture declares no range (Robe, Source 4), which
    // falls back to the patch value.
    const zoomDeg = zoomProp ? dmxToDegrees(readChannel(vals, beamKeys.zoom), zoomProp) : null
    const beamDeg = zoomDeg ?? baseBeamDeg
    const geom = geomRef.current
    if (beamDeg !== geom.beamDeg) {
      computeBeamGeom(beamDeg, BEAM_LENGTH, REGION_CULL_SLACK_RAD, geom)
    }

    // Focus hardens the beam edge. A fixture with no focus channel stays at 0,
    // which is byte-for-byte the pre-focus falloff.
    //
    // Deliberately NOT seeded from fixtureType.beamEdge: beamDefaults() marks
    // every SCANNER and PROFILE as HARD, so honouring it here would re-skin the
    // pools of fixtures nobody touched — a Source 4 in an existing show would
    // render crisper than it did yesterday with no DMX change. beamEdge is
    // documented as anticipatory; switching it on is its own decision.
    const edge = resolveFocusParam(focusProp, readChannel(vals, beamKeys.focus)) ?? 0

    const goboSlot = resolveGoboSlot(goboProp, readChannel(vals, beamKeys.gobo))
    if (goboSlot > 0) {
      const spin = resolveGoboSpin(goboRotProp, readChannel(vals, beamKeys.goboRot))
      if (spin !== 0) {
        // Wrapped, not free-running: an unbounded accumulator loses float
        // precision within the hour and the pattern starts visibly stepping.
        // delta is clamped because a backgrounded tab hands back seconds.
        goboAngleRef.current =
          (goboAngleRef.current + spin * TAU * Math.min(delta, 0.1)) % TAU
      }
    } else {
      goboAngleRef.current = 0
    }

    const group = groupRef.current
    if (!group) return
    // One walk of this fixture's subtree, after the rotations above, so the lens
    // and head matrices read below are this frame's.
    group.updateMatrixWorld()

    // The beam leaves the lens, not the base of the yoke. Fallback chain covers
    // PixelStrip (renders per-pixel meshes, never assigns lensRef) and any body
    // with no head node.
    const originObj = lensRef.current ?? head ?? group
    SCRATCH_ORIGIN.setFromMatrixPosition(originObj.matrixWorld)

    // Direction read straight off the model's matrix rather than recomputed in
    // JS. This whole bug family was the beam and the geometry disagreeing;
    // reading one from the other makes that unrepresentable, and it picks up the
    // mount rotation and any rig pose above it for free. transformDirection
    // normalises, so a scaled body doesn't skew the beam.
    const dir = SCRATCH_DIR.set(0, emitAxis, 0).transformDirection(
      (head ?? group).matrixWorld,
    )

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
    // A prism splits the beam into splayed copies. The mid-air column just widens
    // and dims (a hollow shell has no interior to split), while the surface
    // pools get real separated lobes — see the prism block after the cone write.
    const prismFacets = resolvePrismFacets(prismProp, readChannel(vals, beamKeys.prism))
    const coneRadius = prismFacets > 0 ? geom.beamRadius * PRISM_SPREAD : geom.beamRadius
    const coneAlpha = prismFacets > 0 ? coneOpacity * PRISM_CONE_DIM : coneOpacity
    // A prism redistributes the beam's flux, it doesn't add any. The pools are
    // additive, so the centre pool has to give up its share to the lobes or
    // swinging the prism in reads as a brightness jump instead of a split.
    const centreAlpha = prismFacets > 0 ? poolOpacity * PRISM_CENTRE_DIM : poolOpacity

    SCRATCH_CONE_SCALE.set(coneRadius, BEAM_LENGTH, coneRadius)
    SCRATCH_CONE_MAT.compose(SCRATCH_CONE_POS, SCRATCH_QUAT, SCRATCH_CONE_SCALE)
    emitters.writeConeMatrix(slot, SCRATCH_CONE_MAT)
    emitters.writeConeAttrs(slot, SCRATCH_ORIGIN, beamColor, coneAlpha)

    // The head's world X axis gives the gobo a stable cross-section frame.
    SCRATCH_RIGHT.set(1, 0, 0).transformDirection((head ?? group).matrixWorld)
    emitters.writeBeamFx(slot, edge, goboSlot, goboAngleRef.current, SCRATCH_RIGHT)

    updateFloorCookie(
      emitters,
      slot,
      SCRATCH_ORIGIN,
      dir,
      BEAM_LENGTH,
      geom.sinCull,
      geom.floorSide,
    )
    emitters.writeFloorAttrs(
      slot,
      SCRATCH_ORIGIN,
      dir,
      beamColor,
      centreAlpha,
      geom.cosHalfBeam,
    )

    cullRegionCookies(
      emitters,
      slot,
      SCRATCH_ORIGIN,
      dir,
      BEAM_LENGTH,
      geom.cosCull,
      geom.sinCull,
      regionGeometry,
    )
    emitters.writeRegionAttrs(
      slot,
      SCRATCH_ORIGIN,
      dir,
      beamColor,
      centreAlpha,
      geom.cosHalfBeam,
    )

    // Prism lobes borrow this fixture's own wash-pool block. Every slot is
    // allocated MAX_WASH_PIXELS floor + region cookies for pixel strips, and a
    // fixture with a prism is never a strip, so those instances are otherwise
    // idle for its whole lifetime — three splayed lobes for no new buffers and
    // no capacity change. They use the wash material, which has no gobo path:
    // prism and gobo can't combine, much as on the real fixture, where the
    // prism sits after the gobo wheel.
    if (prismFacets > 0) {
      // Beam-local basis, same construction as the gobo's.
      SCRATCH_PRISM_X.copy(SCRATCH_RIGHT)
        .addScaledVector(dir, -SCRATCH_RIGHT.dot(dir))
        .normalize()
      SCRATCH_PRISM_Y.crossVectors(dir, SCRATCH_PRISM_X)

      const splay = MathUtils.degToRad(beamDeg / 2) * PRISM_SPLAY
      const sinS = Math.sin(splay)
      const cosS = Math.cos(splay)
      const lobeGeom = lobeGeomRef.current
      lobeGeom.cosHalf = geom.cosHalfBeam
      lobeGeom.cosCull = geom.cosCull
      lobeGeom.sinCull = geom.sinCull
      lobeGeom.floorSide = geom.floorSide
      const lobeAlpha = poolOpacity * PRISM_LOBE_DIM

      for (let i = 0; i < prismFacets && i < MAX_WASH_PIXELS; i++) {
        const a = (TAU * i) / prismFacets
        SCRATCH_LOBE_DIR.copy(dir)
          .multiplyScalar(cosS)
          .addScaledVector(SCRATCH_PRISM_X, Math.cos(a) * sinS)
          .addScaledVector(SCRATCH_PRISM_Y, Math.sin(a) * sinS)
          .normalize()
        updateWashFloorCookie(emitters, slot, i, SCRATCH_ORIGIN, SCRATCH_LOBE_DIR, lobeGeom)
        emitters.writeWashFloorAttrs(
          slot,
          i,
          SCRATCH_ORIGIN,
          SCRATCH_LOBE_DIR,
          beamColor,
          lobeAlpha,
          lobeGeom.cosHalf,
        )
        writeWashRegionCookies(
          emitters,
          slot,
          i,
          SCRATCH_ORIGIN,
          SCRATCH_LOBE_DIR,
          regionGeometry,
          beamColor,
          lobeAlpha,
          lobeGeom,
        )
      }
      prismLitRef.current = true
    } else if (prismLitRef.current) {
      // Vacate the borrowed block once, on the frame the prism swings out.
      emitters.hideWashSlot(slot)
      prismLitRef.current = false
    }
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
  // The lens is the lamp face (the colour indicator) and is never culled, so it
  // gets the perceptual curve — a linear opacity crushes a dim-but-lit lamp to
  // near-invisible. `hex` is already a full-brightness hue. The lens also stays
  // partially visible at idle (it's the lamp body, not the beam).
  if (refs.lensRef.current) {
    const mat = refs.lensRef.current.material as MeshBasicMaterial
    mat.color.copy(COLOR_TMP)
    mat.opacity = 0.5 + 0.5 * perceptualBrightness(intensity)
    mat.transparent = true
  }
  // Beam cone/pool opacities stay LINEAR: they double as the LIGHT_OFF_OPACITY
  // cull signal downstream, so curving them would resurrect near-off fixtures
  // into ghost beams (the 2D path likewise gates its beam on the raw level).
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
    // reads as dark rather than beaming at full. Hue is normalised to full so a
    // dimmerless fixture at r:20 shows dim orange (via the level) not near-black.
    const intensity = liveDimmerFactor(dimmerProp) * colourFactor(r, g, b, w, a, uv)
    applyColour(computeNormalizedHueCss(r, g, b, w, a, uv), intensity, refs)
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
      // Full-brightness hue so a dim pixel still reads as its colour; the level
      // stays LINEAR because it feeds the LIGHT_OFF_OPACITY wash cull below.
      const ci = colourFactor(m.r, m.g, m.b, m.w, m.a, m.uv) * dimmerFactor
      const hue = computeNormalizedHue(m.r, m.g, m.b, m.w, m.a, m.uv)
      if (writer) {
        PIXEL_COLOR.set(`rgb(${hue.r}, ${hue.g}, ${hue.b})`)
        writer.setPixel(i, PIXEL_COLOR, ci)
      }
      if (wash && i < wash.count) {
        wash.colors[i * 3] = hue.r / 255
        wash.colors[i * 3 + 1] = hue.g / 255
        wash.colors[i * 3 + 2] = hue.b / 255
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
    const beamHue = computeNormalizedHue(group.beamR, group.beamG, group.beamB)
    const state = colorStateRef.current
    state.color.set(`rgb(${beamHue.r}, ${beamHue.g}, ${beamHue.b})`)
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
    // A strip is never a mover, so emitAxis is always -1 here. Read off the
    // matrix, matching useBeamDirector; transformDirection normalises. This hook
    // keeps its own updateWorldMatrix because useBeamDirector returns early when
    // there are no emitters — which is exactly the strip case.
    head.updateWorldMatrix(true, false)
    const dir = SCRATCH_WASH_DIR.set(0, -1, 0).transformDirection(head.matrixWorld)

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
