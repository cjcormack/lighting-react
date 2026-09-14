/**
 * Fan/spread interpolation: apply a value as a first→last gradient across an
 * ordered selection (intensity ramps, colour fades across a bar).
 *
 * Scope is sliders and colour only, on purpose:
 * - Settings: interpolating a wheel channel lands mid-range on undefined DMX
 *   values (half a gobo, a shaking prism) — not meaningful.
 * - Position: a useful position "fan" is a geometric spread about a focal
 *   point, which is what the backend's group distribution machinery
 *   (panOffset/tiltOffset, DistributionStrategy) is for. A naive pan lerp is
 *   rarely what anyone wants.
 */

function lerpChannel(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * t)
}

/**
 * n values linearly interpolated from `from` to `to`, endpoints exact.
 * n === 1 gets `to` (fanning one fixture means "set it to the target").
 */
export function fanValues(from: number, to: number, n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [to]
  return Array.from({ length: n }, (_, i) => lerpChannel(from, to, i / (n - 1)))
}

export interface FanColour {
  r: number
  g: number
  b: number
  w?: number
  a?: number
  uv?: number
}

/**
 * Per-channel RGB-space interpolation. HSV/hue-arc fades are prettier but
 * ambiguous (which way round the wheel?) — keep v1 predictable; the backend's
 * group FX own fancy distribution. W/A/UV interpolate only when defined on
 * both endpoints (otherwise the channel is omitted and left untouched).
 */
export function fanColours(from: FanColour, to: FanColour, n: number): FanColour[] {
  if (n <= 0) return []
  if (n === 1) return [{ ...to }]
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    const colour: FanColour = {
      r: lerpChannel(from.r, to.r, t),
      g: lerpChannel(from.g, to.g, t),
      b: lerpChannel(from.b, to.b, t),
    }
    if (from.w !== undefined && to.w !== undefined) colour.w = lerpChannel(from.w, to.w, t)
    if (from.a !== undefined && to.a !== undefined) colour.a = lerpChannel(from.a, to.a, t)
    if (from.uv !== undefined && to.uv !== undefined) colour.uv = lerpChannel(from.uv, to.uv, t)
    return colour
  })
}

/**
 * Addresses re-spaced from a start channel — the patch list's Fan, and the arithmetic behind its
 * consecutive Set.
 *
 * `step` is a fixed gap between one fixture's start and the next; **null means each fixture's own
 * footprint**, which is what every desk surveyed does by default (Eos `1 Thru 10 @ 1` auto-offsets
 * by type, Hog follows on, MA3's Edit Patch is consecutive) and what a Set over N addresses lands
 * as. `footprints` is in visible-row order, one per head, and the result is index-parallel to it.
 *
 * Channels only. The universe is not part of the walk because the patch PUT cannot move a head to
 * another universe — every head keeps its own, and `patchAddress.ts` checks each landing against
 * the heads on that universe. A walk past 512 is returned as it is, so the caller can name the
 * overflow rather than have it silently wrap or clamp onto the last head.
 */
export function fanAddresses(from: number, step: number | null, footprints: readonly number[]): number[] {
  const out: number[] = []
  let next = from
  for (const footprint of footprints) {
    out.push(next)
    next += step ?? Math.max(1, footprint)
  }
  return out
}

/**
 * Fade times spread first→last across a selection — the cue sheet's Fan.
 *
 * Milliseconds in, milliseconds out, endpoints exact, rounded to whole ms; `n === 1` gets `to`
 * exactly as `fanValues` does. One spread for now, *linear*; the control that names it is on the
 * popover so a second one can be added without the arithmetic moving.
 */
export function fanDurations(fromMs: number, toMs: number, n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [toMs]
  return Array.from({ length: n }, (_, i) => Math.round(fromMs + (toMs - fromMs) * (i / (n - 1))))
}
