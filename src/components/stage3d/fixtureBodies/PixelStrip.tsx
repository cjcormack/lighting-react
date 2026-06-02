import { useEffect, useImperativeHandle, useMemo } from 'react'
import type { Group, Mesh } from 'three'
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  DoubleSide,
  MeshBasicMaterial,
  ShaderMaterial,
} from 'three'
import { BODY_LENS_COLOR, housingColor } from './palette'
import type { PixelColorWriter } from './types'

interface PixelStripProps {
  active: boolean
  pixelCount: number
  lengthM: number
  heightM: number
  depthM: number
  headRef: React.RefObject<Group | null>
  colorsRef: React.RefObject<PixelColorWriter | null>
}

// Each head casts a small, soft, downward glow near the fixture — subtle (not a
// full beam), and coloured per-head so the bar's per-pixel state reads at a
// glance. Short throw + low opacity keeps a row of bars from overloading the view.
//
// Tunables — adjust freely to taste. NB: keep this a ConeGeometry — an
// open-ended frustum here triggered a WebKit transparency artifact (black quad).
const GLOW_LEN = 0.1 // how far the glow reaches below the bar (m)
const GLOW_RADIUS = 0.1 // base radius; larger = wider/blunter cone (less of a point)
const GLOW_MAX_OPACITY = 0.38 // peak additive opacity at full intensity
const GLOW_FADE_POWER = 2 // length falloff; higher concentrates light at the lens, fading to black sooner
const GLOW_EDGE_SOFTNESS = 0.6 // silhouette fade exponent; lower = softer edges

// Soft additive glow: silhouette fade (abs(N·V)) × length fade (bright at the
// lens apex, fading down). Colour/opacity are per-head uniforms; the two fade
// exponents are baked from the tunables above.
const GLOW_VERTEX = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  varying float vAlong;
  void main() {
    vAlong = uv.y;
    vec4 vp = modelViewMatrix * vec4(position, 1.0);
    vViewPos = vp.xyz;
    vViewNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * vp;
  }
`
const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  varying float vAlong;
  void main() {
    vec3 V = normalize(-vViewPos);
    float radial = pow(abs(dot(normalize(vViewNormal), V)), ${GLOW_EDGE_SOFTNESS.toFixed(2)});
    // Bright at the lens (cone apex, uv.y≈1) fading to black at the wide far end
    // (base, uv.y≈0). Clamp the base: pow() of a negative (out-of-range uv) is
    // NaN, which WebKit renders as a black quad under additive blending.
    float fade = pow(clamp(vAlong, 0.0, 1.0), ${GLOW_FADE_POWER.toFixed(2)});
    float a = uOpacity * radial * fade;
    gl_FragColor = vec4(uColor, a);
  }
`

function makeGlowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color('#ffffff') }, uOpacity: { value: 0 } },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
}

/**
 * A strip/bar body with one emissive lens segment + one soft glow per element,
 * evenly pitched along the bar's long axis (local X). The colour sync drives
 * each head's lens and glow imperatively via the published [PixelColorWriter].
 *
 * The segment/glow arrays are built from the same `useMemo([pixelCount])`, so
 * their lengths can never diverge — a mode switch (e.g. 48→10ch) remounts them
 * and rebuilds the writer with the new count in the same commit.
 */
export function PixelStrip({
  active,
  pixelCount,
  lengthM,
  heightM,
  depthM,
  headRef,
  colorsRef,
}: PixelStripProps) {
  const lensRefs = useMemo(
    () => Array.from({ length: pixelCount }, () => ({ current: null as Mesh | null })),
    [pixelCount],
  )
  const glowMats = useMemo(
    () => Array.from({ length: pixelCount }, makeGlowMaterial),
    [pixelCount],
  )
  const glowGeo = useMemo(() => new ConeGeometry(GLOW_RADIUS, GLOW_LEN, 14, 1, true), [])

  useEffect(() => () => glowMats.forEach((m) => m.dispose()), [glowMats])
  useEffect(() => () => glowGeo.dispose(), [glowGeo])

  useImperativeHandle(
    colorsRef,
    (): PixelColorWriter => {
      const paint = (i: number, color: Color, intensity: number) => {
        const lens = lensRefs[i]?.current
        if (lens) {
          const mat = lens.material as MeshBasicMaterial
          mat.color.copy(color)
          // Lens face stays half-lit at idle (it's the lamp body, not the beam).
          mat.opacity = 0.5 + 0.5 * intensity
          mat.transparent = true
        }
        const gm = glowMats[i]
        if (gm) {
          ;(gm.uniforms.uColor.value as Color).copy(color)
          gm.uniforms.uOpacity.value = GLOW_MAX_OPACITY * intensity
        }
      }
      return {
        count: pixelCount,
        setPixel(i, color, intensity) {
          if (i < 0 || i >= pixelCount) return
          paint(i, color, intensity)
        },
        reset() {
          for (let i = 0; i < pixelCount; i++) paint(i, OFF_COLOR, 0)
        },
      }
    },
    [colorsRef, lensRefs, glowMats, pixelCount],
  )

  const pitch = lengthM / pixelCount
  const segLen = pitch * 0.9
  const segDepth = depthM * 0.85
  const lensY = -heightM / 2 - 0.001

  return (
    <group ref={headRef}>
      <mesh>
        <boxGeometry args={[lengthM, heightM, depthM]} />
        <meshStandardMaterial color={housingColor(active)} />
      </mesh>
      {lensRefs.map((ref, i) => {
        const x = -lengthM / 2 + pitch * (i + 0.5)
        return (
          <group key={i}>
            <mesh
              ref={(m) => {
                ref.current = m
              }}
              position={[x, lensY, 0]}
            >
              <boxGeometry args={[segLen, 0.01, segDepth]} />
              <meshBasicMaterial color={BODY_LENS_COLOR} transparent />
            </mesh>
            <mesh geometry={glowGeo} material={glowMats[i]} position={[x, lensY - GLOW_LEN / 2, 0]} />
          </group>
        )
      })}
    </group>
  )
}

const OFF_COLOR = new Color('#000000')
