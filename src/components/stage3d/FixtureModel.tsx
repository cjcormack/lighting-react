import { useEffect, useMemo, useRef, useState } from 'react'
import { useCursor } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { StageLabel } from './StageLabel'
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
  ShaderMaterial,
  Vector3,
} from 'three'
import type { StageRegionDto } from '../../api/stageRegionApi'
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
  toThree,
  worldPositionFor,
} from '../../lib/stageCoords'
import { NO_RAYCAST } from './raycast'

const DEFAULT_BEAM_DEG = 30
const BEAM_LENGTH = 8 // metres — long enough to cross most stages
// Floor cookie quad size. Re-centred each frame on the fixture's XZ
// projection so it covers the cone's reachable footprint with minimal
// overdraw; 2× beam length catches any reasonable tilt.
const FLOOR_COOKIE_SIZE = BEAM_LENGTH * 2
const COLOR_TMP = new Color()
const UNIT_Y = new Vector3(0, 1, 0)
const SCRATCH_DIR = new Vector3()
const SCRATCH_NEG_DIR = new Vector3()
const SCRATCH_ORIGIN = new Vector3()
const SCRATCH_QUAT = new Quaternion()
const SCRATCH_QUAT_EULER = new Euler()

// Hollow cone shell, additive, double-sided; alpha biased by abs(N·V) so
// silhouette edges fade. Per-fragment ray-OBB shadow discards fragments
// blocked by regions, which carves the same shape the floor pool projects.
const MAX_BEAM_REGIONS = 8

// Shared GLSL: region uniform declarations + slab-test against a
// yaw-rotated AABB. The slab test returns the entry distance from origin,
// or a negative value if the box is behind the ray OR the origin is inside
// the box (so a fixture mounted on a region still emits).
const REGION_UNIFORMS_GLSL = /* glsl */ `
  uniform int uNumRegions;
  uniform vec3 uRegionCenter[MAX_REGIONS];
  uniform vec3 uRegionHalf[MAX_REGIONS];
  uniform float uRegionYaw[MAX_REGIONS];
`
const RAY_OBB_T_GLSL = /* glsl */ `
  float rayObbT(vec3 origin, vec3 dir, vec3 center, vec3 halfExt, float yaw) {
    vec3 rel = origin - center;
    float c = cos(-yaw); float s = sin(-yaw);
    vec3 lo = vec3(c * rel.x - s * rel.z, rel.y, s * rel.x + c * rel.z);
    vec3 ld = vec3(c * dir.x - s * dir.z, dir.y, s * dir.x + c * dir.z);
    vec3 invD = 1.0 / ld;
    vec3 t1 = (-halfExt - lo) * invD;
    vec3 t2 = ( halfExt - lo) * invD;
    vec3 tmin = min(t1, t2);
    vec3 tmax = max(t1, t2);
    float tNear = max(max(tmin.x, tmin.y), tmin.z);
    float tFar  = min(min(tmax.x, tmax.y), tmax.z);
    if (tNear > tFar || tFar < 0.0 || tNear < 0.0) return -1.0;
    return tNear;
  }
`

const BEAM_VERTEX_SHADER = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  varying vec3 vWorldPos;
  varying float vAlong;
  void main() {
    vAlong = uv.y; // 1 at apex (fixture), 0 at far end
    vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos4.xyz;
    vec4 viewPos4 = viewMatrix * worldPos4;
    vViewPos = viewPos4.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPos4;
  }
