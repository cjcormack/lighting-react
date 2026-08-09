import { describe, it, expect } from 'vitest'
import {
  GOBO_SLOT_COUNT,
  PRISM_FACETS,
  computeBeamGeom,
  evalLedMacro,
  evalMovementMacro,
  makeBeamGeom,
  resolveFocusParam,
  resolveGoboSlot,
  resolveGoboSpin,
  resolveMacroIndex,
  resolvePrismFacets,
  settingBand,
} from './beamOptics'
import type {
  SettingOption,
  SettingPropertyDescriptor,
  SliderPropertyDescriptor,
} from '../../store/fixtures'

function opts(pairs: [string, number][]): SettingOption[] {
  return pairs.map(([name, level]) => ({ name, level, displayName: name }))
}

function setting(
  options: SettingOption[],
  category: SettingPropertyDescriptor['category'] = 'gobo',
): SettingPropertyDescriptor {
  return {
    type: 'setting',
    name: 'x',
    displayName: 'X',
    category,
    channel: { universe: 1, channelNo: 1 },
    options,
  }
}

function slider(
  over: Partial<SliderPropertyDescriptor> = {},
): SliderPropertyDescriptor {
  return {
    type: 'slider',
    name: 'x',
    displayName: 'X',
    category: 'focus',
    channel: { universe: 1, channelNo: 1 },
    min: 0,
    max: 255,
    ...over,
  }
}

// The real Equinox Fusion 100 Spot MKII enums.
const FUSION_GOBO = opts([
  ['OPEN_WHITE', 0],
  ['GOBO_1', 9],
  ['GOBO_2', 34],
  ['GOBO_3', 59],
  ['GOBO_4', 84],
  ['GOBO_5', 109],
  ['RAINBOW_EFFECT', 134],
  ['REVERSE_RAINBOW_EFFECT', 195],
])
const FUSION_GOBO_ROT = opts([
  ['ROTATION_STOP', 0],
  ['FORWARD_ROTATION_FAST', 10],
  ['FORWARD_ROTATION_SLOW', 129],
  ['ROTATION_STOP_2', 130],
  ['REVERSE_ROTATION_SLOW', 135],
  ['REVERSE_ROTATION_FAST', 255],
])

describe('settingBand', () => {
  it('derives band ends from the next option start', () => {
    expect(settingBand(FUSION_GOBO, 0)).toMatchObject({ start: 0, end: 8, index: 0 })
    expect(settingBand(FUSION_GOBO, 9)).toMatchObject({ start: 9, end: 33, index: 1 })
    expect(settingBand(FUSION_GOBO, 20)).toMatchObject({ start: 9, end: 33, index: 1 })
    expect(settingBand(FUSION_GOBO, 33)).toMatchObject({ start: 9, end: 33, index: 1 })
    expect(settingBand(FUSION_GOBO, 34)).toMatchObject({ start: 34, index: 2 })
  })

  it('runs the last band to 255', () => {
    expect(settingBand(FUSION_GOBO, 255)).toMatchObject({ start: 195, end: 255, index: 7 })
  })

  it('handles a level below the first option and an empty list', () => {
    expect(settingBand(opts([['A', 10]]), 0)).toMatchObject({ start: 10, end: 255, index: 0 })
    expect(settingBand([], 100)).toMatchObject({ index: -1 })
  })

  // The frontend rule is "last option at or below", which is correct band
  // semantics. Pinned because the backend's valueForLevel does the opposite.
  it('picks the band a value sits inside, not the next one up', () => {
    expect(settingBand(FUSION_GOBO, 20).index).toBe(1) // GOBO_1, not GOBO_2
  })
})

