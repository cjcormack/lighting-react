import { describe, expect, it, vi } from 'vitest'

// useRowOwnership pulls in the lighting API, which opens a WebSocket at import time.
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import { buildRows } from './rowModel'
import { buildRowCells } from './useRowValues'
import { aggregateCellOwnership } from './useRowOwnership'
import { chan, colourProp, groupSummary, makeFixture, sliderProp } from '@/test/fixtureFactories'
import type { ProgrammerEntry, ProgrammerKeyState, ProvenanceSource } from '@/api/programmerWsApi'
import type { CellPropertyKey } from './useRowValues'

function entry(overrides: Partial<ProgrammerEntry> = {}): ProgrammerEntry {
  return {
    targetKey: 'f1',
    propertyName: 'dimmer',
    value: '200',
    owner: 'web',
    touched: true,
    owners: ['web'],
    ...overrides,
  }
}

/** Build a lookup from a plain `"key|prop" → state` map. */
function lookupFrom(states: Record<string, ProgrammerKeyState>) {
  return (targetKey: string, propertyName: string): ProgrammerKeyState =>
    states[`${targetKey}|${propertyName}`] ?? {}
}

function provenance(source: ProvenanceSource): ProgrammerKeyState {
  return { provenance: { targetKey: 'f1', propertyName: 'dimmer', source } }
}

const KEY: CellPropertyKey[] = [{ targetKey: 'f1', propertyName: 'dimmer' }]

