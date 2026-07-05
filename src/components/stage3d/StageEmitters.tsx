import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'
import type { StageRegionDto } from '../../api/stageRegionApi'
import { toThree } from '../../lib/stageCoords'
import { NO_RAYCAST } from './raycast'
import { HAZE_LEVEL } from './washConfig'

export const MAX_BEAM_REGIONS = 16
export const BEAM_LENGTH = 8
export const COOKIE_LIFT_M = 0.001

// Per-fixture cap on independently-washed pixels. A strip slot owns a
// contiguous block of this many wash-pool instances (floor + per region);
// fixtures with fewer pixels leave the tail hidden, more pixels are clamped.
export const MAX_WASH_PIXELS = 16

const REGION_UNIFORMS_GLSL = /* glsl */ `
  uniform int uNumRegions;
  uniform vec3 uRegionCenter[MAX_REGIONS];
  uniform vec3 uRegionHalf[MAX_REGIONS];
  uniform vec2 uRegionYawCs[MAX_REGIONS];
`

const RAY_OBB_T_GLSL = /* glsl */ `
  float rayObbT(vec3 origin, vec3 dir, vec3 center, vec3 halfExt, vec2 yawCs) {
    vec3 rel = origin - center;
    float c = yawCs.x; float s = yawCs.y;
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

// Hollow cone shell, additive, double-sided; alpha biased by abs(N·V) so
// silhouette edges fade. Per-fragment ray-OBB shadow discards fragments
// blocked by regions, which carves the same shape the floor pool projects.
// Per-fixture origin/color/opacity arrive via instance attributes.
const CONE_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aBeamOrigin;
  attribute vec3 aColor;
  attribute float aOpacity;

  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  varying vec3 vWorldPos;
  varying float vAlong;
  varying vec3 vColor;
  varying float vOpacity;
  varying vec3 vBeamOrigin;

  void main() {
    vAlong = uv.y;

    vec4 worldPos4 = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = worldPos4.xyz;
    vec4 viewPos4 = viewMatrix * worldPos4;
    vViewPos = viewPos4.xyz;

    // Normal transform that tolerates non-uniform scale on the instance
    // matrix (cone scale is (R, L, R) where L >> R for narrow beams).
    mat3 m = mat3(instanceMatrix);
    vec3 transformedNormal = normal / vec3(
      dot(m[0], m[0]),
      dot(m[1], m[1]),
      dot(m[2], m[2])
    );
    transformedNormal = m * transformedNormal;
    vViewNormal = normalize(normalMatrix * transformedNormal);

    vColor = aColor;
    vOpacity = aOpacity;
    vBeamOrigin = aBeamOrigin;

    gl_Position = projectionMatrix * viewPos4;
  }
`

const CONE_FRAGMENT_SHADER = /* glsl */ `
  #define MAX_REGIONS ${MAX_BEAM_REGIONS}
  uniform float uFloorY;
  uniform float uHaze;
  ${REGION_UNIFORMS_GLSL}

  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  varying vec3 vWorldPos;
  varying float vAlong;
  varying vec3 vColor;
  varying float vOpacity;
  varying vec3 vBeamOrigin;

  ${RAY_OBB_T_GLSL}

  void main() {
    if (vWorldPos.y < uFloorY) discard;

    vec3 toFrag = vWorldPos - vBeamOrigin;
    float fragDist = length(toFrag);

    if (uNumRegions > 0 && fragDist > 0.0001) {
      vec3 rayDir = toFrag / fragDist;
      for (int i = 0; i < MAX_REGIONS; i++) {
        if (i >= uNumRegions) break;
        float t = rayObbT(vBeamOrigin, rayDir, uRegionCenter[i], uRegionHalf[i], uRegionYawCs[i]);
        if (t > 0.0 && t < fragDist - 0.01) discard;
      }
    }

    vec3 V = normalize(-vViewPos);
    float ndotv = abs(dot(normalize(vViewNormal), V));
    float radial = pow(ndotv, 0.7);
    float lengthFade = mix(0.18, 0.9, vAlong);
    // uHaze scales the mid-air beam volume (atmosphere). 1.0 preserves the
    // pre-haze look; 0.0 leaves only the surface pools (a hazeless room).
    float a = vOpacity * radial * lengthFade * uHaze;
    gl_FragColor = vec4(vColor, a);
  }
`

