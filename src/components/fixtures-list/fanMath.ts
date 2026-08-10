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