describe('aggregateCellOwnership', () => {
  it('returns undefined for a cell backing no properties', () => {
    expect(aggregateCellOwnership([], false, lookupFrom({}))).toBeUndefined()
  })

  it('reads baseline when nothing asserts the property', () => {
    const result = aggregateCellOwnership(KEY, false, lookupFrom({}))
    expect(result).toMatchObject({ source: 'baseline', isUniform: true, touched: false })
  })

  it('maps each provenance source onto its cell source', () => {
    const cases: Array<[ProvenanceSource, string]> = [
      ['PARKED', 'parked'],
      ['PROGRAMMER', 'programmer'],
      ['EFFECT', 'effect'],
      ['CUE', 'cue'],
    ]
    for (const [wire, expected] of cases) {
      const result = aggregateCellOwnership(
        KEY,
        false,
        lookupFrom({ 'f1|dimmer': provenance(wire) }),
      )
      expect(result?.source).toBe(expected)
    }
  })

  it('surfaces the programmer owners and the group a write came through', () => {
    const result = aggregateCellOwnership(
      KEY,
      false,
      lookupFrom({
        'f1|dimmer': {
          entry: entry({ owners: ['locate', 'web'], sourceGroup: 'Wash' }),
          ...provenance('PROGRAMMER'),
        },
      }),
    )
    expect(result?.owners).toEqual(['locate', 'web'])
    expect(result?.sourceGroup).toBe('Wash')
    expect(result?.touched).toBe(true)
  })

  it('treats an untouched hand-down as programmer-owned but not an operator edit', () => {
    // An unpark hand-down is releasable like any manual write, but must never read as
    // something Record would pick up.
    const result = aggregateCellOwnership(
      KEY,
      false,
      lookupFrom({
        'f1|dimmer': {
          entry: entry({ owner: 'unpark', touched: false, owners: ['unpark'] }),
          ...provenance('PROGRAMMER'),
        },
      }),
    )
    expect(result?.source).toBe('programmer')
    expect(result?.touched).toBe(false)
  })

  it('reads programmer while blind even though provenance reports the layer underneath', () => {
    // Blind gates the programmer out of the merge, so the engine's provenance names the cue.
    // The cell is still the operator's to edit and must be coloured as theirs.
    const result = aggregateCellOwnership(
      KEY,
      true,
      lookupFrom({ 'f1|dimmer': { entry: entry() } }),
    )
    expect(result?.source).toBe('programmer')
  })

  it('flags a mixed cell and reports the most significant source', () => {
    const keys: CellPropertyKey[] = [
      { targetKey: 'f1', propertyName: 'dimmer' },
      { targetKey: 'f2', propertyName: 'dimmer' },
    ]
    const result = aggregateCellOwnership(
      keys,
      false,
      lookupFrom({
        'f1|dimmer': provenance('CUE'),
        'f2|dimmer': provenance('PARKED'),
      }),
    )
    // Park outranks everything: it is the one state where the rig ignores the operator.
    expect(result).toMatchObject({ source: 'parked', isUniform: false })
  })

  it('ranks programmer above effect and cue but below parked', () => {
    const keys: CellPropertyKey[] = [
      { targetKey: 'f1', propertyName: 'dimmer' },
      { targetKey: 'f2', propertyName: 'dimmer' },
    ]
    expect(
      aggregateCellOwnership(
        keys,
        false,
        lookupFrom({ 'f1|dimmer': provenance('EFFECT'), 'f2|dimmer': provenance('PROGRAMMER') }),
      )?.source,
    ).toBe('programmer')
  })

  it('stages a value only while blind, and only when the cell agrees on it', () => {
    const keys: CellPropertyKey[] = [
      { targetKey: 'f1', propertyName: 'dimmer' },
      { targetKey: 'f2', propertyName: 'dimmer' },
    ]
    const agreeing = lookupFrom({
      'f1|dimmer': { entry: entry({ value: '200' }) },
      'f2|dimmer': { entry: entry({ targetKey: 'f2', value: '200' }) },
    })

    expect(aggregateCellOwnership(keys, true, agreeing)?.staged).toEqual({
      kind: 'level',
      value: 200,
    })
    // Live: the wire value already is the programmer value, so no substitution.
    expect(aggregateCellOwnership(keys, false, agreeing)?.staged).toBeUndefined()

    const disagreeing = lookupFrom({
      'f1|dimmer': { entry: entry({ value: '200' }) },
      'f2|dimmer': { entry: entry({ targetKey: 'f2', value: '10' }) },
    })
    expect(aggregateCellOwnership(keys, true, disagreeing)?.staged).toBeUndefined()
  })

  it('stages the RESOLVED literal of a reference, not the reference string', () => {
    // A group row on a POSITION palette holds the identical `ref:` value on every head but
    // resolves to a different pan/tilt for each. Comparing `value` reports the cell uniform and
    // paints one head's crosshair for all of them; comparing `resolvedValue` reports the truth.
    const keys: CellPropertyKey[] = [
      { targetKey: 'f1', propertyName: 'position' },
      { targetKey: 'f2', propertyName: 'position' },
    ]
    const ref = { value: 'ref:11111111-2222-3333-4444-555555555555', paletteUuid: '11111111-2222-3333-4444-555555555555' }
    const perHead = lookupFrom({
      'f1|position': { entry: entry({ propertyName: 'position', ...ref, resolvedValue: '10,20' }) },
      'f2|position': {
        entry: entry({ targetKey: 'f2', propertyName: 'position', ...ref, resolvedValue: '200,40' }),
      },
    })
    expect(aggregateCellOwnership(keys, true, perHead)?.staged).toBeUndefined()

    const agreeing = lookupFrom({
      'f1|position': { entry: entry({ propertyName: 'position', ...ref, resolvedValue: '10,20' }) },
      'f2|position': {
        entry: entry({ targetKey: 'f2', propertyName: 'position', ...ref, resolvedValue: '10,20' }),
      },
    })
    expect(aggregateCellOwnership(keys, true, agreeing)?.staged).toEqual({
      kind: 'position',
      pan: 10,
      tilt: 20,
    })
  })

  it('reports the referenced palette when every covered property names the same one', () => {
    const keys: CellPropertyKey[] = [
      { targetKey: 'f1', propertyName: 'rgbColour' },
      { targetKey: 'f2', propertyName: 'rgbColour' },
    ]
    const ref = {
      value: 'ref:11111111-2222-3333-4444-555555555555',
      paletteUuid: '11111111-2222-3333-4444-555555555555',
      paletteId: 7,
      paletteName: 'Warm Amber',
      paletteType: 'COLOUR' as const,
      resolvedValue: '#ff8800',
    }
    const result = aggregateCellOwnership(
      keys,
      false,
      lookupFrom({
        'f1|rgbColour': { entry: entry({ propertyName: 'rgbColour', ...ref }) },
        'f2|rgbColour': { entry: entry({ targetKey: 'f2', propertyName: 'rgbColour', ...ref }) },
      }),
    )
    expect(result?.paletteRef).toEqual({
      uuid: '11111111-2222-3333-4444-555555555555',
      id: 7,
      name: 'Warm Amber',
      type: 'COLOUR',
      resolved: true,
      mixed: false,
    })
  })

  it('calls the reference mixed when only some covered properties hold one', () => {
    // The badge claims "this cell references Warm Amber". With four of twelve heads holding a
    // hand-typed literal that is a confident lie about what Record would capture.
    const keys: CellPropertyKey[] = [
      { targetKey: 'f1', propertyName: 'dimmer' },
      { targetKey: 'f2', propertyName: 'dimmer' },
    ]
    const result = aggregateCellOwnership(
      keys,
      false,
      lookupFrom({
        'f1|dimmer': {
          entry: entry({
            value: 'ref:11111111-2222-3333-4444-555555555555',
            paletteUuid: '11111111-2222-3333-4444-555555555555',
            paletteName: 'Half',
            resolvedValue: '128',
          }),
        },
        'f2|dimmer': { entry: entry({ targetKey: 'f2', value: '128' }) },
      }),
    )
    expect(result?.paletteRef?.mixed).toBe(true)
    // Still uniform by *ownership* — both are programmer-owned. The two flags are independent.
    expect(result?.isUniform).toBe(true)
  })

  it('marks a reference unresolved when the palette no longer covers a target', () => {
    const result = aggregateCellOwnership(
      [{ targetKey: 'f1', propertyName: 'dimmer' }],
      false,
      lookupFrom({
        'f1|dimmer': {
          entry: entry({
            value: 'ref:11111111-2222-3333-4444-555555555555',
            paletteUuid: '11111111-2222-3333-4444-555555555555',
            paletteName: 'Half',
            // Keeps its last resolved value — dropping an operator's entry mid-show would be
            // worse — so `paletteResolved` is the only signal that it has gone stale.
            resolvedValue: '128',
            paletteResolved: false,
          }),
        },
      }),
    )
    expect(result?.paletteRef?.resolved).toBe(false)
  })

  it('leaves paletteRef undefined for a cell holding only literals', () => {
    const result = aggregateCellOwnership(KEY, false, lookupFrom({ 'f1|dimmer': { entry: entry() } }))
    expect(result?.paletteRef).toBeUndefined()
  })

  it('does not stage when only some covered properties are held', () => {
    const keys: CellPropertyKey[] = [
      { targetKey: 'f1', propertyName: 'dimmer' },
      { targetKey: 'f2', propertyName: 'dimmer' },
    ]
    const result = aggregateCellOwnership(
      keys,
      true,
      lookupFrom({ 'f1|dimmer': { entry: entry({ value: '200' }) } }),
    )
    expect(result?.staged).toBeUndefined()
  })
})