// Cookie quad projected onto a surface (floor or region top). Used by both
// the floor InstancedMesh and the region-top InstancedMesh — same shader,
// only the per-instance geometry differs (placement is in the instance
// matrix). `aVisible < 0.5` lets the region mesh hide individual cookies
// without rewriting their matrices each frame.
const POOL_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aBeamOrigin;
  attribute vec3 aBeamDir;
  attribute vec3 aColor;
  attribute float aOpacity;
  attribute float aCosHalfAngle;
  attribute float aVisible;

  varying vec3 vWorldPos;
  varying vec3 vBeamOrigin;
  varying vec3 vBeamDir;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vCosHalfAngle;

  void main() {
    if (aVisible < 0.5) {
      // Send out of clip volume; rasterizer rejects all fragments.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;

    vBeamOrigin = aBeamOrigin;
    vBeamDir = aBeamDir;
    vColor = aColor;
    vOpacity = aOpacity;
    vCosHalfAngle = aCosHalfAngle;

    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const POOL_FRAGMENT_SHADER = /* glsl */ `
  #define MAX_REGIONS ${MAX_BEAM_REGIONS}
  uniform float uMaxDist;
  uniform float uCoreBoost;
  ${REGION_UNIFORMS_GLSL}

  varying vec3 vWorldPos;
  varying vec3 vBeamOrigin;
  varying vec3 vBeamDir;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vCosHalfAngle;

  ${RAY_OBB_T_GLSL}

  void main() {
    vec3 toFrag = vWorldPos - vBeamOrigin;
    float fragDist = length(toFrag);
    if (fragDist > uMaxDist || fragDist < 0.001) discard;
    vec3 rayDir = toFrag / fragDist;

    float cosAngle = dot(rayDir, vBeamDir);
    if (cosAngle < vCosHalfAngle) discard;

    if (uNumRegions > 0) {
      for (int i = 0; i < MAX_REGIONS; i++) {
        if (i >= uNumRegions) break;
        float t = rayObbT(vBeamOrigin, rayDir, uRegionCenter[i], uRegionHalf[i], uRegionYawCs[i]);
        if (t > 0.0 && t < fragDist - 0.01) discard;
      }
    }

    float radial = (cosAngle - vCosHalfAngle) / max(0.0001, 1.0 - vCosHalfAngle);
    radial = pow(radial, 0.7);

    float distFade = mix(1.0, 0.55, clamp(fragDist / uMaxDist, 0.0, 1.0));

    // Core white-hot boost for a beam's hotspot. Disabled (uCoreBoost=0) for
    // wash pools so overlapping per-pixel colours stay coloured, not white.
    float core = pow(radial, 4.0);
    vec3 finalColor = mix(vColor, vec3(1.0), core * uCoreBoost);

    float a = vOpacity * radial * distFade;
    gl_FragColor = vec4(finalColor, a);
  }
`

function makeRegionUniforms() {
  return {
    uNumRegions: { value: 0 },
    uRegionCenter: {
      value: Array.from({ length: MAX_BEAM_REGIONS }, () => new Vector3()),
    },
    uRegionHalf: {
      value: Array.from({ length: MAX_BEAM_REGIONS }, () => new Vector3()),
    },
    uRegionYawCs: {
      value: Array.from({ length: MAX_BEAM_REGIONS }, () => new Vector2(1, 0)),
    },
  }
}

function makeConeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uFloorY: { value: 0.0 },
      uHaze: { value: HAZE_LEVEL },
      ...makeRegionUniforms(),
    },
    vertexShader: CONE_VERTEX_SHADER,
    fragmentShader: CONE_FRAGMENT_SHADER,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
}

function makePoolMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMaxDist: { value: BEAM_LENGTH },
      uCoreBoost: { value: 0.5 },
      ...makeRegionUniforms(),
    },
    vertexShader: POOL_VERTEX_SHADER,
    fragmentShader: POOL_FRAGMENT_SHADER,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
}

export interface RegionGeometry {
  uuid: string
  widthM: number
  depthM: number
  yawRad: number
  // OBB lifted to h/2 — feeds shader uRegion* uniforms for ray-OBB shadow tests.
  obbCenter: Vector3
  obbHalfX: number
  obbHalfY: number
  obbHalfZ: number
  // Top-face centre + bounding-sphere radius — feeds the per-frame cookie cull.
  topCenter: Vector3
  topBoundingRadius: number
}

