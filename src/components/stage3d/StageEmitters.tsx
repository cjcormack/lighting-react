import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BoxGeometry,
  Color,
  ConeGeometry,
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
import { getGoboTexture } from './goboAtlas'
import { makeConeMaterial, makePoolMaterial, makeVolumeMaterial } from './beamShaders'
import { VOLUMETRIC_STEPS } from './washConfig'
import {
  COOKIE_LIFT_M,
  MAX_BEAM_REGIONS,
  MAX_PRISM_LOBES,
  MAX_WASH_PIXELS,
  beamCapacity,
  beamInstanceIndex,
  regionCapacity,
  regionDivisor,
  regionInstanceIndex,
  washFloorCapacity,
  washPixelIndex,
  washRegionCapacity,
  washRegionInstanceIndex,
} from './emitterLayout'

export {
  BEAM_LENGTH,
  COOKIE_LIFT_M,
  MAX_BEAM_REGIONS,
  MAX_PRISM_LOBES,
  MAX_WASH_PIXELS,
} from './emitterLayout'

export interface RegionGeometry {
  uuid: string
  widthM: number
  depthM: number
  heightM: number
  yawRad: number
  // OBB lifted to h/2 — feeds shader uRegion* uniforms for ray-OBB shadow tests.
  obbCenter: Vector3
  obbHalfX: number
  obbHalfY: number
  obbHalfZ: number
  /** Whole-box centre + bounding-sphere radius — feeds the per-frame cookie
   *  cull and the shadow mask. The receiver is the region's whole box (all
   *  faces catch light), so this is the OBB centre and full diagonal, not the
   *  old top-face-only values. */
  cookieCenter: Vector3
  cookieBoundingRadius: number
}

export function computeRegionGeometry(regions: StageRegionDto[]): RegionGeometry[] {
  return regions.map((r) => {
    const w = r.widthM ?? 1
    const d = r.depthM ?? 1
    const h = r.heightM ?? 1
    const cz = r.centerZ ?? 0
    const obbCenter = toThree(r.centerX ?? 0, r.centerY ?? 0, cz + h / 2)
    return {
      uuid: r.uuid,
      widthM: w,
      depthM: d,
      heightM: h,
      yawRad: MathUtils.degToRad(r.yawDeg ?? 0),
      obbCenter,
      obbHalfX: w / 2,
      obbHalfY: h / 2,
      obbHalfZ: d / 2,
      cookieCenter: obbCenter,
      cookieBoundingRadius: Math.hypot(w / 2, h / 2, d / 2),
    }
  })
}

/** Upstage wall receiver geometry, exposed to the per-fixture directors.
 *  The wall's reach test is analytic (plane intersect + rectangle clamp in
 *  `updateWallCookie`), so unlike regions it carries no bounding sphere. */
export interface WallGeometry {
  /** Wall plane z (the stage's upstage boundary). */
  z: number
  halfWidth: number
  height: number
}

// Per-fixture emitter writes, called from FixtureModel's per-frame loop.
// All writes target a (slot, lobe) allocated to the fixture by the controller:
// lobe 0 is the primary beam, lobes 1+ exist for prism images and stay parked
// otherwise. Buffer needsUpdate flags are marked dirty centrally by the
// controller's own useFrame so the caller doesn't have to.
export interface EmittersHandle {
  fixtureCount: number
  regionCount: number
  /** Null when the stage has no wall (shouldn't happen — stage dims always exist). */
  wall: WallGeometry | null

  /**
   * Place a (slot, lobe)'s mid-air beam. `volumetric` selects which mesh
   * draws it — the cheap silhouette shell (open gobo) or the raymarched
   * volume (gobo in the beam) — and parks the other, so switching is
   * stateless for the caller.
   */
  writeBeamMatrix(slot: number, lobe: number, matrix: Matrix4, volumetric: boolean): void
  writeConeAttrs(
    slot: number,
    lobe: number,
    origin: Vector3,
    dir: Vector3,
    color: Color,
    opacity: number,
    cosHalfAngle: number,
  ): void

  /**
   * Beam-shaping params for a (slot, lobe), applied to its cone and every pool
   * mesh. `edge` 0..1 is focus hardness (0 = the original soft falloff, so a
   * fixture with no focus channel is unchanged). `goboSlot` 0 = open.
   * `goboAngle` is in radians. `focusDist` is the focal-plane distance in
   * metres, or negative ("always sharp") when the fixture has no focus
   * channel. `right` is the head's world X axis, giving the gobo a stable
   * cross-section frame — a basis derived from the beam direction alone
   * degenerates when the beam points near straight down, which is most of
   * the time.
   */
  writeBeamFx(
    slot: number,
    lobe: number,
    edge: number,
    goboSlot: number,
    goboAngle: number,
    focusDist: number,
    right: Vector3,
  ): void

