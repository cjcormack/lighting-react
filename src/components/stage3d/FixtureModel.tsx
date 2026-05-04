import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Euler,
  Group,
  MathUtils,
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
import { NO_RAYCAST } from './raycast'

const DEFAULT_BEAM_DEG = 30
const BEAM_LENGTH = 8 // metres — long enough to cross most stages
const COLOR_TMP = new Color()
const UNIT_Y = new Vector3(0, 1, 0)
const SCRATCH_DIR = new Vector3()
const SCRATCH_NEG_DIR = new Vector3()
const SCRATCH_QUAT = new Quaternion()
const SCRATCH_QUAT_EULER = new Euler()
const SCRATCH_POOL = new Vector3()

interface FixtureModelProps {
  patch: FixturePatch
  fixture: Fixture | undefined
  fixtureType: FixtureTypeInfo | undefined
  riggings: RiggingDto[]
  selected: boolean
  onClick?: (group: Group) => void
}

export function FixtureModel({
  patch,
  fixture,
  fixtureType,
  riggings,
  selected,
  onClick,
}: FixtureModelProps) {
  const colourSource = useMemo(
    () => (fixture?.properties ? findColourSource(fixture.properties) : undefined),
    [fixture?.properties],
  )
  const dimmerProp = useMemo(
    () => findDimmerProperty(fixture?.properties),
    [fixture?.properties],
  )
  const panProp = useMemo(
    () => findPanProperty(fixture?.properties),
    [fixture?.properties],
  )
  const tiltProp = useMemo(
    () => findTiltProperty(fixture?.properties),
    [fixture?.properties],
  )
  const panFineProp = useMemo(
    () => findPanFineProperty(fixture?.properties),
    [fixture?.properties],
  )
  const tiltFineProp = useMemo(
    () => findTiltFineProperty(fixture?.properties),
    [fixture?.properties],
  )
  const gel =
    !colourSource && fixtureType?.acceptsGel && patch.gelCode
      ? findGel(patch.gelCode)
      : null

  const fixturePos = useMemo(() => {
    const v = worldPositionFor(patch, riggings)
    return [v.x, v.y, v.z] as const
  }, [
    patch.worldPositionX,
    patch.worldPositionY,
    patch.worldPositionZ,
    patch.stageX,
    patch.stageY,
    patch.stageZ,
    patch.riggingUuid,
    riggings,
  ])

  const beamDeg = patch.beamAngleDeg ?? DEFAULT_BEAM_DEG
  const beamRadius = BEAM_LENGTH * Math.tan(MathUtils.degToRad(beamDeg / 2))
  const showCone = !!fixtureType?.acceptsBeamAngle

  const headRef = useRef<Group>(null)
  const outerConeRef = useRef<Mesh>(null)
  const innerConeRef = useRef<Mesh>(null)
  const poolOuterRef = useRef<Mesh>(null)
  const poolInnerRef = useRef<Mesh>(null)
  const lensRef = useRef<Mesh>(null)

  // useFrame hot-path: read live pan/tilt sliders, compute beam direction,
  // apply it imperatively to the head/cones/pool refs. No React re-renders.
  // The inner BeamDirector subscribes to the slider hooks; the geometry tree
  // here remains stable so cone/pool refs survive across re-renders driven by
  // colour-source changes.

  return (
    <group
      position={fixturePos}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(e.eventObject as Group) } : undefined}
    >
      {/* yoke base — small dark cylinder */}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.1, 16]} />
        <meshStandardMaterial color="#222" />
      </mesh>

      {/* head group — rotated each frame to track beam direction */}
      <group ref={headRef}>
        <mesh ref={lensRef} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.08, 32]} />
          <meshBasicMaterial color="#fff8d5" side={DoubleSide} />
        </mesh>
        {selected && (
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
            <ringGeometry args={[0.09, 0.11, 32]} />
            <meshBasicMaterial color="#ffffff" side={DoubleSide} />
          </mesh>
        )}
      </group>

      {/* beam cones (outer wider/dim, inner core narrower/brighter). raycast
          disabled — cones are large transparent meshes that would otherwise
          occupy a lot of pointer-test work without ever being click targets;
          fixture clicks bubble up through the lens/yoke to the outer group. */}
      {showCone && (
        <>
          <mesh ref={outerConeRef} raycast={NO_RAYCAST}>
            <coneGeometry args={[beamRadius, BEAM_LENGTH, 48, 1, true]} />
            <meshBasicMaterial
              color="#fff8d5"
              transparent
              opacity={0.08}
              blending={AdditiveBlending}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          <mesh ref={innerConeRef} raycast={NO_RAYCAST}>
            <coneGeometry args={[beamRadius * 0.4, BEAM_LENGTH, 48, 1, true]} />
            <meshBasicMaterial
              color="#fff8d5"
              transparent
              opacity={0.14}
              blending={AdditiveBlending}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
        </>
      )}

      {/* floor pool (outer coloured, inner white hot centre) */}
      {showCone && (
        <>
          <mesh ref={poolOuterRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={NO_RAYCAST}>
            <circleGeometry args={[beamRadius * 1.2, 48]} />
            <meshBasicMaterial
              color="#fff8d5"
              transparent
              opacity={0.33}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh ref={poolInnerRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={NO_RAYCAST}>
            <circleGeometry args={[beamRadius * 0.5, 48]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.22}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}

      <BeamDirector
        panProp={panProp}
        tiltProp={tiltProp}
        panFineProp={panFineProp}
        tiltFineProp={tiltFineProp}
        baseYawDeg={patch.baseYawDeg ?? 0}
        basePitchDeg={patch.basePitchDeg ?? 0}
        fixturePos={fixturePos}
        beamLength={BEAM_LENGTH}
        headRef={headRef}
        outerConeRef={outerConeRef}
        innerConeRef={innerConeRef}
        poolOuterRef={poolOuterRef}
        poolInnerRef={poolInnerRef}
      />

      {/* Colour/intensity is React-rate (channel hooks push at most 30Hz);
          the leaf mounts a single tiny null-renderer that imperatively
          updates lens + cone + pool material colour/opacity via refs. */}
      <ColourSync
        colourSource={colourSource}
        gel={gel}
        dimmerProp={dimmerProp}
        lensRef={lensRef}
        outerConeRef={outerConeRef}
        innerConeRef={innerConeRef}
        poolOuterRef={poolOuterRef}
        poolInnerRef={poolInnerRef}
      />
    </group>
  )
}

// Discriminate the colour source and mount the matching subscriber. Each
// branch keeps its own hook-call order stable. Callers always render
// `<ColourSync>`; only the inner leaf differs.
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

// — beam direction (useFrame hot path) ———————————————————————————————

interface BeamDirectorProps {
  panProp: SliderPropertyDescriptor | undefined
  tiltProp: SliderPropertyDescriptor | undefined
  panFineProp: SliderPropertyDescriptor | undefined
  tiltFineProp: SliderPropertyDescriptor | undefined
  baseYawDeg: number
  basePitchDeg: number
  fixturePos: readonly [number, number, number]
  beamLength: number
  headRef: React.RefObject<Group | null>
  outerConeRef: React.RefObject<Mesh | null>
  innerConeRef: React.RefObject<Mesh | null>
  poolOuterRef: React.RefObject<Mesh | null>
  poolInnerRef: React.RefObject<Mesh | null>
}

const FALLBACK_PAN = makeFallbackSlider('pan')
const FALLBACK_TILT = makeFallbackSlider('tilt')
const FALLBACK_PAN_FINE = makeFallbackSlider('pan_fine')
const FALLBACK_TILT_FINE = makeFallbackSlider('tilt_fine')

// Fine DMX channel resolution: an 8-bit fine channel divides one coarse step
// into 256 sub-steps. Combined value stays in coarse units (0–255 typical) so
// downstream `dmxToDegrees` works without re-scaling.
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

function BeamDirector({
  panProp,
  tiltProp,
  panFineProp,
  tiltFineProp,
  baseYawDeg,
  basePitchDeg,
  fixturePos,
  beamLength,
  headRef,
  outerConeRef,
  innerConeRef,
  poolOuterRef,
  poolInnerRef,
}: BeamDirectorProps) {
  const panRaw = useSliderValue(panProp ?? FALLBACK_PAN)
  const tiltRaw = useSliderValue(tiltProp ?? FALLBACK_TILT)
  const panFineRaw = useSliderValue(panFineProp ?? FALLBACK_PAN_FINE)
  const tiltFineRaw = useSliderValue(tiltFineProp ?? FALLBACK_TILT_FINE)

  // Static fixtures (no pan/tilt sliders) need their head/cone/pool oriented
  // exactly once from the base angles — no per-frame work. We let useFrame
  // run for them on the first tick and then short-circuit; the refs persist
  // across renders so the static transform sticks.
  const isStatic = !panProp && !tiltProp
  const staticAppliedRef = useRef(false)
  useEffect(() => {
    staticAppliedRef.current = false
  }, [panProp, tiltProp, panFineProp, tiltFineProp, baseYawDeg, basePitchDeg, fixturePos, beamLength])

  useFrame(() => {
    if (isStatic && staticAppliedRef.current) return

    const panCombined = combineFine(panProp, panRaw, panFineProp, panFineRaw)
    const tiltCombined = combineFine(tiltProp, tiltRaw, tiltFineProp, tiltFineRaw)
    const panDeg = panProp ? dmxToDegrees(panCombined, panProp, baseYawDeg) : baseYawDeg
    const tiltDeg = tiltProp
      ? dmxToDegrees(tiltCombined, tiltProp, basePitchDeg)
      : basePitchDeg

    // Missing degree metadata → head static, beam straight down.
    const finalPan = panDeg ?? baseYawDeg
    const finalTilt = tiltDeg ?? basePitchDeg

    const dir = panTiltToDir(finalPan, finalTilt, SCRATCH_DIR)

    if (headRef.current) {
      headRef.current.quaternion.copy(
        headQuaternionFor(finalPan, finalTilt, SCRATCH_QUAT, SCRATCH_QUAT_EULER),
      )
    }

    // R3F coneGeometry default: apex at +Y/2, base at -Y/2 (axis along +Y).
    // We want the apex at the fixture origin and the base at +dir*length.
    // Mapping +Y → -dir places the apex at -(length/2)*dir and the base at
    // +(length/2)*dir, so we translate the cone by +(length/2)*dir to land
    // the apex on the origin.
    SCRATCH_NEG_DIR.copy(dir).multiplyScalar(-1)
    if (outerConeRef.current) {
      outerConeRef.current.quaternion.setFromUnitVectors(UNIT_Y, SCRATCH_NEG_DIR)
      outerConeRef.current.position.set(
        (dir.x * beamLength) / 2,
        (dir.y * beamLength) / 2,
        (dir.z * beamLength) / 2,
      )
    }
    if (innerConeRef.current && outerConeRef.current) {
      innerConeRef.current.quaternion.copy(outerConeRef.current.quaternion)
      innerConeRef.current.position.copy(outerConeRef.current.position)
    }

    // Floor pool: where dir intersects y=0 from fixture position.
    if (poolOuterRef.current && poolInnerRef.current) {
      const fixtureY = fixturePos[1]
      if (dir.y < -0.01 && fixtureY > 0) {
        const t = -fixtureY / dir.y
        SCRATCH_POOL.set(
          fixturePos[0] + t * dir.x,
          0.001,
          fixturePos[2] + t * dir.z,
        )
        // Pool meshes are children of the fixture group, so we need to
        // express the pool position relative to the fixture.
        poolOuterRef.current.position.set(
          SCRATCH_POOL.x - fixturePos[0],
          SCRATCH_POOL.y - fixturePos[1],
          SCRATCH_POOL.z - fixturePos[2],
        )
        poolInnerRef.current.position.copy(poolOuterRef.current.position)
        poolOuterRef.current.visible = true
        poolInnerRef.current.visible = true
      } else {
        poolOuterRef.current.visible = false
        poolInnerRef.current.visible = false
      }
    }

    if (isStatic) staticAppliedRef.current = true
  })

  return null
}

// — colour sync (React-rate via property hooks) —————————————————————

interface ColourSyncBaseProps {
  dimmerProp: SliderPropertyDescriptor | undefined
  lensRef: React.RefObject<Mesh | null>
  outerConeRef: React.RefObject<Mesh | null>
  innerConeRef: React.RefObject<Mesh | null>
  poolOuterRef: React.RefObject<Mesh | null>
  poolInnerRef: React.RefObject<Mesh | null>
}

function applyColour(
  hex: string,
  intensity: number,
  refs: ColourSyncBaseProps,
) {
  COLOR_TMP.set(hex)
  const apply = (mesh: Mesh | null, baseOpacity: number, useColour: boolean) => {
    if (!mesh) return
    const mat = mesh.material as MeshBasicMaterial
    if (useColour) mat.color.copy(COLOR_TMP)
    mat.opacity = baseOpacity * intensity
  }
  // Lens uses fixed opacity floor — it's the body of the lamp, visible at idle
  // and brighter at full intensity.
  if (refs.lensRef.current) {
    const mat = refs.lensRef.current.material as MeshBasicMaterial
    mat.color.copy(COLOR_TMP)
    mat.opacity = 0.5 + 0.5 * intensity
    mat.transparent = true
  }
  apply(refs.outerConeRef.current, 0.08, true)
  apply(refs.innerConeRef.current, 0.14, true)
  apply(refs.poolOuterRef.current, 0.33, true)
  // Inner pool stays white (hot core) but tracks intensity so a fully-dimmed
  // fixture goes dark — without this the white centre would persist at dim 0.
  apply(refs.poolInnerRef.current, 0.22, false)
}

// Inner null-renderer that all colour sources funnel through. Effect deps
// limit work to actual visual changes — without them, the effect would re-run
// for every parent re-render (e.g. when a sibling fixture is selected).
function BeamColourSync({ css, intensity, ...refs }: ColourSyncBaseProps & {
  css: string
  intensity: number
}) {
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