export function computeRegionGeometry(regions: StageRegionDto[]): RegionGeometry[] {
  return regions.map((r) => {
    const w = r.widthM ?? 1
    const d = r.depthM ?? 1
    const h = r.heightM ?? 1
    const cz = r.centerZ ?? 0
    const obbCenter = toThree(r.centerX ?? 0, r.centerY ?? 0, cz + h / 2)
    const topCenter = toThree(r.centerX ?? 0, r.centerY ?? 0, cz + h + COOKIE_LIFT_M)
    return {
      uuid: r.uuid,
      widthM: w,
      depthM: d,
      yawRad: MathUtils.degToRad(r.yawDeg ?? 0),
      obbCenter,
      obbHalfX: w / 2,
      obbHalfY: h / 2,
      obbHalfZ: d / 2,
      topCenter,
      topBoundingRadius: Math.hypot(w / 2, d / 2),
    }
  })
}

// Per-fixture emitter writes, called from FixtureModel's per-frame loop.
// All writes target a slot index allocated to the fixture by the controller.
// Buffer needsUpdate flags are marked dirty centrally by the controller's
// own useFrame so the caller doesn't have to.
export interface EmittersHandle {
  fixtureCount: number
  regionCount: number

  writeConeMatrix(slot: number, matrix: Matrix4): void
  writeConeAttrs(slot: number, origin: Vector3, color: Color, opacity: number): void

  writeFloorMatrix(slot: number, visible: boolean, cx: number, cz: number, side: number): void
  writeFloorAttrs(
    slot: number,
    origin: Vector3,
    dir: Vector3,
    color: Color,
    opacity: number,
    cosHalfAngle: number,
  ): void

  writeRegionVisibility(slot: number, regionIdx: number, visible: boolean): void
  writeRegionAttrs(
    slot: number,
    origin: Vector3,
    dir: Vector3,
    color: Color,
    opacity: number,
    cosHalfAngle: number,
  ): void

  // — per-pixel wash pools (strip/bar fixtures) —————————————————————
  // A strip slot owns a block of MAX_WASH_PIXELS pool instances on the floor
  // and (× regionCount) on region tops. Each pixel is independent: its own
  // origin, direction, colour, opacity and footprint matrix.
  writeWashFloorMatrix(
    slot: number,
    pixelIdx: number,
    visible: boolean,
    cx: number,
    cz: number,
    side: number,
  ): void
  writeWashFloorAttrs(
    slot: number,
    pixelIdx: number,
    origin: Vector3,
    dir: Vector3,
    color: Color,
    opacity: number,
    cosHalfAngle: number,
  ): void
  writeWashRegionVisibility(
    slot: number,
    pixelIdx: number,
    regionIdx: number,
    visible: boolean,
  ): void
  writeWashRegionAttrs(
    slot: number,
    pixelIdx: number,
    origin: Vector3,
    dir: Vector3,
    color: Color,
    opacity: number,
    cosHalfAngle: number,
  ): void

  // Zero-scale all of a slot's matrices + clear all its region visibilities.
  // Called when a fixture is functionally off.
  hideSlot(slot: number): void
  // Same, for a strip slot's whole wash block (all MAX_WASH_PIXELS pixels).
  hideWashSlot(slot: number): void
}

const EmittersContext = createContext<EmittersHandle | null>(null)

export function useEmitters(): EmittersHandle | null {
  return useContext(EmittersContext)
}

interface StageEmittersProps {
  fixtureCount: number
  regionGeometry: ReadonlyArray<RegionGeometry>
  children: React.ReactNode
}