describe('buildRowCells keys', () => {
  it('keys a fixture cell by its own key and the backend property name', () => {
    const f = makeFixture('spot', [
      sliderProp('dimmer', 'dimmer', chan(1)),
      colourProp('rgbColour', chan(2), chan(3), chan(4)),
    ])
    const [row] = buildRows({
      fixtures: [f],
      groups: [],
      expandedGroups: new Set(),
      textFilter: '',
    })
    const cells = buildRowCells(row, ['dimmer', 'colour'])
    expect(cells.find((c) => c.col === 'dimmer')?.keys).toEqual([
      { targetKey: 'spot', propertyName: 'dimmer' },
    ])
    expect(cells.find((c) => c.col === 'colour')?.keys).toEqual([
      { targetKey: 'spot', propertyName: 'rgbColour' },
    ])
  })

  it('keys a group cell per member, matching how the backend fans group writes out', () => {
    const a = makeFixture('a', [sliderProp('dimmer', 'dimmer', chan(1))], { groups: ['Wash'] })
    const b = makeFixture('b', [sliderProp('dimmer', 'dimmer', chan(2))], { groups: ['Wash'] })
    const rows = buildRows({
      fixtures: [a, b],
      groups: [groupSummary('Wash', 2)],
      expandedGroups: new Set(),
      textFilter: '',
    })
    expect(buildRowCells(rows[0], ['dimmer'])[0].keys).toEqual([
      { targetKey: 'a', propertyName: 'dimmer' },
      { targetKey: 'b', propertyName: 'dimmer' },
    ])
  })
})
