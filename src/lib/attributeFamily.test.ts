import { describe, expect, it, vi } from 'vitest'

// columns.ts transitively reaches the store, and lightingApi opens a real WebSocket at import.
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import { COLUMN_DEFS } from '@/components/fixtures-list/columns'
import {
  ATTRIBUTE_FAMILIES,
  FAMILY_COLUMNS,
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

describe('FAMILY_COLUMNS', () => {
  it('assigns every sheet column to exactly one attribute family', () => {
    // The invariant that stops a column being editable from two palette pages, or from none.
    const seen = new Map<string, string[]>()
    for (const type of ATTRIBUTE_FAMILIES) {
      for (const column of FAMILY_COLUMNS[type]) {
        seen.set(column, [...(seen.get(column) ?? []), type])
      }
    }
    const duplicated = [...seen].filter(([, types]) => types.length > 1)
    expect(duplicated).toEqual([])

    const allColumns = COLUMN_DEFS.map((def) => def.key).sort()
    expect([...seen.keys()].sort()).toEqual(allColumns)
  })

  it('classifies strobe as intensity, matching the backend mask groups', () => {
    // Strobe is an intensity modulation (HTP, like dimmer), not a beam attribute. The backend's
    // PropertyCategory.maskGroup() is the authority; this mirrors it rather than guessing.
    expect(FAMILY_COLUMNS.INTENSITY).toContain('strobe')
    expect(FAMILY_COLUMNS.BEAM).not.toContain('strobe')
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