`
const BEAM_FRAGMENT_SHADER = /* glsl */ `
  #define MAX_REGIONS ${MAX_BEAM_REGIONS}
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 uBeamOrigin;
  uniform float uFloorY;
  ${REGION_UNIFORMS_GLSL}

  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  varying vec3 vWorldPos;
  varying float vAlong;

  ${RAY_OBB_T_GLSL}

  void main() {
    if (vWorldPos.y < uFloorY) discard;

    vec3 toFrag = vWorldPos - uBeamOrigin;
    float fragDist = length(toFrag);

    // Discard if the ray from origin through this fragment hits an obstacle
    // first. Rays going *through* an obstacle drop out (cone has a hole
    // matching the obstacle's silhouette); rays that skirt it stay visible.
    // Matches the floor pool's footprint so cone-in-air and surface pool
    // agree on where light reaches.
    if (uNumRegions > 0 && fragDist > 0.0001) {
      vec3 rayDir = toFrag / fragDist;
      for (int i = 0; i < MAX_REGIONS; i++) {
        if (i >= uNumRegions) break;
        float t = rayObbT(uBeamOrigin, rayDir, uRegionCenter[i], uRegionHalf[i], uRegionYaw[i]);
        // 1cm bias avoids self-occlusion on rays that graze a region face.
        if (t > 0.0 && t < fragDist - 0.01) discard;
      }
    }

    vec3 V = normalize(-vViewPos);
    float ndotv = abs(dot(normalize(vViewNormal), V));
    float radial = pow(ndotv, 0.7);
    float lengthFade = mix(0.18, 0.9, vAlong);
    float a = uOpacity * radial * lengthFade;
    gl_FragColor = vec4(uColor, a);
  }
`

function makeBeamMaterial(): ShaderMaterial {
  const regionCenter = Array.from({ length: MAX_BEAM_REGIONS }, () => new Vector3())
  const regionHalf = Array.from({ length: MAX_BEAM_REGIONS }, () => new Vector3())
  const regionYaw = new Array<number>(MAX_BEAM_REGIONS).fill(0)
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color('#fff8d5') },
      uOpacity: { value: 0.0 },
      uBeamOrigin: { value: new Vector3() },
      uFloorY: { value: 0.0 },
      uNumRegions: { value: 0 },
      uRegionCenter: { value: regionCenter },
      uRegionHalf: { value: regionHalf },
      uRegionYaw: { value: regionYaw },
    },
    vertexShader: BEAM_VERTEX_SHADER,
    fragmentShader: BEAM_FRAGMENT_SHADER,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
}

// Cookie quad projected onto a surface (floor or region top). The fragment
// shader keeps only fragments inside the cone's solid angle and not shadowed
// by any region — so the pool naturally splits across surfaces and across
// shadow boundaries.
const POOL_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const POOL_FRAGMENT_SHADER = /* glsl */ `
  #define MAX_REGIONS ${MAX_BEAM_REGIONS}
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 uBeamOrigin;
  uniform vec3 uBeamDir;
  uniform float uCosHalfAngle;
  uniform float uMaxDist;
  ${REGION_UNIFORMS_GLSL}

  varying vec3 vWorldPos;

  ${RAY_OBB_T_GLSL}

  void main() {
    vec3 toFrag = vWorldPos - uBeamOrigin;
    float fragDist = length(toFrag);
    if (fragDist > uMaxDist || fragDist < 0.001) discard;
    vec3 rayDir = toFrag / fragDist;

    float cosAngle = dot(rayDir, uBeamDir);
    if (cosAngle < uCosHalfAngle) discard;

    if (uNumRegions > 0) {
      for (int i = 0; i < MAX_REGIONS; i++) {
        if (i >= uNumRegions) break;
        float t = rayObbT(uBeamOrigin, rayDir, uRegionCenter[i], uRegionHalf[i], uRegionYaw[i]);
        if (t > 0.0 && t < fragDist - 0.01) discard;
      }
    }

    float radial = (cosAngle - uCosHalfAngle) / max(0.0001, 1.0 - uCosHalfAngle);
    radial = pow(radial, 0.7);

    // Mild distance fade — pools at full throw stay readable; never goes to 0.
    float distFade = mix(1.0, 0.55, clamp(fragDist / uMaxDist, 0.0, 1.0));

    // Hot white core blended over the gel colour at the centre.
    float core = pow(radial, 4.0);
    vec3 finalColor = mix(uColor, vec3(1.0), core * 0.5);

    float a = uOpacity * radial * distFade;
    gl_FragColor = vec4(finalColor, a);
  }