  /**
   * Bitmask of region indices this (slot, lobe)'s beam can reach, from the
   * CPU cone-vs-sphere cull. The pool shaders shadow-test only masked
   * regions, so the common case runs 0-2 ray-OBB tests instead of 16.
   */
  writeShadowMask(slot: number, lobe: number, mask: number): void

  writeFloorMatrix(
    slot: number,
    lobe: number,
    visible: boolean,
    cx: number,
    cz: number,
    side: number,
  ): void
  writeFloorAttrs(
    slot: number,
    lobe: number,
    origin: Vector3,
    dir: Vector3,
    color: Color,
    opacity: number,
    cosHalfAngle: number,
  ): void

  writeRegionVisibility(slot: number, lobe: number, regionIdx: number, visible: boolean): void
  writeRegionAttrs(
    slot: number,
    lobe: number,
    origin: Vector3,
    dir: Vector3,
    color: Color,
    opacity: number,
    cosHalfAngle: number,
  ): void

  writeWallMatrix(
    slot: number,
    lobe: number,
    visible: boolean,
    cx: number,
    cy: number,
    sideX: number,
    sideY: number,
  ): void
  writeWallAttrs(
    slot: number,
    lobe: number,
    origin: Vector3,
    dir: Vector3,
    color: Color,
    opacity: number,
    cosHalfAngle: number,
  ): void

  // — per-pixel wash pools (strip/bar fixtures) —————————————————————
  // A strip slot owns a block of MAX_WASH_PIXELS pool instances on the floor
  // and (× regionCount) on region boxes. Each pixel is independent: its own
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

  /** Park every lobe ≥ fromLobe of a slot — the "prism swung out" transition. */
  hideLobes(slot: number, fromLobe: number): void
  // Zero-scale all of a slot's matrices + clear all its visibilities.
  // Called when a fixture is functionally off.
  hideSlot(slot: number): void
  // Same, for a strip slot's whole wash block (all MAX_WASH_PIXELS pixels).
  hideWashSlot(slot: number): void
}

const EmittersContext = createContext<EmittersHandle | null>(null)

export function useEmitters(): EmittersHandle | null {
  return useContext(EmittersContext)
}

export interface StageDims {
  width: number
  height: number
  depth: number
}

interface StageEmittersProps {
  fixtureCount: number
  regionGeometry: ReadonlyArray<RegionGeometry>
  stage: StageDims
  children: React.ReactNode
}

