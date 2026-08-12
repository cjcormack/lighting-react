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