describe('resolveGoboSlot', () => {
  it('is 0 for the open position and for a missing property', () => {
    expect(resolveGoboSlot(setting(FUSION_GOBO), 0)).toBe(0)
    expect(resolveGoboSlot(undefined, 200)).toBe(0)
  })

  it('gives each wheel position a distinct non-zero slot', () => {
    const slots = [9, 34, 59, 84, 109].map((l) => resolveGoboSlot(setting(FUSION_GOBO), l))
    expect(new Set(slots).size).toBe(slots.length)
    for (const s of slots) {
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThan(GOBO_SLOT_COUNT)
    }
  })

  it('prefers a declared goboSlot over the index fallback', () => {
    const declared = setting([
      { name: 'OPEN', level: 0, displayName: 'Open' },
      { name: 'MYSTERY', level: 10, displayName: 'Mystery', goboSlot: 5 },
    ])
    expect(resolveGoboSlot(declared, 10)).toBe(5)
  })

  it('clamps a declared slot into range', () => {
    const declared = setting([
      { name: 'X', level: 0, displayName: 'X', goboSlot: 99 },
    ])
    expect(resolveGoboSlot(declared, 0)).toBe(GOBO_SLOT_COUNT - 1)
  })

  it('treats descriptive Martin-style names as ordinary positions', () => {
    const martin = opts([
      ['OPEN', 0],
      ['FIBROID', 20],
      ['DEC_BEAM', 40],
      ['CONE_SHAKE', 60],
    ])
    expect(resolveGoboSlot(setting(martin), 0)).toBe(0)
    expect(resolveGoboSlot(setting(martin), 20)).toBeGreaterThan(0)
    expect(resolveGoboSlot(setting(martin), 40)).not.toBe(
      resolveGoboSlot(setting(martin), 20),
    )
  })
})

describe('resolveGoboSpin', () => {
  it('is zero when stopped or absent', () => {
    expect(resolveGoboSpin(setting(FUSION_GOBO_ROT, 'gobo_rotation'), 0)).toBe(0)
    expect(resolveGoboSpin(setting(FUSION_GOBO_ROT, 'gobo_rotation'), 130)).toBe(0)
    expect(resolveGoboSpin(undefined, 200)).toBe(0)
  })

  it('signs forward positive and reverse negative', () => {
    const p = setting(FUSION_GOBO_ROT, 'gobo_rotation')
    expect(resolveGoboSpin(p, 50)).toBeGreaterThan(0) // FORWARD_ROTATION_FAST
    expect(resolveGoboSpin(p, 129)).toBeGreaterThan(0) // FORWARD_ROTATION_SLOW
    expect(resolveGoboSpin(p, 140)).toBeLessThan(0) // REVERSE_ROTATION_SLOW
    expect(resolveGoboSpin(p, 255)).toBeLessThan(0) // REVERSE_ROTATION_FAST
  })

  // The Fusion lists FAST before SLOW, so direction and speed must come from the
  // band's name rather than its position in the list.
  it('reads speed from the band name, not its ordinal', () => {
    const p = setting(FUSION_GOBO_ROT, 'gobo_rotation')
    const fast = resolveGoboSpin(p, 120) // deep into FORWARD_ROTATION_FAST
    const slow = resolveGoboSpin(p, 129) // FORWARD_ROTATION_SLOW
    expect(fast).toBeGreaterThan(slow)
  })

  it('uses the 0-stop / 1-127 forward / 128-255 reverse slider convention', () => {
    const p = slider({ category: 'gobo_rotation' })
    expect(resolveGoboSpin(p, 0)).toBe(0)
    expect(resolveGoboSpin(p, 127)).toBeGreaterThan(0)
    expect(resolveGoboSpin(p, 64)).toBeLessThan(resolveGoboSpin(p, 127))
    expect(resolveGoboSpin(p, 255)).toBeLessThan(0)
    expect(Math.abs(resolveGoboSpin(p, 255))).toBeGreaterThan(
      Math.abs(resolveGoboSpin(p, 190)),
    )
  })
})

describe('resolvePrismFacets', () => {
  const fusionPrism = setting(opts([['OPEN', 0], ['PRISM', 8]]), 'prism')

  it('is out at the open position and in above it', () => {
    expect(resolvePrismFacets(fusionPrism, 0)).toBe(0)
    expect(resolvePrismFacets(fusionPrism, 7)).toBe(0)
    expect(resolvePrismFacets(fusionPrism, 8)).toBe(PRISM_FACETS)
    expect(resolvePrismFacets(fusionPrism, 255)).toBe(PRISM_FACETS)
  })

  it('is out when the fixture has no prism', () => {
    expect(resolvePrismFacets(undefined, 255)).toBe(0)
  })
})

describe('resolveFocusParam', () => {
  it('normalises across the slider range', () => {
    expect(resolveFocusParam(slider(), 0)).toBe(0)
    expect(resolveFocusParam(slider(), 255)).toBe(1)
    expect(resolveFocusParam(slider(), 128)).toBeCloseTo(0.502, 2)
  })

  it('is null without a focus channel, so the type default stands', () => {
    expect(resolveFocusParam(undefined, 128)).toBeNull()
    expect(resolveFocusParam(slider({ min: 5, max: 5 }), 5)).toBeNull()
  })
})