// Stage-level controller owning the InstancedMesh objects (cone, floor
// cookie, region cookie boxes, wall cookie, wash pools). Allocates
// per-instance attribute buffers sized by emitterLayout, then exposes an
// imperative write handle so each FixtureModel can populate its slot without
// taking on the mesh state itself.
export function StageEmitters({
  fixtureCount,
  regionGeometry,
  stage,
  children,
}: StageEmittersProps) {
  const regionCount = Math.min(regionGeometry.length, MAX_BEAM_REGIONS)

  const coneMaterial = useMemo(makeConeMaterial, [])
  // Module-level shared texture — deterministic, expensive to bake, so a
  // remount of the Stage view must not rebuild it (and must not dispose it).
  const goboTexture = getGoboTexture()
  const poolMaterial = useMemo(() => makePoolMaterial(true, goboTexture), [goboTexture])
  const volumeMaterial = useMemo(() => makeVolumeMaterial(goboTexture), [goboTexture])
  // Wash pools reuse the pool shader but drop the white hotspot boost so a bar's
  // overlapping per-pixel colours blend as colour, not white.
  const washPoolMaterial = useMemo(() => {
    const m = makePoolMaterial(false)
    m.uniforms.uCoreBoost.value = 0
    return m
  }, [])
  useEffect(() => () => coneMaterial.dispose(), [coneMaterial])
  useEffect(() => () => poolMaterial.dispose(), [poolMaterial])
  useEffect(() => () => volumeMaterial.dispose(), [volumeMaterial])
  useEffect(() => () => washPoolMaterial.dispose(), [washPoolMaterial])

  // March depth trades against fill: dpr 2 quadruples the shaded area, so
  // drop a third of the samples there. Set once per pixel-ratio change.
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const dpr = gl.getPixelRatio()
    volumeMaterial.uniforms.uVolSteps.value =
      dpr > 1.5 ? Math.max(6, VOLUMETRIC_STEPS - 4) : VOLUMETRIC_STEPS
  }, [gl, volumeMaterial])

  // Shared region OBB uniforms — sync into all materials whenever the region
  // layout changes. Pre-bake yaw into a cos/sin pair so the shader skips
  // per-fragment trig. The wall plane rides along: it clips beams and pools
  // at the upstage boundary.
  useEffect(() => {
    for (const mat of [coneMaterial, poolMaterial, volumeMaterial, washPoolMaterial]) {
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
      u.uWallZ.value = -stage.depth
    }
  }, [
    coneMaterial,
    poolMaterial,
    volumeMaterial,
    washPoolMaterial,
    regionGeometry,
    regionCount,
    stage.depth,
  ])

  // Pre-allocate buffers + InstancedMesh objects sized by emitterLayout.
  // Rebuilds when the counts or stage change; in practice this only happens
  // when patches, regions or the stage size are edited.
  const built = useMemo(
    () =>
      buildEmitters(
        fixtureCount,
        regionCount,
        regionGeometry,
        stage,
        coneMaterial,
        volumeMaterial,
        poolMaterial,
        washPoolMaterial,
      ),
    [
      fixtureCount,
      regionCount,
      regionGeometry,
      stage,
      coneMaterial,
      volumeMaterial,
      poolMaterial,
      washPoolMaterial,
    ],
  )

  useEffect(
    () => () => {
      built.coneMesh.dispose()
      built.volumeMesh.dispose()
      built.floorMesh.dispose()
      built.regionMesh.dispose()
      built.wallMesh.dispose()
      built.washFloorMesh.dispose()
      built.washRegionMesh.dispose()
      built.coneMesh.geometry.dispose()
      built.volumeMesh.geometry.dispose()
      built.floorMesh.geometry.dispose()
      built.regionMesh.geometry.dispose()
      built.wallMesh.geometry.dispose()
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
    m.coneFx.needsUpdate = true

    m.volumeMesh.instanceMatrix.needsUpdate = true
    m.volumeOrigin.needsUpdate = true
    m.volumeDir.needsUpdate = true
    m.volumeRight.needsUpdate = true
    m.volumeColor.needsUpdate = true
    m.volumeOpacity.needsUpdate = true
    m.volumeCosHalfAngle.needsUpdate = true
    m.volumeFx.needsUpdate = true
    m.volumeMask.needsUpdate = true

    m.floorMesh.instanceMatrix.needsUpdate = true
    m.floorOrigin.needsUpdate = true
    m.floorDir.needsUpdate = true
    m.floorColor.needsUpdate = true
    m.floorOpacity.needsUpdate = true
    m.floorCosHalfAngle.needsUpdate = true
    m.floorFx.needsUpdate = true
    m.floorRight.needsUpdate = true
    m.floorMask.needsUpdate = true

    m.regionOrigin.needsUpdate = true
    m.regionFx.needsUpdate = true
    m.regionRight.needsUpdate = true
    m.regionMask.needsUpdate = true
    m.regionDir.needsUpdate = true
    m.regionColor.needsUpdate = true
    m.regionOpacity.needsUpdate = true
    m.regionCosHalfAngle.needsUpdate = true
    m.regionVisible.needsUpdate = true

    m.wallMesh.instanceMatrix.needsUpdate = true
    m.wallOrigin.needsUpdate = true
    m.wallDir.needsUpdate = true
    m.wallColor.needsUpdate = true
    m.wallOpacity.needsUpdate = true
    m.wallCosHalfAngle.needsUpdate = true
    m.wallFx.needsUpdate = true
    m.wallRight.needsUpdate = true
    m.wallMask.needsUpdate = true

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
      <primitive object={built.volumeMesh} raycast={NO_RAYCAST} />
      <primitive object={built.floorMesh} raycast={NO_RAYCAST} />
      <primitive object={built.regionMesh} raycast={NO_RAYCAST} />
      <primitive object={built.wallMesh} raycast={NO_RAYCAST} />
      <primitive object={built.washFloorMesh} raycast={NO_RAYCAST} />
      <primitive object={built.washRegionMesh} raycast={NO_RAYCAST} />
      <EmittersContext.Provider value={handle}>{children}</EmittersContext.Provider>
    </>
  )
}

interface BuiltEmitters {
  fixtureCount: number
  regionCount: number
  wall: WallGeometry

  coneMesh: InstancedMesh
  volumeMesh: InstancedMesh
  floorMesh: InstancedMesh
  regionMesh: InstancedMesh
  wallMesh: InstancedMesh

