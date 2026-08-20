import { describe, expect, it, vi } from 'vitest'

// columns.ts reaches the store, and lightingApi opens a real WebSocket at import.
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import { paletteCoverageWarnings, planPaletteRefWrites } from './applyPalette'
import { chan, colourProp, makeFixture, sliderProp } from '@/test/fixtureFactories'
import type { Palette, PaletteEntry } from '@/api/palettesApi'
import type { WriteTarget } from '@/components/fixtures-list/rowModel'

const UUID = '11111111-2222-3333-4444-555555555555'
const REF = `ref:${UUID}`

function palette(overrides: Partial<Palette> = {}): Palette {
  return {
    id: 1,
    uuid: UUID,
    name: 'Warm Amber',
    type: 'COLOUR',
    sortOrder: 0,
    entries: [],
    referenceCount: 0,
    referencedByCueIds: [],
    referencedByPresets: [],
    ...overrides,
  }
}

function fixtureEntry(targetKey: string, propertyName = 'rgbColour'): PaletteEntry {
  return { targetType: 'fixture', targetKey, propertyName, value: '#ff8800', sortOrder: 0 }
}

/** A head with colour mixing, a dimmer and a pan/tilt slider pair. */
function mover(key: string): WriteTarget {
  return makeFixture(key, [
    sliderProp('dimmer', 'dimmer', chan(1)),
    colourProp('rgbColour', chan(2), chan(3), chan(4)),
    // `axis` is what pairs two sliders into the Position column — the category alone doesn't.
    sliderProp('pan', 'pan', chan(5), { axis: 'PAN' }),
    sliderProp('tilt', 'tilt', chan(6), { axis: 'TILT' }),
  ])
}

/** A dimmer-only channel: nothing a colour or position palette can apply to. */
function dimmerOnly(key: string): WriteTarget {
  return makeFixture(key, [sliderProp('dimmer', 'dimmer', chan(1))])
}

describe('planPaletteRefWrites', () => {
  it('writes the reference, not the palette’s values', () => {
    // The row keeps tracking the palette — writing the resolved literal instead would make Apply
    // a one-off copy and quietly remove the whole point of the feature.
    expect(planPaletteRefWrites(palette(), [mover('a')])).toEqual([
      { targetKey: 'a', propertyName: 'rgbColour', value: REF },
    ])
  })

  it('writes both axes for a pan/tilt slider pair from one POSITION palette', () => {
    // One palette "cell" legitimately becomes two references: the programmer is keyed by the
    // fixture's own property names, and this shape has two independent axis properties.
    const writes = planPaletteRefWrites(palette({ type: 'POSITION' }), [mover('a')])
    expect(writes.map((w) => w.propertyName).sort()).toEqual(['pan', 'tilt'])
  })

  it('plans nothing for a fixture with no property in the palette’s family', () => {
    expect(planPaletteRefWrites(palette(), [dimmerOnly('d')])).toEqual([])
  })

  it('covers each of the four types with the columns that type owns', () => {
    const targets = [mover('a')]
    expect(planPaletteRefWrites(palette({ type: 'INTENSITY' }), targets)).toEqual([
      { targetKey: 'a', propertyName: 'dimmer', value: REF },
    ])
    expect(planPaletteRefWrites(palette({ type: 'BEAM' }), targets)).toEqual([])
  })
})

describe('paletteCoverageWarnings', () => {
  it('says nothing when the palette covers every applicable target', () => {
    const targets = [mover('a'), mover('b')]
    const p = palette({ entries: [fixtureEntry('a'), fixtureEntry('b')] })
    expect(paletteCoverageWarnings(p, targets, planPaletteRefWrites(p, targets))).toEqual([])
  })

  it('names the fixtures the palette doesn’t cover', () => {
    // Silence here would read as success — the operator would walk away believing nine heads
    // took the look when six did.
    const targets = [mover('a'), mover('b'), mover('c')]
    const p = palette({ entries: [fixtureEntry('a')] })
    const [warning] = paletteCoverageWarnings(p, targets, planPaletteRefWrites(p, targets))
    expect(warning).toContain('Applied to 1 of 3')
    expect(warning).toContain('b, c')
    expect(warning).toContain('Warm Amber')
  })

  it('truncates a long skip list rather than naming forty heads', () => {
    const targets = ['a', 'b', 'c', 'd', 'e'].map(mover)
    const p = palette({ entries: [] })
    const [inapplicable] = paletteCoverageWarnings(p, targets, planPaletteRefWrites(p, targets))
    expect(inapplicable).toContain('and 2 more')
  })

  it('reports coverage as unknown when the palette holds group rows', () => {
    // Expanding a group row needs a per-group member fetch this path doesn't make. Claiming the
    // fixture is uncovered would send the operator to re-record a palette that was already right.
    const targets = [mover('a')]
    const p = palette({
      entries: [{ targetType: 'group', targetKey: 'Wash', propertyName: 'rgbColour', value: '#ff8800', sortOrder: 0 }],
    })
    const [warning] = paletteCoverageWarnings(p, targets, planPaletteRefWrites(p, targets))
    expect(warning).toContain('doesn’t name')
    expect(warning).toContain('group rows')
  })

  it('separates “no such property” from “not in the palette”', () => {
    // Different fixes: one fixture was never applicable, the other needs the palette re-recorded
    // with it selected.
    const targets = [mover('a'), dimmerOnly('d')]
    const p = palette({ entries: [] })
    const warnings = paletteCoverageWarnings(p, targets, planPaletteRefWrites(p, targets))
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('no colour properties')
    expect(warnings[0]).toContain('d')
    expect(warnings[1]).toContain('Applied to 0 of 1')
  })
})
