import { describe, expect, it, vi } from 'vitest'

// columns.ts transitively reaches the store, and lightingApi opens a real WebSocket at import.
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import { COLUMN_DEFS } from '@/components/fixtures-list/columns'
import {
  PALETTE_TYPES,
  PALETTE_TYPE_COLUMNS,
  parsePaletteTypeSlug,
  paletteTypeSlug,
} from './paletteTypes'

describe('palette type slugs', () => {
  it('round-trips every type', () => {
    for (const type of PALETTE_TYPES) {
      expect(parsePaletteTypeSlug(paletteTypeSlug(type))).toBe(type)
    }
  })

  it('rejects anything else, so a bad URL redirects rather than rendering blank', () => {
    for (const raw of ['COLOUR', 'colours', 'Colour', '', 'gobo', undefined]) {
      expect(parsePaletteTypeSlug(raw), String(raw)).toBeNull()
    }
  })
})

describe('PALETTE_TYPE_COLUMNS', () => {
  it('assigns every sheet column to exactly one palette type', () => {
    // The invariant that stops a column being editable from two palette pages, or from none.
    const seen = new Map<string, string[]>()
    for (const type of PALETTE_TYPES) {
      for (const column of PALETTE_TYPE_COLUMNS[type]) {
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
    expect(PALETTE_TYPE_COLUMNS.INTENSITY).toContain('strobe')
    expect(PALETTE_TYPE_COLUMNS.BEAM).not.toContain('strobe')
  })
})