`

function makePoolMaterial(): ShaderMaterial {
  const regionCenter = Array.from({ length: MAX_BEAM_REGIONS }, () => new Vector3())
  const regionHalf = Array.from({ length: MAX_BEAM_REGIONS }, () => new Vector3())
  const regionYaw = new Array<number>(MAX_BEAM_REGIONS).fill(0)
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color('#fff8d5') },
      uOpacity: { value: 0.0 },
      uBeamOrigin: { value: new Vector3() },
      uBeamDir: { value: new Vector3(0, -1, 0) },
      uCosHalfAngle: { value: Math.cos(MathUtils.degToRad(15)) },
      uMaxDist: { value: 8 },
      uNumRegions: { value: 0 },
      uRegionCenter: { value: regionCenter },
      uRegionHalf: { value: regionHalf },
      uRegionYaw: { value: regionYaw },
    },
    vertexShader: POOL_VERTEX_SHADER,
    fragmentShader: POOL_FRAGMENT_SHADER,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
}

interface FixtureModelProps {
  patch: FixturePatch
  fixture: Fixture | undefined
  fixtureType: FixtureTypeInfo | undefined
  riggings: RiggingDto[]
  regions: StageRegionDto[]
  selected: boolean
  editMode?: boolean
  showLabel?: boolean
  showBeamCones?: boolean
  onClick?: (group: Group) => void
}

export function FixtureModel({
  patch,
  fixture,
  fixtureType,
  riggings,
  regions,
  selected,
  editMode,
  showLabel,
  showBeamCones = true,
  onClick,
}: FixtureModelProps) {
  const [hovered, setHovered] = useState(false)
  useCursor(!!editMode && hovered)
  const active = selected || (!!editMode && hovered)
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
  const showCone = showBeamCones && !!fixtureType?.acceptsBeamAngle

  const groupRef = useRef<Group>(null)
  const headRef = useRef<Group>(null)
  const beamConeRef = useRef<Mesh>(null)
  const floorPoolRef = useRef<Mesh>(null)
  const lensRef = useRef<Mesh>(null)

  const beamMaterial = useMemo(() => makeBeamMaterial(), [])
  const poolMaterial = useMemo(() => makePoolMaterial(), [])
  useEffect(() => () => beamMaterial.dispose(), [beamMaterial])
  useEffect(() => () => poolMaterial.dispose(), [poolMaterial])

  useEffect(() => {
    poolMaterial.uniforms.uCosHalfAngle.value = Math.cos(MathUtils.degToRad(beamDeg / 2))
    poolMaterial.uniforms.uMaxDist.value = BEAM_LENGTH
  }, [beamDeg, poolMaterial])

  // Region OBBs for shader-side ray-OBB tests. Footprint is the floor
  // anchor lifted by h/2 — matches `StageRegionMeshes` box placement.
  const regionObbs = useMemo<RegionObb[]>(() => {
    return regions.map((r) => {
      const w = r.widthM ?? 1
      const d = r.depthM ?? 1
      const h = r.heightM ?? 1
      const centre = toThree(r.centerX ?? 0, r.centerY ?? 0, (r.centerZ ?? 0) + h / 2)
      return {
        centerX: centre.x,
        centerY: centre.y,
        centerZ: centre.z,
        halfX: w / 2,
        halfY: h / 2,
        halfZ: d / 2,
        yawRad: MathUtils.degToRad(r.yawDeg ?? 0),
      }
    })
  }, [regions])

  // Push region OBBs into both materials' uniforms.
  useEffect(() => {
    const count = Math.min(regionObbs.length, MAX_BEAM_REGIONS)
    for (const mat of [beamMaterial, poolMaterial]) {
      const u = mat.uniforms
      for (let i = 0; i < count; i++) {
        const o = regionObbs[i]
        ;(u.uRegionCenter.value as Vector3[])[i].set(o.centerX, o.centerY, o.centerZ)
        ;(u.uRegionHalf.value as Vector3[])[i].set(o.halfX, o.halfY, o.halfZ)
        ;(u.uRegionYaw.value as number[])[i] = o.yawRad
      }
      u.uNumRegions.value = count
    }
  }, [regionObbs, beamMaterial, poolMaterial])

  useBeamDirector({
    panProp,
    tiltProp,
    panFineProp,
    tiltFineProp,
    baseYawDeg: patch.baseYawDeg ?? 0,
    basePitchDeg: patch.basePitchDeg ?? 0,
    beamLength: BEAM_LENGTH,
    groupRef,
    headRef,
    beamConeRef,
    floorPoolRef,
    beamMaterial,
    poolMaterial,
  })

  return (
    <>
      <group
        ref={groupRef}
        position={fixturePos}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick(e.eventObject as Group) } : undefined}
        onPointerOver={editMode ? (e) => { e.stopPropagation(); setHovered(true) } : undefined}
        onPointerOut={editMode ? () => setHovered(false) : undefined}
      >
        {/* yoke base — kept brighter than the canvas so the mount point reads against the floor. */}
        <mesh position={[0, -0.05, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 0.1, 16]} />
          <meshStandardMaterial color={active ? '#9aa5b4' : '#6a7280'} />
        </mesh>

        {/* Lens is a sphere so it stays visible from any camera angle — a
            flat disc went edge-on during orbit and bloom-flickered. */}
        <group ref={headRef}>
          <mesh ref={lensRef}>
            <sphereGeometry args={[0.07, 16, 12]} />
            <meshBasicMaterial color="#fff8d5" />
          </mesh>
          {active && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.1, 0.012, 12, 32]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          )}
        </group>

        {showLabel && (
          <StageLabel position={[0, 0.18, 0]}>{patch.displayName}</StageLabel>
        )}

        {/* raycast disabled — large transparent mesh, never a click target;
            clicks bubble through the lens/yoke to the outer group. */}
        {showCone && (
          <mesh ref={beamConeRef} material={beamMaterial} raycast={NO_RAYCAST}>
            <coneGeometry args={[beamRadius, BEAM_LENGTH, 48, 1, true]} />
          </mesh>
        )}

        <ColourSync
          key={showCone ? 'cones' : 'lens'}
          colourSource={colourSource}
          gel={gel}
          dimmerProp={dimmerProp}
          lensRef={lensRef}
          beamConeRef={beamConeRef}
          poolMaterial={poolMaterial}
        />
      </group>

      {/* Pool cookies live in world coords (outside the fixture group). The
          group's local positions can lag during a TransformControls drag —
          TC mutates THREE state directly, bypassing React. */}
      {showCone && (
        <>
          <mesh
            ref={floorPoolRef}
            rotation={[-Math.PI / 2, 0, 0]}
            material={poolMaterial}
            raycast={NO_RAYCAST}
          >
            <planeGeometry args={[FLOOR_COOKIE_SIZE, FLOOR_COOKIE_SIZE]} />
          </mesh>
          {regions.map((r) => {
            const w = r.widthM ?? 1
            const d = r.depthM ?? 1
            const h = r.heightM ?? 1
            const top = toThree(r.centerX ?? 0, r.centerY ?? 0, (r.centerZ ?? 0) + h + 0.001)
            // Outer group rotates the horizontal plane around +Y by the
            // region's yaw; inner mesh flips the plane flat. Two stages
            // because Euler order would otherwise apply the flip first.
            return (
              <group
                key={r.uuid}
                position={[top.x, top.y, top.z]}
                rotation={[0, MathUtils.degToRad(r.yawDeg ?? 0), 0]}
              >
                <mesh rotation={[-Math.PI / 2, 0, 0]} material={poolMaterial} raycast={NO_RAYCAST}>
                  <planeGeometry args={[w, d]} />
                </mesh>
              </group>
            )
          })}
        </>
      )}
    </>
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

interface RegionObb {
  centerX: number
  centerY: number
  centerZ: number
  halfX: number
  halfY: number
  halfZ: number
  yawRad: number
}

interface BeamDirectorOpts {
  panProp: SliderPropertyDescriptor | undefined
  tiltProp: SliderPropertyDescriptor | undefined
  panFineProp: SliderPropertyDescriptor | undefined
  tiltFineProp: SliderPropertyDescriptor | undefined
  baseYawDeg: number
  basePitchDeg: number
  beamLength: number
  groupRef: React.RefObject<Group | null>
  headRef: React.RefObject<Group | null>
  beamConeRef: React.RefObject<Mesh | null>
  floorPoolRef: React.RefObject<Mesh | null>
  beamMaterial: ShaderMaterial
  poolMaterial: ShaderMaterial
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

// Per-frame: decode pan/tilt to a beam direction, point the head + cone
// along it, and feed the shaders the fixture's live world origin. Origin
// has to come from the THREE group (not the React `fixturePos` prop) —
// TransformControls mutates the group position directly during drag and
// the React state lags by a tick.
function useBeamDirector({
  panProp,
  tiltProp,
  panFineProp,
  tiltFineProp,
  baseYawDeg,
  basePitchDeg,
  beamLength,
  groupRef,
  headRef,
  beamConeRef,
  floorPoolRef,
  beamMaterial,
  poolMaterial,
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

    SCRATCH_NEG_DIR.copy(dir).multiplyScalar(-1)
    if (beamConeRef.current) {
      beamConeRef.current.quaternion.setFromUnitVectors(UNIT_Y, SCRATCH_NEG_DIR)
      beamConeRef.current.position.set(
        (dir.x * beamLength) / 2,
        (dir.y * beamLength) / 2,
        (dir.z * beamLength) / 2,
      )
    }

    if (groupRef.current) {
      groupRef.current.updateMatrixWorld()
      groupRef.current.getWorldPosition(SCRATCH_ORIGIN)
      ;(beamMaterial.uniforms.uBeamOrigin.value as Vector3).copy(SCRATCH_ORIGIN)
      ;(poolMaterial.uniforms.uBeamOrigin.value as Vector3).copy(SCRATCH_ORIGIN)
      // Floor cookie quad follows the fixture's XZ so it stays small.
      if (floorPoolRef.current) {
        floorPoolRef.current.position.set(SCRATCH_ORIGIN.x, 0.001, SCRATCH_ORIGIN.z)
      }
    }
    ;(poolMaterial.uniforms.uBeamDir.value as Vector3).copy(dir)
  })
}


// — colour sync (React-rate via property hooks) —————————————————————

interface ColourSyncBaseProps {
  dimmerProp: SliderPropertyDescriptor | undefined
  lensRef: React.RefObject<Mesh | null>
  beamConeRef: React.RefObject<Mesh | null>
  poolMaterial: ShaderMaterial
}

function applyColour(
  hex: string,
  intensity: number,
  refs: ColourSyncBaseProps,
) {
  COLOR_TMP.set(hex)
  // Lens stays partially visible at idle (it's the lamp body, not the beam).
  if (refs.lensRef.current) {
    const mat = refs.lensRef.current.material as MeshBasicMaterial
    mat.color.copy(COLOR_TMP)
    mat.opacity = 0.5 + 0.5 * intensity
    mat.transparent = true
  }
  if (refs.beamConeRef.current) {
    const mat = refs.beamConeRef.current.material as ShaderMaterial
    mat.uniforms.uColor.value.copy(COLOR_TMP)
    mat.uniforms.uOpacity.value = 0.32 * intensity
  }
  const u = refs.poolMaterial.uniforms
  u.uColor.value.copy(COLOR_TMP)
  u.uOpacity.value = 0.55 * intensity
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
