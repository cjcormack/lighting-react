import { describe, expect, it } from 'vitest'
import {
  isPaletteRefValue,
  parsePaletteRefUuid,
  parseProgrammerEntryValue,
  parseProgrammerValue,
  serializeColour,
  serializeLevel,
  serializePaletteRef,
  serializePosition,
} from './programmerValue'

/** A well-formed palette uuid, shared by the reference cases below. */
const PALETTE_UUID = '2f1c9a54-8d3b-4f7e-9a11-6c0de5b47a02'

describe('parseProgrammerValue', () => {
  it('reads slider and setting levels', () => {
    expect(parseProgrammerValue('0')).toEqual({ kind: 'level', value: 0 })
    expect(parseProgrammerValue('200')).toEqual({ kind: 'level', value: 200 })
    expect(parseProgrammerValue('255')).toEqual({ kind: 'level', value: 255 })
  })

  it('rejects levels outside the DMX byte range', () => {
    expect(parseProgrammerValue('256')).toBeNull()
    expect(parseProgrammerValue('999')).toBeNull()
  })

  it('reads a plain hex colour', () => {
    expect(parseProgrammerValue('#ff0080')).toEqual({
      kind: 'colour',
      r: 255,
      g: 0,
      b: 128,
      w: 0,
      a: 0,
      uv: 0,
    })
  })

  it('reads the extended colour tags the backend emits for non-zero components', () => {
    expect(parseProgrammerValue('#102030;w40;a50;uv60')).toEqual({
      kind: 'colour',
      r: 16,
      g: 32,
      b: 48,
      w: 40,
      a: 50,
      uv: 60,
    })
  })

  it('reads a position pair', () => {
    expect(parseProgrammerValue('12,34')).toEqual({ kind: 'position', pan: 12, tilt: 34 })
  })

  it('does not mistake a position pair for a level', () => {
    // "127" and "127,0" must not collide — the comma is the only discriminator.
    expect(parseProgrammerValue('127')).toEqual({ kind: 'level', value: 127 })
    expect(parseProgrammerValue('127,0')).toEqual({ kind: 'position', pan: 127, tilt: 0 })
  })

  it('accepts the named colours the backend can emit', () => {
    expect(parseProgrammerValue('red')).toEqual({
      kind: 'colour',
      r: 255,
      g: 0,
      b: 0,
      w: 0,
      a: 0,
      uv: 0,
    })
  })

  it('returns null for values it cannot represent, so callers fall back to live DMX', () => {
    // `P1` is the *positional* colour-list ref. It only ever appears inside FX effect params,
    // which resolve it themselves, so returning null here is correct permanently — not a gap.
    expect(parseProgrammerValue('P1')).toBeNull()
    expect(parseProgrammerValue('')).toBeNull()
    expect(parseProgrammerValue('   ')).toBeNull()
    expect(parseProgrammerValue('1,2,3')).toBeNull()
  })

  it('returns null for a named-palette reference, because a reference is not a value', () => {
    // Callers with a whole entry use parseProgrammerEntryValue, which reads the resolved literal
    // the backend sends alongside. This parser must not invent one.
    expect(parseProgrammerValue(`ref:${PALETTE_UUID}`)).toBeNull()
  })

  it('does not coerce arbitrary words into colours', () => {
    // The underlying colour parser treats any three letters in a-f as hex shorthand and
    // returns black for anything else it doesn't recognise, so a gate of "is it alphabetic"
    // silently turned junk into a confident-looking swatch: "bad" → lilac, "gobo" → black.
    expect(parseProgrammerValue('bad')).toBeNull()
    expect(parseProgrammerValue('ace')).toBeNull()
    expect(parseProgrammerValue('gobo')).toBeNull()
    expect(parseProgrammerValue('unknownvalueform')).toBeNull()
  })
})

describe('serialization round-trips', () => {
  it('round-trips a level', () => {
    expect(parseProgrammerValue(serializeLevel(180))).toEqual({ kind: 'level', value: 180 })
  })

  it('clamps and rounds out-of-range levels rather than emitting junk', () => {
    expect(serializeLevel(-5)).toBe('0')
    expect(serializeLevel(300)).toBe('255')
    expect(serializeLevel(127.6)).toBe('128')
  })

  it('round-trips a position', () => {
    expect(parseProgrammerValue(serializePosition(10, 250))).toEqual({
      kind: 'position',
      pan: 10,
      tilt: 250,
    })
  })

  it('round-trips a colour with extended channels', () => {
    expect(parseProgrammerValue(serializeColour(1, 2, 3, 4, 5, 6))).toEqual({
      kind: 'colour',
      r: 1,
      g: 2,
      b: 3,
      w: 4,
      a: 5,
      uv: 6,
    })
  })

  it('omits zero extended channels, matching the backend serializer', () => {
    expect(serializeColour(255, 0, 128)).toBe('#FF0080')
  })
})

describe('named-palette references', () => {
  it('parses a reference to its palette uuid', () => {
    expect(parsePaletteRefUuid(`ref:${PALETTE_UUID}`)).toBe(PALETTE_UUID)
    expect(isPaletteRefValue(`ref:${PALETTE_UUID}`)).toBe(true)
    expect(serializePaletteRef(PALETTE_UUID)).toBe(`ref:${PALETTE_UUID}`)
  })

  it('tolerates surrounding whitespace and upper-case uuids', () => {
    expect(parsePaletteRefUuid(`  ref:${PALETTE_UUID.toUpperCase()}  `)).toBe(PALETTE_UUID)
  })

  it('rejects anything that is not a well-formed reference', () => {
    // Strict on purpose: a corrupt value must read as "not a reference" rather than as a
    // reference to nothing, which would render a broken badge instead of falling back.
    for (const value of ['ref:', 'ref:12', 'ref:not-a-uuid', 'P1', 'P*', '#ff8800', '200', '120,64']) {
      expect(parsePaletteRefUuid(value), value).toBeNull()
      expect(isPaletteRefValue(value), value).toBe(false)
    }
  })

  it('is not confused with the positional colour-list ref helpers', () => {
    // colourUtils.isPaletteRef matches `P1`; these two are easy to mix up and impossible to
    // interchange, which is why they are named differently.
    expect(isPaletteRefValue('P1')).toBe(false)
  })
})

describe('parseProgrammerEntryValue', () => {
  it('reads a literal entry directly', () => {
    expect(parseProgrammerEntryValue({ value: '200' })).toEqual({ kind: 'level', value: 200 })
  })

  it('reads a reference through its resolved literal', () => {
    // Per target and property — a position palette gives every head a different value, so the
    // resolved literal cannot be shared across an entry set.
    expect(
      parseProgrammerEntryValue({ value: `ref:${PALETTE_UUID}`, resolvedValue: '120,64' }),
    ).toEqual({ kind: 'position', pan: 120, tilt: 64 })
  })

  it('returns null for a reference with nothing resolved', () => {
    // The palette no longer covers this target. Callers fall back to the live wire value rather
    // than rendering a guess.
    expect(parseProgrammerEntryValue({ value: `ref:${PALETTE_UUID}` })).toBeNull()
  })
})