// Stage-level controller owning the three InstancedMesh objects (cone,
// floor cookie, region cookie). Allocates per-instance attribute buffers
// sized to fixtureCount × regionCount, then exposes an imperative write
// handle so each FixtureModel can populate its slot without taking on the
// mesh state itself.
export function StageEmitters({ fixtureCount, regionGeometry, children }: StageEmittersProps) {
  const regionCount = Math.min(regionGeometry.length, MAX_BEAM_REGIONS)

  const coneMaterial = useMemo(makeConeMaterial, [])
  const poolMaterial = useMemo(makePoolMaterial, [])
  // Wash pools reuse the pool shader but drop the white hotspot boost so a bar's
  // overlapping per-pixel colours blend as colour, not white.
  const washPoolMaterial = useMemo(() => {
    const m = makePoolMaterial()
    m.uniforms.uCoreBoost.value = 0
    return m
  }, [])
  useEffect(() => () => coneMaterial.dispose(), [coneMaterial])
  useEffect(() => () => poolMaterial.dispose(), [poolMaterial])
  useEffect(() => () => washPoolMaterial.dispose(), [washPoolMaterial])

  // Shared region OBB uniforms — sync into both materials whenever the
  // region layout changes. Pre-bake yaw into a cos/sin pair so the shader
  // skips per-fragment trig.
  useEffect(() => {
    for (const mat of [coneMaterial, poolMaterial, washPoolMaterial]) {
      const u = mat.uniforms
      const centers = u.uRegionCenter.value as Vector3[]
      const halves = u.uRegionHalf.value as Vector3[]
      const yawCs = u.uRegionYawCs.value as Vector2[]
      for (let i = 0; i < regionCount; i++) {
        const r = regionGeometry[i]
        centers[i].copy(r.obbCenter)
        halves[i].set(r.obbHalfX, r.obbHalfY, r.obbHalfZ)
        yawCs[i].set(Math.cos(-r.yawRad), Math.sin(-r.yawRad))
      }
      u.uNumRegions.value = regionCount
    }
  }, [coneMaterial, poolMaterial, regionGeometry, regionCount])

  // Pre-allocate buffers + InstancedMesh objects sized to fixtureCount and
  // (fixtureCount × regionCount). Rebuilds when either count changes; in
  // practice this only happens when patches or regions are added/removed.
  const built = useMemo(
    () =>
      buildEmitters(
        fixtureCount,
        regionCount,
        regionGeometry,
        coneMaterial,
        poolMaterial,
        washPoolMaterial,
      ),
    [fixtureCount, regionCount, regionGeometry, coneMaterial, poolMaterial, washPoolMaterial],
  )

  useEffect(
    () => () => {
      built.coneMesh.dispose()
      built.floorMesh.dispose()
      built.regionMesh.dispose()
      built.washFloorMesh.dispose()
      built.washRegionMesh.dispose()
      built.coneMesh.geometry.dispose()
      built.floorMesh.geometry.dispose()
      built.regionMesh.geometry.dispose()
      built.washFloorMesh.geometry.dispose()
      built.washRegionMesh.geometry.dispose()
    },
    [built],
  )

  const handle = useMemo<EmittersHandle>(() => makeHandle(built), [built])
  const handleRef = useRef(handle)
  handleRef.current = handle

  // Mark every per-fixture attribute dirty once per frame after all
  // FixtureModel useFrames have run. Cheap (just bit flips) and avoids 50
  // FixtureModels each setting the same needsUpdate flags.
  useFrame(() => {
    const m = built
    m.coneMesh.instanceMatrix.needsUpdate = true
    m.coneOrigin.needsUpdate = true
    m.coneColor.needsUpdate = true
    m.coneOpacity.needsUpdate = true

    m.floorMesh.instanceMatrix.needsUpdate = true
    m.floorOrigin.needsUpdate = true
    m.floorDir.needsUpdate = true
    m.floorColor.needsUpdate = true
    m.floorOpacity.needsUpdate = true
    m.floorCosHalfAngle.needsUpdate = true

    m.regionOrigin.needsUpdate = true
    m.regionDir.needsUpdate = true
    m.regionColor.needsUpdate = true
    m.regionOpacity.needsUpdate = true
    m.regionCosHalfAngle.needsUpdate = true
    m.regionVisible.needsUpdate = true

    m.washFloorMesh.instanceMatrix.needsUpdate = true
    m.washFloorOrigin.needsUpdate = true
    m.washFloorDir.needsUpdate = true
    m.washFloorColor.needsUpdate = true
    m.washFloorOpacity.needsUpdate = true
    m.washFloorCosHalfAngle.needsUpdate = true

    m.washRegionOrigin.needsUpdate = true
    m.washRegionDir.needsUpdate = true
    m.washRegionColor.needsUpdate = true
    m.washRegionOpacity.needsUpdate = true
    m.washRegionCosHalfAngle.needsUpdate = true
    m.washRegionVisible.needsUpdate = true
  }, 1)

  return (
    <>
      <primitive object={built.coneMesh} raycast={NO_RAYCAST} />
      <primitive object={built.floorMesh} raycast={NO_RAYCAST} />
      <primitive object={built.regionMesh} raycast={NO_RAYCAST} />
      <primitive object={built.washFloorMesh} raycast={NO_RAYCAST} />
      <primitive object={built.washRegionMesh} raycast={NO_RAYCAST} />
      <EmittersContext.Provider value={handle}>{children}</EmittersContext.Provider>
    </>
  )
}

