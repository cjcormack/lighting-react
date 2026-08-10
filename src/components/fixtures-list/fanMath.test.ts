import { describe, expect, it } from 'vitest'
import { fanColours, fanValues } from './fanMath'

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
