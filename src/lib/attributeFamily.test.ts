import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTE_FAMILIES,
  familyForCategory,
  familySlug,
  parseFamilySlug,
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
