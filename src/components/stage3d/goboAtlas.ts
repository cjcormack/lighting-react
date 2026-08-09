import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, RedFormat } from 'three'
import { GOBO_SLOT_COUNT } from './beamOptics'

/**
 * Procedural gobo patterns, generated as a layered R8 texture.
 *
 * A `DataArrayTexture` rather than an atlas: a gobo is sampled across a whole
 * floor pool at glancing angles, and neighbouring tiles in an atlas bleed into
 * each other under minification unless you add gutters and clamp by hand. Array
 * layers can't bleed, and the lookup is one `texture(uGobo, vec3(uv, slot))`.
 *
 * At 8 x 128 x 128 x R8 this is 128 KB. The generator is plain `Uint8Array`
 * maths with no `<canvas>`, so it runs (and is tested) under jsdom.
 *
 * Layer 0 is "open" — solid 255. The renderer skips sampling entirely for slot
 * 0, so it exists only to keep the layer index and the gobo slot the same
 * number.
 */
export const GOBO_TILE_PX = 128

/** Number of full-brightness spokes/lobes for the radial patterns. */
const SPOKE_COUNT = 6
const DOT_RING_COUNT = 8

// Smooth 0..1 ramp, mirroring GLSL smoothstep so the patterns anti-alias
// instead of stair-stepping when the pool is drawn large.
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Value of pattern `layer` at normalised disc coordinates. `r` is 0 at the
 * centre and 1 at the beam edge; `a` is the angle in radians.
 */
function patternAt(layer: number, r: number, a: number): number {
  // Everything outside the disc is dark for every pattern — the beam's own
  // cone test already clips there, this just keeps the edge soft.
  const disc = 1 - smoothstep(0.94, 1.0, r)

  switch (layer) {
    case 0:
      return 1
    case 1: {
      // Ring of dots.
      const spoke = a * (DOT_RING_COUNT / (Math.PI * 2))
      const frac = spoke - Math.floor(spoke)
      const dAng = Math.min(frac, 1 - frac) * (Math.PI * 2 * 0.62) / (Math.PI * 2) * 6
      const dRad = Math.abs(r - 0.62)
      const d = Math.hypot(dAng, dRad)
      return disc * (1 - smoothstep(0.1, 0.16, d))
    }
    case 2: {
      // Organic breakup — three offset sinusoids, thresholded.
      const x = r * Math.cos(a)
      const y = r * Math.sin(a)
      const n =
        Math.sin(x * 7.1 + 1.3) * Math.sin(y * 6.3 - 0.7) +
        0.6 * Math.sin(x * 13.7 - 2.1) * Math.sin(y * 11.9 + 0.4)
      return disc * smoothstep(-0.05, 0.35, n)
    }
    case 3: {
      // Radial spokes.
      const s = Math.cos(a * SPOKE_COUNT)
      return disc * smoothstep(0.05, 0.45, s)
    }
    case 4: {
      // Triangular / faceted split.
      const s = Math.cos(a * 3) * (1 - r * 0.5)
      return disc * smoothstep(0.1, 0.5, s)
    }
    case 5: {
      // Concentric rings.
      const rings = Math.cos(r * Math.PI * 2 * 3.5)
      return disc * smoothstep(0.0, 0.5, rings)
    }
    case 6: {
      // Starburst — narrow spikes over a bright hub.
      const spikes = Math.pow(Math.max(0, Math.cos(a * 5)), 8)
      const hub = 1 - smoothstep(0.0, 0.28, r)
      return disc * Math.min(1, hub + spikes * (1 - hub))
    }
    default: {
      // Parallel slats.
      const y = r * Math.sin(a)
      const bars = Math.cos(y * Math.PI * 2 * 3)
      return disc * smoothstep(0.0, 0.4, bars)
    }
  }
}

/**
 * Layer-major R8 bytes for the whole array texture. Deterministic — no
 * `Math.random`, so the profile harness and the tests stay reproducible.
 */
export function buildGoboAtlasData(
  slots = GOBO_SLOT_COUNT,
  size = GOBO_TILE_PX,
): Uint8Array {
  const data = new Uint8Array(slots * size * size)
  for (let layer = 0; layer < slots; layer++) {
    const base = layer * size * size
    for (let py = 0; py < size; py++) {
      // +0.5 samples texel centres, so the pattern is symmetric about the disc.
      const y = ((py + 0.5) / size) * 2 - 1
      for (let px = 0; px < size; px++) {
        const x = ((px + 0.5) / size) * 2 - 1
        const r = Math.hypot(x, y)
        const a = Math.atan2(y, x)
        const v = layer === 0 ? 1 : r > 1 ? 0 : patternAt(layer, r, a)
        data[base + py * size + px] = Math.max(0, Math.min(255, Math.round(v * 255)))
      }
    }
  }
  return data
}

/** Build the GPU texture. Caller owns disposal. */
export function createGoboTexture(): DataArrayTexture {
  const tex = new DataArrayTexture(
    buildGoboAtlasData(),
    GOBO_TILE_PX,
    GOBO_TILE_PX,
    GOBO_SLOT_COUNT,
  )
  tex.format = RedFormat
  tex.magFilter = LinearFilter
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}