describe('resolveMacroIndex', () => {
  const ledMacro = setting(
    opts([
      ['NO_FUNCTION', 0],
      ['LED_MACRO_1', 8],
      ['LED_MACRO_2', 48],
      ['SOUND_ACTIVE', 248],
    ]),
    'led_macro',
  )

  it('is 0 for the no-function band', () => {
    expect(resolveMacroIndex(ledMacro, 0)).toBe(0)
    expect(resolveMacroIndex(ledMacro, 7)).toBe(0)
    expect(resolveMacroIndex(undefined, 200)).toBe(0)
  })

  it('numbers the running programs', () => {
    expect(resolveMacroIndex(ledMacro, 8)).toBe(1)
    expect(resolveMacroIndex(ledMacro, 48)).toBe(2)
    // No audio input exists, so sound-active is treated as just another program
    // rather than silently doing nothing.
    expect(resolveMacroIndex(ledMacro, 248)).toBeGreaterThan(0)
  })
})

describe('macro evaluators', () => {
  it('are inert at index 0', () => {
    const m = evalMovementMacro(0, 3.2, { panDeg: 9, tiltDeg: 9 })
    expect(m).toEqual({ panDeg: 0, tiltDeg: 0 })
    const c = evalLedMacro(0, 3.2, { hueShift: 9, intensityScale: 9 })
    expect(c).toEqual({ hueShift: 0, intensityScale: 1 })
  })

  it('are deterministic in (index, t)', () => {
    const a = evalMovementMacro(2, 1.75, { panDeg: 0, tiltDeg: 0 })
    const b = evalMovementMacro(2, 1.75, { panDeg: 0, tiltDeg: 0 })
    expect(a).toEqual(b)
  })

  it('close over their period', () => {
    for (const idx of [1, 2, 3]) {
      const at0 = evalMovementMacro(idx, 0, { panDeg: 0, tiltDeg: 0 })
      const at6 = evalMovementMacro(idx, 6, { panDeg: 0, tiltDeg: 0 })
      expect(at6.panDeg).toBeCloseTo(at0.panDeg, 9)
      expect(at6.tiltDeg).toBeCloseTo(at0.tiltDeg, 9)
    }
  })

  it('keeps macro intensity within a sane range', () => {
    for (let t = 0; t < 6; t += 0.25) {
      for (const idx of [1, 2, 3]) {
        const c = evalLedMacro(idx, t, { hueShift: 0, intensityScale: 0 })
        expect(c.intensityScale).toBeGreaterThan(0)
        expect(c.intensityScale).toBeLessThanOrEqual(1)
        expect(c.hueShift).toBeGreaterThanOrEqual(0)
        expect(c.hueShift).toBeLessThan(1)
      }
    }
  })

  it('writes into the caller-provided struct', () => {
    const out = { panDeg: 0, tiltDeg: 0 }
    expect(evalMovementMacro(1, 1, out)).toBe(out)
  })
})

describe('computeBeamGeom', () => {
  const LEN = 8
  const SLACK = (3 * Math.PI) / 180

  it('matches the closed form for a known angle', () => {
    const g = computeBeamGeom(30, LEN, SLACK, makeBeamGeom())
    expect(g.beamRadius).toBeCloseTo(LEN * Math.tan(Math.PI / 12), 9)
    expect(g.cosHalfBeam).toBeCloseTo(Math.cos(Math.PI / 12), 9)
    expect(g.floorSide).toBeCloseTo(2 * LEN * Math.sin(Math.PI / 12 + SLACK), 9)
  })

  it('widens monotonically with the beam angle', () => {
    let prev = -Infinity
    for (const deg of [5, 15, 30, 60, 90]) {
      const g = computeBeamGeom(deg, LEN, SLACK, makeBeamGeom())
      expect(g.beamRadius).toBeGreaterThan(prev)
      prev = g.beamRadius
    }
  })

  it('reuses the struct so the frame loop allocates nothing', () => {
    const g = makeBeamGeom()
    expect(computeBeamGeom(30, LEN, SLACK, g)).toBe(g)
    expect(g.beamDeg).toBe(30)
  })

  it('starts dirty so the first frame always computes', () => {
    expect(makeBeamGeom().beamDeg).toBeNaN()
  })
})