interface BuiltEmitters {
  fixtureCount: number
  regionCount: number
  coneMesh: InstancedMesh
  floorMesh: InstancedMesh
  regionMesh: InstancedMesh

  coneOrigin: InstancedBufferAttribute
  coneColor: InstancedBufferAttribute
  coneOpacity: InstancedBufferAttribute

  floorOrigin: InstancedBufferAttribute
  floorDir: InstancedBufferAttribute
  floorColor: InstancedBufferAttribute
  floorOpacity: InstancedBufferAttribute
  floorCosHalfAngle: InstancedBufferAttribute

  // Per-fixture attribute buffers — divisor=regionCount so each fixture's
  // value applies to all regionCount of its cookie instances.
  regionOrigin: InstancedBufferAttribute
  regionDir: InstancedBufferAttribute
  regionColor: InstancedBufferAttribute
  regionOpacity: InstancedBufferAttribute
  regionCosHalfAngle: InstancedBufferAttribute
  // Per-(fixture, region) visibility — divisor=1.
  regionVisible: InstancedBufferAttribute

  // Wash floor pools — one instance per (fixture, pixel); every attribute is
  // per-instance (divisor=1) since each pixel washes independently. Hidden via
  // a zero-scale matrix (aVisible is a constant 1 here, like floorMesh).
  washFloorMesh: InstancedMesh
  washFloorOrigin: InstancedBufferAttribute
  washFloorDir: InstancedBufferAttribute
  washFloorColor: InstancedBufferAttribute
  washFloorOpacity: InstancedBufferAttribute
  washFloorCosHalfAngle: InstancedBufferAttribute

  // Wash region cookies — one instance per (fixture, pixel, region). The
  // per-pixel attrs use divisor=regionCount (each pixel's value repeats across
  // its region instances); visibility is per-instance (divisor=1).
  washRegionMesh: InstancedMesh
  washRegionOrigin: InstancedBufferAttribute
  washRegionDir: InstancedBufferAttribute
  washRegionColor: InstancedBufferAttribute
  washRegionOpacity: InstancedBufferAttribute
  washRegionCosHalfAngle: InstancedBufferAttribute
  washRegionVisible: InstancedBufferAttribute
}