  coneOrigin: InstancedBufferAttribute
  coneFx: InstancedBufferAttribute
  coneColor: InstancedBufferAttribute
  coneOpacity: InstancedBufferAttribute

  volumeOrigin: InstancedBufferAttribute
  volumeDir: InstancedBufferAttribute
  volumeRight: InstancedBufferAttribute
  volumeColor: InstancedBufferAttribute
  volumeOpacity: InstancedBufferAttribute
  volumeCosHalfAngle: InstancedBufferAttribute
  volumeFx: InstancedBufferAttribute
  volumeMask: InstancedBufferAttribute

  floorOrigin: InstancedBufferAttribute
  floorFx: InstancedBufferAttribute
  floorRight: InstancedBufferAttribute
  floorMask: InstancedBufferAttribute
  floorDir: InstancedBufferAttribute
  floorColor: InstancedBufferAttribute
  floorOpacity: InstancedBufferAttribute
  floorCosHalfAngle: InstancedBufferAttribute

  // Per-(slot, lobe) attribute buffers — divisor=regionCount so each lobe's
  // value applies to all regionCount of its cookie instances.
  regionOrigin: InstancedBufferAttribute
  regionFx: InstancedBufferAttribute
  regionRight: InstancedBufferAttribute
  regionMask: InstancedBufferAttribute
  regionDir: InstancedBufferAttribute
  regionColor: InstancedBufferAttribute
  regionOpacity: InstancedBufferAttribute
  regionCosHalfAngle: InstancedBufferAttribute
  // Per-(slot, lobe, region) visibility — divisor=1.
  regionVisible: InstancedBufferAttribute

