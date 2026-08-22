import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTE_FAMILIES,
  familyForCategory,
  familySlug,
  parseFamilySlug,
  parsePropertyMask,
  serializePropertyMask,
} from './attributeFamily'

describe('attribute family slugs', () => {
  it('round-trips every family', () => {
    for (const type of ATTRIBUTE_FAMILIES) {
      expect(parseFamilySlug(familySlug(type))).toBe(type)
    }
  })

  it('rejects anything else, so a bad URL redirects rather than rendering blank', () => {
    for (const raw of ['COLOUR', 'colours', 'Colour', '', 'gobo', undefined]) {
      expect(parseFamilySlug(raw), String(raw)).toBeNull()
    }
  })
})

describe('familyForCategory', () => {
  it('mirrors the backend mask groups on the two non-obvious families', () => {
    // Strobe with the intensities, and every extra emitter with colour — the backend records
    // "the colour" including amber/white/UV, and splitting them out would record half a look.
    expect(familyForCategory('strobe')).toBe('INTENSITY')
    for (const emitter of ['colour', 'amber', 'white', 'uv']) {
      expect(familyForCategory(emitter), emitter).toBe('COLOUR')
    }
  })

  it('treats the synthetic position category as POSITION, not as an unknown', () => {
    // `position` is the pan/tilt pair and has no PropertyCategory of its own, so without its
    // own case it would fall into the BEAM catch-all and offer beam palettes on a position row.
    expect(familyForCategory('position')).toBe('POSITION')
    expect(familyForCategory('pan')).toBe('POSITION')
    expect(familyForCategory('tilt_fine')).toBe('POSITION')
  })

  it('files an unrecognised category under BEAM rather than throwing', () => {
    // Group property descriptors carry an untyped category off the wire, and a newer backend
    // can name a category this client has never heard of.
    expect(familyForCategory('some_future_category')).toBe('BEAM')
  })
})

describe('propertyMask round-trip', () => {
  it('parses the comma-separated wire form into families', () => {
    expect(parsePropertyMask('COLOUR')).toEqual(['COLOUR'])
    expect(parsePropertyMask('COLOUR,POSITION')).toEqual(['POSITION', 'COLOUR'])
  })

  it('answers "every family" for all three spellings of no mask', () => {
    // null, undefined and '' all mean unmasked, and `MaskPicker` reads [] as "All attributes" —
    // so the three agree without a translation step.
    expect(parsePropertyMask(null)).toEqual([])
    expect(parsePropertyMask(undefined)).toEqual([])
    expect(parsePropertyMask('')).toEqual([])
  })

  it('normalises whitespace and case, and returns families in canonical order', () => {
    // A mask has one canonical spelling, so re-selecting the same families is not a change and
    // does not PATCH the cue.
    expect(parsePropertyMask(' colour , POSITION ')).toEqual(['POSITION', 'COLOUR'])
    expect(serializePropertyMask(['COLOUR', 'POSITION'])).toBe('POSITION,COLOUR')
  })

  it('drops a family it does not recognise rather than rejecting the mask', () => {
    // A newer backend can name a family this client has never heard of; the operator should still
    // be able to edit the ones it does know.
    expect(parsePropertyMask('COLOUR,WARP_DRIVE')).toEqual(['COLOUR'])
  })

  it('serializes both an empty and a complete selection to no mask', () => {
    // The load-bearing case. All four families compose identically to no mask, but they are not the
    // same stored value — `propertyMask` distinguishes null from a string, so a four-family mask
    // would render a badge that says nothing and would become noise if a fifth family appeared.
    expect(serializePropertyMask([])).toBeNull()
    expect(serializePropertyMask(ATTRIBUTE_FAMILIES)).toBeNull()
  })

  it('round-trips a partial mask unchanged', () => {
    for (const mask of ['INTENSITY', 'POSITION,COLOUR', 'INTENSITY,POSITION,BEAM']) {
      expect(serializePropertyMask(parsePropertyMask(mask)), mask).toBe(mask)
    }
  })
})