function buildEmitters(
  fixtureCount: number,
  regionCount: number,
  regionGeometry: ReadonlyArray<RegionGeometry>,
  coneMaterial: ShaderMaterial,
  poolMaterial: ShaderMaterial,
  washPoolMaterial: ShaderMaterial,
): BuiltEmitters {
  // Buffer capacity must be ≥1 even when nothing draws yet — Three.js' WebGL
  // backend can't bind zero-sized instance buffers. Draw count comes from
  // mesh.count, which can still be 0.
  const fixCap = Math.max(fixtureCount, 1)
  const regDivisor = Math.max(regionCount, 1)
  const regCap = fixCap * regDivisor

  const coneGeo = new ConeGeometry(1, 1, 48, 1, true)
  const floorGeo = new PlaneGeometry(1, 1)
  floorGeo.rotateX(-Math.PI / 2)
  const regionGeo = new PlaneGeometry(1, 1)
  regionGeo.rotateX(-Math.PI / 2)

  const coneOrigin = vec3InstAttr(fixCap)
  const coneColor = vec3InstAttr(fixCap)
  const coneOpacity = floatInstAttr(fixCap)
  coneGeo.setAttribute('aBeamOrigin', coneOrigin)
  coneGeo.setAttribute('aColor', coneColor)
  coneGeo.setAttribute('aOpacity', coneOpacity)

  const floorOrigin = vec3InstAttr(fixCap)
  const floorDir = vec3InstAttr(fixCap)
  const floorColor = vec3InstAttr(fixCap)
  const floorOpacity = floatInstAttr(fixCap)
  const floorCosHalfAngle = floatInstAttr(fixCap)
  floorGeo.setAttribute('aBeamOrigin', floorOrigin)
  floorGeo.setAttribute('aBeamDir', floorDir)
  floorGeo.setAttribute('aColor', floorColor)
  floorGeo.setAttribute('aOpacity', floorOpacity)
  floorGeo.setAttribute('aCosHalfAngle', floorCosHalfAngle)
  // Floor shares the pool shader, which gates on aVisible — keep it always
  // 1 here; per-fixture visibility is encoded in scale-to-zero on the
  // instance matrix.
  const floorVisibleAttr = floatInstAttr(fixCap)
  for (let i = 0; i < fixCap; i++) floorVisibleAttr.setX(i, 1)
  floorGeo.setAttribute('aVisible', floorVisibleAttr)

  const regionOrigin = vec3InstAttr(fixCap)
  regionOrigin.meshPerAttribute = regDivisor
  const regionDir = vec3InstAttr(fixCap)
  regionDir.meshPerAttribute = regDivisor
  const regionColor = vec3InstAttr(fixCap)
  regionColor.meshPerAttribute = regDivisor
  const regionOpacity = floatInstAttr(fixCap)
  regionOpacity.meshPerAttribute = regDivisor
  const regionCosHalfAngle = floatInstAttr(fixCap)
  regionCosHalfAngle.meshPerAttribute = regDivisor
  const regionVisible = floatInstAttr(regCap)
  regionGeo.setAttribute('aBeamOrigin', regionOrigin)
  regionGeo.setAttribute('aBeamDir', regionDir)
  regionGeo.setAttribute('aColor', regionColor)
  regionGeo.setAttribute('aOpacity', regionOpacity)
  regionGeo.setAttribute('aCosHalfAngle', regionCosHalfAngle)
  regionGeo.setAttribute('aVisible', regionVisible)

  const coneMesh = new InstancedMesh(coneGeo, coneMaterial, fixCap)
  coneMesh.frustumCulled = false
  coneMesh.count = fixtureCount

  const floorMesh = new InstancedMesh(floorGeo, poolMaterial, fixCap)
  floorMesh.frustumCulled = false
  floorMesh.count = fixtureCount

  const regionMesh = new InstancedMesh(regionGeo, poolMaterial, regCap)
  regionMesh.frustumCulled = false
  regionMesh.count = fixtureCount * regionCount

  // Bake one matrix per region (placement is constant across fixtures), then
  // stamp it into every fixture's slot for that region.
  const pos = new Vector3()
  const quat = new Quaternion()
  const scale = new Vector3()
  const regionMats: Matrix4[] = []
  for (let r = 0; r < regionCount; r++) {
    const rg = regionGeometry[r]
    const m = new Matrix4()
    pos.copy(rg.topCenter)
    quat.setFromAxisAngle(UNIT_Y, rg.yawRad)
    scale.set(rg.widthM, 1, rg.depthM)
    m.compose(pos, quat, scale)
    regionMats.push(m)
  }
  for (let slot = 0; slot < fixtureCount; slot++) {
    for (let r = 0; r < regionCount; r++) {
      regionMesh.setMatrixAt(slot * regionCount + r, regionMats[r])
    }
  }
  regionMesh.instanceMatrix.needsUpdate = true

  // — wash pools (per-pixel strip footprint) —————————————————————————
  const washFloorCap = fixCap * MAX_WASH_PIXELS
  const washRegionCap = washFloorCap * regDivisor

  const washFloorGeo = new PlaneGeometry(1, 1)
  washFloorGeo.rotateX(-Math.PI / 2)
  const washFloorOrigin = vec3InstAttr(washFloorCap)
  const washFloorDir = vec3InstAttr(washFloorCap)
  const washFloorColor = vec3InstAttr(washFloorCap)
  const washFloorOpacity = floatInstAttr(washFloorCap)
  const washFloorCosHalfAngle = floatInstAttr(washFloorCap)
  const washFloorVisibleAttr = floatInstAttr(washFloorCap)
  for (let i = 0; i < washFloorCap; i++) washFloorVisibleAttr.setX(i, 1)
  washFloorGeo.setAttribute('aBeamOrigin', washFloorOrigin)
  washFloorGeo.setAttribute('aBeamDir', washFloorDir)
  washFloorGeo.setAttribute('aColor', washFloorColor)
  washFloorGeo.setAttribute('aOpacity', washFloorOpacity)
  washFloorGeo.setAttribute('aCosHalfAngle', washFloorCosHalfAngle)
  washFloorGeo.setAttribute('aVisible', washFloorVisibleAttr)

  const washFloorMesh = new InstancedMesh(washFloorGeo, washPoolMaterial, washFloorCap)
  washFloorMesh.frustumCulled = false
  washFloorMesh.count = fixtureCount * MAX_WASH_PIXELS
  // Start hidden — unwritten instances would otherwise draw at identity scale.
  for (let i = 0; i < washFloorCap; i++) washFloorMesh.setMatrixAt(i, ZERO_MATRIX)
  washFloorMesh.instanceMatrix.needsUpdate = true

  const washRegionGeo = new PlaneGeometry(1, 1)
  washRegionGeo.rotateX(-Math.PI / 2)
  const washRegionOrigin = vec3InstAttr(washFloorCap)
  washRegionOrigin.meshPerAttribute = regDivisor
  const washRegionDir = vec3InstAttr(washFloorCap)
  washRegionDir.meshPerAttribute = regDivisor
  const washRegionColor = vec3InstAttr(washFloorCap)
  washRegionColor.meshPerAttribute = regDivisor
  const washRegionOpacity = floatInstAttr(washFloorCap)
  washRegionOpacity.meshPerAttribute = regDivisor
  const washRegionCosHalfAngle = floatInstAttr(washFloorCap)
  washRegionCosHalfAngle.meshPerAttribute = regDivisor
  const washRegionVisible = floatInstAttr(washRegionCap)
  washRegionGeo.setAttribute('aBeamOrigin', washRegionOrigin)
  washRegionGeo.setAttribute('aBeamDir', washRegionDir)
  washRegionGeo.setAttribute('aColor', washRegionColor)
  washRegionGeo.setAttribute('aOpacity', washRegionOpacity)
  washRegionGeo.setAttribute('aCosHalfAngle', washRegionCosHalfAngle)
  washRegionGeo.setAttribute('aVisible', washRegionVisible)

  const washRegionMesh = new InstancedMesh(washRegionGeo, washPoolMaterial, washRegionCap)
  washRegionMesh.frustumCulled = false
  washRegionMesh.count = fixtureCount * MAX_WASH_PIXELS * regionCount
  // Bake region placement into every (fixture, pixel) block; visibility
  // (default 0) gates which actually draw, like the beam region cookies.
  for (let slot = 0; slot < fixtureCount; slot++) {
    for (let p = 0; p < MAX_WASH_PIXELS; p++) {
      const block = (slot * MAX_WASH_PIXELS + p) * regionCount
      for (let r = 0; r < regionCount; r++) {
        washRegionMesh.setMatrixAt(block + r, regionMats[r])
      }
    }
  }
  washRegionMesh.instanceMatrix.needsUpdate = true

  return {
    fixtureCount,
    regionCount,
    coneMesh,
    floorMesh,
    regionMesh,
    coneOrigin,
    coneColor,
    coneOpacity,
    floorOrigin,
    floorDir,
    floorColor,
    floorOpacity,
    floorCosHalfAngle,
    regionOrigin,
    regionDir,
    regionColor,
    regionOpacity,
    regionCosHalfAngle,
    regionVisible,
    washFloorMesh,
    washFloorOrigin,
    washFloorDir,
    washFloorColor,
    washFloorOpacity,
    washFloorCosHalfAngle,
    washRegionMesh,
    washRegionOrigin,
    washRegionDir,
    washRegionColor,
    washRegionOpacity,
    washRegionCosHalfAngle,
    washRegionVisible,
  }
}

