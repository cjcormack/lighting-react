import { describe, expect, it } from 'vitest'
import { fanAddresses, fanColours, fanDurations, fanValues } from './fanMath'

describe('fanValues', () => {
  it('handles degenerate counts', () => {
    expect(fanValues(0, 255, 0)).toEqual([])
    expect(fanValues(0, 255, 1)).toEqual([255])
    expect(fanValues(0, 255, 2)).toEqual([0, 255])
  })

  it('keeps endpoints exact and steps monotonically', () => {
    const values = fanValues(10, 250, 7)
    expect(values).toHaveLength(7)
    expect(values[0]).toBe(10)
    expect(values[6]).toBe(250)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
  })

  it('fans downward when from > to', () => {
    expect(fanValues(255, 0, 3)).toEqual([255, 128, 0])
  })
})

describe('fanColours', () => {
  it('interpolates each RGB channel independently with exact endpoints', () => {
    const colours = fanColours({ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }, 3)
    expect(colours).toEqual([
      { r: 255, g: 0, b: 0 },
      { r: 128, g: 0, b: 128 },
      { r: 0, g: 0, b: 255 },
    ])
  })

  it('interpolates extended channels only when both endpoints define them', () => {
    const colours = fanColours(
      { r: 0, g: 0, b: 0, w: 0, a: 100 },
      { r: 0, g: 0, b: 0, w: 200 },
      3,
    )
    expect(colours.map((c) => c.w)).toEqual([0, 100, 200])
    // `a` is missing on the `to` end: left untouched (undefined) everywhere.
    expect(colours.every((c) => c.a === undefined)).toBe(true)
    expect(colours.every((c) => c.uv === undefined)).toBe(true)
  })

  it('handles degenerate counts', () => {
    expect(fanColours({ r: 0, g: 0, b: 0 }, { r: 9, g: 9, b: 9 }, 0)).toEqual([])
    expect(fanColours({ r: 0, g: 0, b: 0 }, { r: 9, g: 9, b: 9 }, 1)).toEqual([{ r: 9, g: 9, b: 9 }])
  })
})

/**
 * The patch list's Fan on the Address column, and the arithmetic a consecutive Set shares with it.
 * Pinned here rather than through the popover because the whole rule is one walk: a fixed step
 * when given, each head's own footprint when not.
 */
describe('fanAddresses', () => {
  it('lands each head after the previous one by its footprint when the step is blank', () => {
    // Four 6-channel pars and an 18-channel bar: 1, 7, 13, 19, then 25 for the bar.
    expect(fanAddresses(1, null, [6, 6, 6, 6, 18])).toEqual([1, 7, 13, 19, 25])
  })

  it('uses a fixed step regardless of footprint when one is given', () => {
    expect(fanAddresses(1, 20, [6, 18, 16])).toEqual([1, 21, 41])
  })

  it('is index-parallel to the footprints, and empty for none', () => {
    expect(fanAddresses(100, null, [])).toEqual([])
    expect(fanAddresses(100, null, [1])).toEqual([100])
  })

  it('treats a zero footprint as one channel rather than stacking two heads on one address', () => {
    expect(fanAddresses(5, null, [0, 0])).toEqual([5, 6])
  })

  it('walks past 512 rather than clamping — the caller names the overflow', () => {
    expect(fanAddresses(500, null, [8, 8])).toEqual([500, 508])
    expect(fanAddresses(510, null, [8, 8])).toEqual([510, 518])
  })
})

describe('fanDurations', () => {
  it('spreads first→last in whole milliseconds with exact endpoints', () => {
    expect(fanDurations(1000, 4000, 4)).toEqual([1000, 2000, 3000, 4000])
    expect(fanDurations(0, 1000, 3)).toEqual([0, 500, 1000])
  })

  it('handles degenerate counts like fanValues', () => {
    expect(fanDurations(1000, 4000, 0)).toEqual([])
    expect(fanDurations(1000, 4000, 1)).toEqual([4000])
  })

  it('fans downward too', () => {
    expect(fanDurations(3000, 1000, 3)).toEqual([3000, 2000, 1000])
  })
})