  wallOrigin: InstancedBufferAttribute
  wallFx: InstancedBufferAttribute
  wallRight: InstancedBufferAttribute
  wallMask: InstancedBufferAttribute
  wallDir: InstancedBufferAttribute
  wallColor: InstancedBufferAttribute
  wallOpacity: InstancedBufferAttribute
  wallCosHalfAngle: InstancedBufferAttribute

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
  stage: StageDims,
  coneMaterial: ShaderMaterial,
  volumeMaterial: ShaderMaterial,
  poolMaterial: ShaderMaterial,
  washPoolMaterial: ShaderMaterial,
): BuiltEmitters {
  const beamCap = beamCapacity(fixtureCount)
  const regDivisor = regionDivisor(regionCount)
  const regCap = regionCapacity(fixtureCount, regionCount)

  const coneGeo = new ConeGeometry(1, 1, 48, 1, true)
  // Closed + coarse: the volume hull is only a conservative fragment
  // generator (back faces), the analytic intersection in the shader is the
  // real boundary.
  const volumeGeo = new ConeGeometry(1, 1, 24, 1, false)
  const floorGeo = new PlaneGeometry(1, 1)
  floorGeo.rotateX(-Math.PI / 2)
  // The region receiver is the region's own (slightly inflated) box: the pool
  // shader shades any world-space fragment from the beam's geometry, so side
  // faces work exactly like the old top-face quad did — the shader's
  // self-OBB shadow test discards back/far faces.
  const regionGeo = new BoxGeometry(1, 1, 1)
  // Wall receiver quad faces downstage (+z) — PlaneGeometry's natural facing.
  const wallGeo = new PlaneGeometry(1, 1)

  const coneOrigin = vec3InstAttr(beamCap)
  const coneColor = vec3InstAttr(beamCap)
  const coneOpacity = floatInstAttr(beamCap)
  const coneFx = vec4InstAttr(beamCap)
  coneGeo.setAttribute('aBeamOrigin', coneOrigin)
  coneGeo.setAttribute('aColor', coneColor)
  coneGeo.setAttribute('aOpacity', coneOpacity)
  coneGeo.setAttribute('aBeamFx', coneFx)

  const volumeOrigin = vec3InstAttr(beamCap)
  const volumeDir = vec3InstAttr(beamCap)
  const volumeRight = vec3InstAttr(beamCap)
  const volumeColor = vec3InstAttr(beamCap)
  const volumeOpacity = floatInstAttr(beamCap)
  const volumeCosHalfAngle = floatInstAttr(beamCap)
  const volumeFx = vec4InstAttr(beamCap)
  const volumeMask = floatInstAttr(beamCap)
  volumeGeo.setAttribute('aBeamOrigin', volumeOrigin)
  volumeGeo.setAttribute('aBeamDir', volumeDir)
  volumeGeo.setAttribute('aBeamRight', volumeRight)
  volumeGeo.setAttribute('aColor', volumeColor)
  volumeGeo.setAttribute('aOpacity', volumeOpacity)
  volumeGeo.setAttribute('aCosHalfAngle', volumeCosHalfAngle)
  volumeGeo.setAttribute('aBeamFx', volumeFx)
  volumeGeo.setAttribute('aShadowMask', volumeMask)

  const floorOrigin = vec3InstAttr(beamCap)
  const floorDir = vec3InstAttr(beamCap)
  const floorColor = vec3InstAttr(beamCap)
  const floorOpacity = floatInstAttr(beamCap)
  const floorCosHalfAngle = floatInstAttr(beamCap)
  floorGeo.setAttribute('aBeamOrigin', floorOrigin)
  floorGeo.setAttribute('aBeamDir', floorDir)
  floorGeo.setAttribute('aColor', floorColor)
  floorGeo.setAttribute('aOpacity', floorOpacity)
  floorGeo.setAttribute('aCosHalfAngle', floorCosHalfAngle)
  const floorFx = vec4InstAttr(beamCap)
  const floorRight = vec3InstAttr(beamCap)
  const floorMask = floatInstAttr(beamCap)
  floorGeo.setAttribute('aBeamFx', floorFx)
  floorGeo.setAttribute('aBeamRight', floorRight)
  floorGeo.setAttribute('aShadowMask', floorMask)
  // Floor shares the pool shader, which gates on aVisible — keep it always
  // 1 here; per-lobe visibility is encoded in scale-to-zero on the
  // instance matrix.
  const floorVisibleAttr = floatInstAttr(beamCap)
  for (let i = 0; i < beamCap; i++) floorVisibleAttr.setX(i, 1)
  floorGeo.setAttribute('aVisible', floorVisibleAttr)

  const regionOrigin = vec3InstAttr(beamCap)
  regionOrigin.meshPerAttribute = regDivisor
  const regionDir = vec3InstAttr(beamCap)
  regionDir.meshPerAttribute = regDivisor
  const regionColor = vec3InstAttr(beamCap)
  regionColor.meshPerAttribute = regDivisor
  const regionOpacity = floatInstAttr(beamCap)
  regionOpacity.meshPerAttribute = regDivisor
  const regionCosHalfAngle = floatInstAttr(beamCap)
  regionCosHalfAngle.meshPerAttribute = regDivisor
  // Per-(slot, lobe), like its neighbours above — without meshPerAttribute
  // each lobe's gobo would bleed into the next lobe's region cookies.
  const regionFx = vec4InstAttr(beamCap)
  regionFx.meshPerAttribute = regDivisor
  const regionRight = vec3InstAttr(beamCap)
  regionRight.meshPerAttribute = regDivisor
  const regionMask = floatInstAttr(beamCap)
  regionMask.meshPerAttribute = regDivisor
  const regionVisible = floatInstAttr(regCap)
  regionGeo.setAttribute('aBeamFx', regionFx)
  regionGeo.setAttribute('aBeamRight', regionRight)
  regionGeo.setAttribute('aShadowMask', regionMask)
  regionGeo.setAttribute('aBeamOrigin', regionOrigin)
  regionGeo.setAttribute('aBeamDir', regionDir)
  regionGeo.setAttribute('aColor', regionColor)
  regionGeo.setAttribute('aOpacity', regionOpacity)
  regionGeo.setAttribute('aCosHalfAngle', regionCosHalfAngle)
  regionGeo.setAttribute('aVisible', regionVisible)

  const wallOrigin = vec3InstAttr(beamCap)
  const wallDir = vec3InstAttr(beamCap)
  const wallColor = vec3InstAttr(beamCap)
  const wallOpacity = floatInstAttr(beamCap)
  const wallCosHalfAngle = floatInstAttr(beamCap)
  const wallFx = vec4InstAttr(beamCap)
  const wallRight = vec3InstAttr(beamCap)
  const wallMask = floatInstAttr(beamCap)
  const wallVisibleAttr = floatInstAttr(beamCap)
  for (let i = 0; i < beamCap; i++) wallVisibleAttr.setX(i, 1)
  wallGeo.setAttribute('aBeamOrigin', wallOrigin)
  wallGeo.setAttribute('aBeamDir', wallDir)
  wallGeo.setAttribute('aColor', wallColor)
  wallGeo.setAttribute('aOpacity', wallOpacity)
  wallGeo.setAttribute('aCosHalfAngle', wallCosHalfAngle)
  wallGeo.setAttribute('aBeamFx', wallFx)
  wallGeo.setAttribute('aBeamRight', wallRight)
  wallGeo.setAttribute('aShadowMask', wallMask)
  wallGeo.setAttribute('aVisible', wallVisibleAttr)

  const coneMesh = new InstancedMesh(coneGeo, coneMaterial, beamCap)
  coneMesh.frustumCulled = false
  coneMesh.count = fixtureCount * MAX_PRISM_LOBES

  const volumeMesh = new InstancedMesh(volumeGeo, volumeMaterial, beamCap)
  volumeMesh.frustumCulled = false
  volumeMesh.count = fixtureCount * MAX_PRISM_LOBES

  const floorMesh = new InstancedMesh(floorGeo, poolMaterial, beamCap)
  floorMesh.frustumCulled = false
  floorMesh.count = fixtureCount * MAX_PRISM_LOBES

  const wallMesh = new InstancedMesh(wallGeo, poolMaterial, beamCap)
  wallMesh.frustumCulled = false
  wallMesh.count = fixtureCount * MAX_PRISM_LOBES

  // Start every beam instance parked — the directors only write lobes they
  // use, and an unwritten instance would otherwise draw at identity scale.
  for (let i = 0; i < beamCap; i++) {
    coneMesh.setMatrixAt(i, ZERO_MATRIX)
    volumeMesh.setMatrixAt(i, ZERO_MATRIX)
    floorMesh.setMatrixAt(i, ZERO_MATRIX)
    wallMesh.setMatrixAt(i, ZERO_MATRIX)
  }
  coneMesh.instanceMatrix.needsUpdate = true
  volumeMesh.instanceMatrix.needsUpdate = true
  floorMesh.instanceMatrix.needsUpdate = true
  wallMesh.instanceMatrix.needsUpdate = true

  const regionMesh = new InstancedMesh(regionGeo, poolMaterial, regCap)
  regionMesh.frustumCulled = false
  regionMesh.count = fixtureCount * MAX_PRISM_LOBES * regionCount

  // Bake one matrix per region (placement is constant across fixtures), then
  // stamp it into every (slot, lobe) block for that region. The box is
  // inflated by the cookie lift on every axis so its skin sits just off the
  // region's own faces.
  const pos = new Vector3()
  const quat = new Quaternion()
  const scale = new Vector3()
  const regionMats: Matrix4[] = []
  for (let r = 0; r < regionCount; r++) {
    const rg = regionGeometry[r]
    const m = new Matrix4()
    pos.copy(rg.obbCenter)
    quat.setFromAxisAngle(UNIT_Y, rg.yawRad)
    scale.set(
      rg.widthM + 2 * COOKIE_LIFT_M,
      rg.heightM + 2 * COOKIE_LIFT_M,
      rg.depthM + 2 * COOKIE_LIFT_M,
    )
    m.compose(pos, quat, scale)
    regionMats.push(m)
  }
  for (let beam = 0; beam < fixtureCount * MAX_PRISM_LOBES; beam++) {
    for (let r = 0; r < regionCount; r++) {
      regionMesh.setMatrixAt(beam * regionCount + r, regionMats[r])
    }
  }
  regionMesh.instanceMatrix.needsUpdate = true

  // — wash pools (per-pixel strip footprint) —————————————————————————
  const washFloorCap = washFloorCapacity(fixtureCount)
  const washRegionCap = washRegionCapacity(fixtureCount, regionCount)

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

  const washRegionGeo = new BoxGeometry(1, 1, 1)
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

  const wall: WallGeometry = {
    z: -stage.depth,
    halfWidth: stage.width / 2,
    height: stage.height,
  }

  return {
    fixtureCount,
    regionCount,
    wall,
    coneMesh,
    volumeMesh,
    floorMesh,
    regionMesh,
    wallMesh,
    coneOrigin,
    coneFx,
    coneColor,
    coneOpacity,
    volumeOrigin,
    volumeDir,
    volumeRight,
    volumeColor,
    volumeOpacity,
    volumeCosHalfAngle,
    volumeFx,
    volumeMask,
    floorOrigin,
    floorFx,
    floorRight,
    floorMask,
    floorDir,
    floorColor,
    floorOpacity,
    floorCosHalfAngle,
    regionOrigin,
    regionFx,
    regionRight,
    regionMask,
    regionDir,
    regionColor,
    regionOpacity,
    regionCosHalfAngle,
    regionVisible,
    wallOrigin,
    wallFx,
    wallRight,
    wallMask,
    wallDir,
    wallColor,
    wallOpacity,
    wallCosHalfAngle,
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

// Beam-shaping params packed as one vec4 (edge, goboSlot, goboAngle, spare)
// rather than four scalars: the pool program is already near the 16-attribute
// floor guaranteed by WebGL2, and one attribute means one needsUpdate flip.
function vec4InstAttr(count: number): InstancedBufferAttribute {
  return new InstancedBufferAttribute(new Float32Array(count * 4), 4)
}

const UNIT_Y = new Vector3(0, 1, 0)
const ZERO_MATRIX = new Matrix4().makeScale(0, 0, 0)
const FLOOR_POS = new Vector3()
const FLOOR_QUAT = new Quaternion()
const FLOOR_SCALE = new Vector3()
const FLOOR_MAT = new Matrix4()

function makeHandle(b: BuiltEmitters): EmittersHandle {
  // A named closure rather than a `this`-call so the handle survives
  // destructuring (the tests stub methods individually).
  function hideLobes(slot: number, fromLobe: number): void {
    for (let lobe = fromLobe; lobe < MAX_PRISM_LOBES; lobe++) {
      const i = beamInstanceIndex(slot, lobe)
      b.coneMesh.setMatrixAt(i, ZERO_MATRIX)
      b.volumeMesh.setMatrixAt(i, ZERO_MATRIX)
      b.floorMesh.setMatrixAt(i, ZERO_MATRIX)
      b.wallMesh.setMatrixAt(i, ZERO_MATRIX)
      for (let r = 0; r < b.regionCount; r++) {
        b.regionVisible.setX(regionInstanceIndex(slot, lobe, b.regionCount, r), 0)
      }
    }
  }

  return {
    fixtureCount: b.fixtureCount,
    regionCount: b.regionCount,
    wall: b.wall,

    writeBeamMatrix(slot, lobe, matrix, volumetric) {
      const i = beamInstanceIndex(slot, lobe)
      b.coneMesh.setMatrixAt(i, volumetric ? ZERO_MATRIX : matrix)
      b.volumeMesh.setMatrixAt(i, volumetric ? matrix : ZERO_MATRIX)
    },
    writeConeAttrs(slot, lobe, origin, dir, color, opacity, cosHalfAngle) {
      const i = beamInstanceIndex(slot, lobe)
      b.coneOrigin.setXYZ(i, origin.x, origin.y, origin.z)
      b.coneColor.setXYZ(i, color.r, color.g, color.b)
      b.coneOpacity.setX(i, opacity)
      b.volumeOrigin.setXYZ(i, origin.x, origin.y, origin.z)
      b.volumeDir.setXYZ(i, dir.x, dir.y, dir.z)
      b.volumeColor.setXYZ(i, color.r, color.g, color.b)
      b.volumeOpacity.setX(i, opacity)
      b.volumeCosHalfAngle.setX(i, cosHalfAngle)
    },

    writeBeamFx(slot, lobe, edge, goboSlot, goboAngle, focusDist, right) {
      const i = beamInstanceIndex(slot, lobe)
      // The cone shell reads only .x (edge) — it has no interior to project
      // into, so the gobo/focus payload matters on the pool meshes (and the
      // volumetric cone, which shares this fx layout).
      b.coneFx.setXYZW(i, edge, goboSlot, goboAngle, focusDist)
      b.volumeFx.setXYZW(i, edge, goboSlot, goboAngle, focusDist)
      b.floorFx.setXYZW(i, edge, goboSlot, goboAngle, focusDist)
      b.regionFx.setXYZW(i, edge, goboSlot, goboAngle, focusDist)
      b.wallFx.setXYZW(i, edge, goboSlot, goboAngle, focusDist)
      b.volumeRight.setXYZ(i, right.x, right.y, right.z)
      b.floorRight.setXYZ(i, right.x, right.y, right.z)
      b.regionRight.setXYZ(i, right.x, right.y, right.z)
      b.wallRight.setXYZ(i, right.x, right.y, right.z)
    },

    writeShadowMask(slot, lobe, mask) {
      const i = beamInstanceIndex(slot, lobe)
      b.volumeMask.setX(i, mask)
      b.floorMask.setX(i, mask)
      b.regionMask.setX(i, mask)
      b.wallMask.setX(i, mask)
    },

    writeFloorMatrix(slot, lobe, visible, cx, cz, side) {
      const i = beamInstanceIndex(slot, lobe)
      if (!visible) {
        b.floorMesh.setMatrixAt(i, ZERO_MATRIX)
        return
      }
      FLOOR_POS.set(cx, COOKIE_LIFT_M, cz)
      FLOOR_QUAT.identity()
      FLOOR_SCALE.set(side, 1, side)
      FLOOR_MAT.compose(FLOOR_POS, FLOOR_QUAT, FLOOR_SCALE)
      b.floorMesh.setMatrixAt(i, FLOOR_MAT)
    },
    writeFloorAttrs(slot, lobe, origin, dir, color, opacity, cosHalfAngle) {
      const i = beamInstanceIndex(slot, lobe)
      b.floorOrigin.setXYZ(i, origin.x, origin.y, origin.z)
      b.floorDir.setXYZ(i, dir.x, dir.y, dir.z)
      b.floorColor.setXYZ(i, color.r, color.g, color.b)
      b.floorOpacity.setX(i, opacity)
      b.floorCosHalfAngle.setX(i, cosHalfAngle)
    },

    writeRegionVisibility(slot, lobe, regionIdx, visible) {
      b.regionVisible.setX(
        regionInstanceIndex(slot, lobe, b.regionCount, regionIdx),
        visible ? 1 : 0,
      )
    },
    writeRegionAttrs(slot, lobe, origin, dir, color, opacity, cosHalfAngle) {
      const i = beamInstanceIndex(slot, lobe)
      b.regionOrigin.setXYZ(i, origin.x, origin.y, origin.z)
      b.regionDir.setXYZ(i, dir.x, dir.y, dir.z)
      b.regionColor.setXYZ(i, color.r, color.g, color.b)
      b.regionOpacity.setX(i, opacity)
      b.regionCosHalfAngle.setX(i, cosHalfAngle)
    },

    writeWallMatrix(slot, lobe, visible, cx, cy, sideX, sideY) {
      const i = beamInstanceIndex(slot, lobe)
      if (!visible) {
        b.wallMesh.setMatrixAt(i, ZERO_MATRIX)
        return
      }
      FLOOR_POS.set(cx, cy, b.wall.z + COOKIE_LIFT_M)
      FLOOR_QUAT.identity()
      FLOOR_SCALE.set(sideX, sideY, 1)
      FLOOR_MAT.compose(FLOOR_POS, FLOOR_QUAT, FLOOR_SCALE)
      b.wallMesh.setMatrixAt(i, FLOOR_MAT)
    },
    writeWallAttrs(slot, lobe, origin, dir, color, opacity, cosHalfAngle) {
      const i = beamInstanceIndex(slot, lobe)
      b.wallOrigin.setXYZ(i, origin.x, origin.y, origin.z)
      b.wallDir.setXYZ(i, dir.x, dir.y, dir.z)
      b.wallColor.setXYZ(i, color.r, color.g, color.b)
      b.wallOpacity.setX(i, opacity)
      b.wallCosHalfAngle.setX(i, cosHalfAngle)
    },

    writeWashFloorMatrix(slot, pixelIdx, visible, cx, cz, side) {
      const i = washPixelIndex(slot, pixelIdx)
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
      const i = washPixelIndex(slot, pixelIdx)
      b.washFloorOrigin.setXYZ(i, origin.x, origin.y, origin.z)
      b.washFloorDir.setXYZ(i, dir.x, dir.y, dir.z)
      b.washFloorColor.setXYZ(i, color.r, color.g, color.b)
      b.washFloorOpacity.setX(i, opacity)
      b.washFloorCosHalfAngle.setX(i, cosHalfAngle)
    },
    writeWashRegionVisibility(slot, pixelIdx, regionIdx, visible) {
      b.washRegionVisible.setX(
        washRegionInstanceIndex(slot, pixelIdx, b.regionCount, regionIdx),
        visible ? 1 : 0,
      )
    },
    writeWashRegionAttrs(slot, pixelIdx, origin, dir, color, opacity, cosHalfAngle) {
      const i = washPixelIndex(slot, pixelIdx)
      b.washRegionOrigin.setXYZ(i, origin.x, origin.y, origin.z)
      b.washRegionDir.setXYZ(i, dir.x, dir.y, dir.z)
      b.washRegionColor.setXYZ(i, color.r, color.g, color.b)
      b.washRegionOpacity.setX(i, opacity)
      b.washRegionCosHalfAngle.setX(i, cosHalfAngle)
    },

    hideLobes,
    hideSlot(slot) {
      hideLobes(slot, 0)
    },
    hideWashSlot(slot) {
      for (let p = 0; p < MAX_WASH_PIXELS; p++) {
        const pix = washPixelIndex(slot, p)
        b.washFloorMesh.setMatrixAt(pix, ZERO_MATRIX)
        for (let r = 0; r < b.regionCount; r++) {
          b.washRegionVisible.setX(washRegionInstanceIndex(slot, p, b.regionCount, r), 0)
        }
      }
    },
  }
}