function vec3InstAttr(count: number): InstancedBufferAttribute {
  return new InstancedBufferAttribute(new Float32Array(count * 3), 3)
}

function floatInstAttr(count: number): InstancedBufferAttribute {
  return new InstancedBufferAttribute(new Float32Array(count), 1)
}

const UNIT_Y = new Vector3(0, 1, 0)
const ZERO_MATRIX = new Matrix4().makeScale(0, 0, 0)
const FLOOR_POS = new Vector3()
const FLOOR_QUAT = new Quaternion()
const FLOOR_SCALE = new Vector3()
const FLOOR_MAT = new Matrix4()

function makeHandle(b: BuiltEmitters): EmittersHandle {
  return {
    fixtureCount: b.fixtureCount,
    regionCount: b.regionCount,

    writeConeMatrix(slot, matrix) {
      b.coneMesh.setMatrixAt(slot, matrix)
    },
    writeConeAttrs(slot, origin, color, opacity) {
      b.coneOrigin.setXYZ(slot, origin.x, origin.y, origin.z)
      b.coneColor.setXYZ(slot, color.r, color.g, color.b)
      b.coneOpacity.setX(slot, opacity)
    },

    writeFloorMatrix(slot, visible, cx, cz, side) {
      if (!visible) {
        b.floorMesh.setMatrixAt(slot, ZERO_MATRIX)
        return
      }
      FLOOR_POS.set(cx, COOKIE_LIFT_M, cz)
      FLOOR_QUAT.identity()
      FLOOR_SCALE.set(side, 1, side)
      FLOOR_MAT.compose(FLOOR_POS, FLOOR_QUAT, FLOOR_SCALE)
      b.floorMesh.setMatrixAt(slot, FLOOR_MAT)
    },
    writeFloorAttrs(slot, origin, dir, color, opacity, cosHalfAngle) {
      b.floorOrigin.setXYZ(slot, origin.x, origin.y, origin.z)
      b.floorDir.setXYZ(slot, dir.x, dir.y, dir.z)
      b.floorColor.setXYZ(slot, color.r, color.g, color.b)
      b.floorOpacity.setX(slot, opacity)
      b.floorCosHalfAngle.setX(slot, cosHalfAngle)
    },

    writeRegionVisibility(slot, regionIdx, visible) {
      b.regionVisible.setX(slot * b.regionCount + regionIdx, visible ? 1 : 0)
    },
    writeRegionAttrs(slot, origin, dir, color, opacity, cosHalfAngle) {
      b.regionOrigin.setXYZ(slot, origin.x, origin.y, origin.z)
      b.regionDir.setXYZ(slot, dir.x, dir.y, dir.z)
      b.regionColor.setXYZ(slot, color.r, color.g, color.b)
      b.regionOpacity.setX(slot, opacity)
      b.regionCosHalfAngle.setX(slot, cosHalfAngle)
    },

    writeWashFloorMatrix(slot, pixelIdx, visible, cx, cz, side) {
      const i = slot * MAX_WASH_PIXELS + pixelIdx
      if (!visible) {
        b.washFloorMesh.setMatrixAt(i, ZERO_MATRIX)
        return
      }
      FLOOR_POS.set(cx, COOKIE_LIFT_M, cz)
      FLOOR_QUAT.identity()
      FLOOR_SCALE.set(side, 1, side)
      FLOOR_MAT.compose(FLOOR_POS, FLOOR_QUAT, FLOOR_SCALE)
      b.washFloorMesh.setMatrixAt(i, FLOOR_MAT)
    },
    writeWashFloorAttrs(slot, pixelIdx, origin, dir, color, opacity, cosHalfAngle) {
      const i = slot * MAX_WASH_PIXELS + pixelIdx
      b.washFloorOrigin.setXYZ(i, origin.x, origin.y, origin.z)
      b.washFloorDir.setXYZ(i, dir.x, dir.y, dir.z)
      b.washFloorColor.setXYZ(i, color.r, color.g, color.b)
      b.washFloorOpacity.setX(i, opacity)
      b.washFloorCosHalfAngle.setX(i, cosHalfAngle)
    },
    writeWashRegionVisibility(slot, pixelIdx, regionIdx, visible) {
      const pix = slot * MAX_WASH_PIXELS + pixelIdx
      b.washRegionVisible.setX(pix * b.regionCount + regionIdx, visible ? 1 : 0)
    },
    writeWashRegionAttrs(slot, pixelIdx, origin, dir, color, opacity, cosHalfAngle) {
      const i = slot * MAX_WASH_PIXELS + pixelIdx
      b.washRegionOrigin.setXYZ(i, origin.x, origin.y, origin.z)
      b.washRegionDir.setXYZ(i, dir.x, dir.y, dir.z)
      b.washRegionColor.setXYZ(i, color.r, color.g, color.b)
      b.washRegionOpacity.setX(i, opacity)
      b.washRegionCosHalfAngle.setX(i, cosHalfAngle)
    },

    hideSlot(slot) {
      b.coneMesh.setMatrixAt(slot, ZERO_MATRIX)
      b.floorMesh.setMatrixAt(slot, ZERO_MATRIX)
      for (let r = 0; r < b.regionCount; r++) {
        b.regionVisible.setX(slot * b.regionCount + r, 0)
      }
    },
    hideWashSlot(slot) {
      for (let p = 0; p < MAX_WASH_PIXELS; p++) {
        const pix = slot * MAX_WASH_PIXELS + p
        b.washFloorMesh.setMatrixAt(pix, ZERO_MATRIX)
        for (let r = 0; r < b.regionCount; r++) {
          b.washRegionVisible.setX(pix * b.regionCount + r, 0)
        }
      }
    },
  }
}
