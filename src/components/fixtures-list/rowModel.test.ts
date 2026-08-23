import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import {
  buildRows,
  clampCommitToResolution,
  commitMatchesResolution,
  expandSelectionToTargets,
  fixtureSelectParam,
  groupSelectParam,
  parseSelectParam,
  planBatchWrites,
  type RowId,
} from './rowModel'
import { resolveCell } from './columns'
import type { ColumnKey } from './columns'
import { cellKey, cellsByColumn } from './cellSelectionModel'
import {
  chan,
  colourProp,
  element,
  groupSummary,
  makeFixture,
  makePixelBar,
  settingProp,
  sliderProp,
} from '@/test/fixtureFactories'

const dimmerOnly = () => [sliderProp('dimmer', 'dimmer', chan(1))]

describe('buildRows', () => {
  const spotA = makeFixture('spotA', dimmerOnly(), { groups: ['Spots'] })
  const spotB = makeFixture('spotB', dimmerOnly(), { groups: ['Spots'] })
  const wash = makeFixture('wash', dimmerOnly(), { groups: ['Washes'] })
  const loose = makeFixture('loose', dimmerOnly())
  const fixtures = [spotA, spotB, wash, loose]
  const groups = [groupSummary('Spots', 2), groupSummary('Washes', 1)]

  it('orders groups first (backend order), then an Ungrouped divider', () => {
    const rows = buildRows({ fixtures, groups, expandedGroups: new Set(), textFilter: '' })
    expect(rows.map((r) => r.id)).toEqual([
      'group:Spots',
      'group:Washes',
      'divider:ungrouped',
      'fixture:loose',
    ])
  })

  it('inlines member rows when a group is expanded', () => {
    const rows = buildRows({
      fixtures,
      groups,
      expandedGroups: new Set(['Spots']),
      textFilter: '',
    })
    expect(rows.map((r) => r.id)).toEqual([
      'group:Spots',
      'member:Spots:spotA',
      'member:Spots:spotB',
      'group:Washes',
      'divider:ungrouped',
      'fixture:loose',
    ])
    expect(rows[1]).toMatchObject({ kind: 'fixture', parentGroup: 'Spots' })
  })

  it('shows a fixture under every group it belongs to, with distinct row ids', () => {
    const both = makeFixture('both', dimmerOnly(), { groups: ['Spots', 'Washes'] })
    const rows = buildRows({
      fixtures: [both],
      groups,
      expandedGroups: new Set(['Spots', 'Washes']),
      textFilter: '',
    })
    expect(rows.map((r) => r.id)).toEqual([
      'group:Spots',
      'member:Spots:both',
      'group:Washes',
      'member:Washes:both',
    ])
  })

  it('keeps a group when any member matches the text filter, showing only matching members', () => {
    const rows = buildRows({
      fixtures,
      groups,
      expandedGroups: new Set(['Spots']),
      textFilter: 'spotB',
    })
    expect(rows.map((r) => r.id)).toEqual(['group:Spots', 'member:Spots:spotB'])
    // The group row itself must only carry the visible members — batch edits
    // and aggregates driven from it must not touch filtered-out fixtures.
    expect(rows[0]).toMatchObject({ kind: 'group', members: [spotB] })
  })

  it('shows genuinely empty groups but hides groups whose members are all filtered out', () => {
    const emptyGroup = groupSummary('Empty', 0)
    const withEmpty = buildRows({
      fixtures,
      groups: [...groups, emptyGroup],
      expandedGroups: new Set(),
      textFilter: '',
    })
    expect(withEmpty.map((r) => r.id)).toContain('group:Empty')

    const filtered = buildRows({
      fixtures,
      groups: [...groups, emptyGroup],
      expandedGroups: new Set(),
      textFilter: 'spotA',
    })
    // Empty group still shows (nothing to filter); Washes is hidden (its one
    // member doesn't match).
    expect(filtered.map((r) => r.id)).toEqual(['group:Spots', 'group:Empty'])
  })

  it('treats fixtures whose groups are unknown as ungrouped rather than hiding them', () => {
    // Groups query failed (or membership is stale): the fixture must still
    // appear somewhere.
    const rows = buildRows({
      fixtures,
      groups: [],
      expandedGroups: new Set(),
      textFilter: '',
    })
    expect(rows.map((r) => r.id)).toEqual([
      'fixture:spotA',
      'fixture:spotB',
      'fixture:wash',
      'fixture:loose',
    ])
  })

  it('drops unlit fixtures (and groups with no lit member) under the lit filter', () => {
    const rows = buildRows({
      fixtures,
      groups,
      expandedGroups: new Set(),
      textFilter: '',
      litFixtureKeys: new Set(['wash']),
    })
    expect(rows.map((r) => r.id)).toEqual(['group:Washes'])
  })

  it('omits the divider when there are no groups above the ungrouped fixtures', () => {
    const rows = buildRows({
      fixtures: [loose],
      groups: [],
      expandedGroups: new Set(),
      textFilter: '',
    })
    expect(rows.map((r) => r.id)).toEqual(['fixture:loose'])
  })
})

describe('buildRows flat mode (groupByGroups: false)', () => {
  const spotA = makeFixture('spotA', dimmerOnly(), { groups: ['Spots'] })
  const spotB = makeFixture('spotB', dimmerOnly(), { groups: ['Spots'] })
  const wash = makeFixture('wash', dimmerOnly(), { groups: ['Washes'] })
  const loose = makeFixture('loose', dimmerOnly())
  const fixtures = [spotA, spotB, wash, loose]
  const groups = [groupSummary('Spots', 2), groupSummary('Washes', 1)]

  it('emits fixtures in fixture-list order with no group, member, or divider rows', () => {
    const rows = buildRows({
      fixtures,
      groups,
      expandedGroups: new Set(),
      textFilter: '',
      groupByGroups: false,
    })
    expect(rows.map((r) => r.id)).toEqual([
      'fixture:spotA',
      'fixture:spotB',
      'fixture:wash',
      'fixture:loose',
    ])
    expect(rows.every((r) => r.kind === 'fixture' && r.parentGroup === undefined)).toBe(true)
  })

  it('still applies the text and lit filters', () => {
    const filtered = buildRows({
      fixtures,
      groups,
      expandedGroups: new Set(),
      textFilter: 'spot',
      groupByGroups: false,
    })
    expect(filtered.map((r) => r.id)).toEqual(['fixture:spotA', 'fixture:spotB'])

    const lit = buildRows({
      fixtures,
      groups,
      expandedGroups: new Set(),
      textFilter: '',
      litFixtureKeys: new Set(['wash']),
      groupByGroups: false,
    })
    expect(lit.map((r) => r.id)).toEqual(['fixture:wash'])
  })

  it('still inlines element rows for expanded multi-head fixtures', () => {
    const bar = makePixelBar('bar', 2, [], { groups: ['Spots'] })
    const rows = buildRows({
      fixtures: [bar, loose],
      groups,
      expandedGroups: new Set(),
      expandedFixtures: new Set(['bar']),
      textFilter: '',
      groupByGroups: false,
    })
    expect(rows.map((r) => r.id)).toEqual([
      'fixture:bar',
      'element:fixture:bar:bar.pixel-0',
      'element:fixture:bar:bar.pixel-1',
      'fixture:loose',
    ])
  })

  it('matches grouped output when the option is omitted or true', () => {
    const omitted = buildRows({ fixtures, groups, expandedGroups: new Set(), textFilter: '' })
    const explicit = buildRows({
      fixtures,
      groups,
      expandedGroups: new Set(),
      textFilter: '',
      groupByGroups: true,
    })
    expect(explicit).toEqual(omitted)
    expect(omitted.map((r) => r.id)).toContain('group:Spots')
  })
})

describe('buildRows with multi-head fixtures', () => {
  const bar = makePixelBar('bar', 3)
  const loose = makeFixture('loose', dimmerOnly())

  it('keeps element rows collapsed by default, with isExpanded false', () => {
    const rows = buildRows({
      fixtures: [bar, loose],
      groups: [],
      expandedGroups: new Set(),
      textFilter: '',
    })
    expect(rows.map((r) => r.id)).toEqual(['fixture:bar', 'fixture:loose'])
    expect(rows[0]).toMatchObject({ kind: 'fixture', isExpanded: false })
  })

  it('inlines one element row per head when the fixture is expanded', () => {
    const rows = buildRows({
      fixtures: [bar, loose],
      groups: [],
      expandedGroups: new Set(),
      expandedFixtures: new Set(['bar']),
      textFilter: '',
    })
    expect(rows.map((r) => r.id)).toEqual([
      'fixture:bar',
      'element:fixture:bar:bar.pixel-0',
      'element:fixture:bar:bar.pixel-1',
      'element:fixture:bar:bar.pixel-2',
      'fixture:loose',
    ])
    expect(rows[0]).toMatchObject({ kind: 'fixture', isExpanded: true })
    expect(rows[1]).toMatchObject({
      kind: 'element',
      fixture: bar,
      element: bar.elements![0],
    })
  })

  it('expanding a fixture without elements is a no-op', () => {
    const rows = buildRows({
      fixtures: [loose],
      groups: [],
      expandedGroups: new Set(),
      expandedFixtures: new Set(['loose']),
      textFilter: '',
    })
    expect(rows.map((r) => r.id)).toEqual(['fixture:loose'])
    expect(rows[0]).toMatchObject({ kind: 'fixture', isExpanded: false })
  })

  it('scopes element row ids by parent row id across group instances', () => {
    const grouped = makePixelBar('gbar', 2, [], { groups: ['A', 'B'] })
    const rows = buildRows({
      fixtures: [grouped],
      groups: [groupSummary('A', 1), groupSummary('B', 1)],
      expandedGroups: new Set(['A', 'B']),
      expandedFixtures: new Set(['gbar']),
      textFilter: '',
    })
    expect(rows.map((r) => r.id)).toEqual([
      'group:A',
      'member:A:gbar',
      'element:member:A:gbar:gbar.pixel-0',
      'element:member:A:gbar:gbar.pixel-1',
      'group:B',
      'member:B:gbar',
      'element:member:B:gbar:gbar.pixel-0',
      'element:member:B:gbar:gbar.pixel-1',
    ])
    // All ids distinct even though the same fixture appears twice.
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
    expect(rows[2]).toMatchObject({ kind: 'element', parentGroup: 'A' })
  })
})

describe('expandSelectionToTargets', () => {
  const spotA = makeFixture('spotA', dimmerOnly(), { groups: ['Spots'] })
  const spotB = makeFixture('spotB', dimmerOnly(), { groups: ['Spots'] })
  const loose = makeFixture('loose', dimmerOnly())
  const fixtures = [spotA, spotB, loose]
  const groups = [groupSummary('Spots', 2)]

  it('expands group rows to members and dedupes fixtures selected twice', () => {
    const rows = buildRows({
      fixtures,
      groups,
      expandedGroups: new Set(['Spots']),
      textFilter: '',
    })
    // Group selected AND one of its members selected directly: member written once.
    const selected = new Set(['group:Spots', 'member:Spots:spotB', 'fixture:loose'])
    expect(expandSelectionToTargets(rows, selected).map((t) => t.key)).toEqual([
      'spotA',
      'spotB',
      'loose',
    ])
  })

  it('ignores selected ids whose rows are no longer visible', () => {
    const rows = buildRows({ fixtures, groups, expandedGroups: new Set(), textFilter: '' })
    const selected = new Set(['member:Spots:spotB', 'fixture:loose'])
    expect(expandSelectionToTargets(rows, selected).map((t) => t.key)).toEqual(['loose'])
  })

  it('emits element targets in visible row order', () => {
    const bar = makePixelBar('bar', 3)
    const rows = buildRows({
      fixtures: [bar, loose],
      groups: [],
      expandedGroups: new Set(),
      expandedFixtures: new Set(['bar']),
      textFilter: '',
    })
    const selected = new Set([
      'element:fixture:bar:bar.pixel-0',
      'element:fixture:bar:bar.pixel-2',
      'fixture:loose',
    ])
    expect(expandSelectionToTargets(rows, selected).map((t) => t.key)).toEqual([
      'bar.pixel-0',
      'bar.pixel-2',
      'loose',
    ])
  })

  it('drops element targets whose parent fixture row is also selected', () => {
    const bar = makePixelBar('bar', 2)
    const rows = buildRows({
      fixtures: [bar],
      groups: [],
      expandedGroups: new Set(),
      expandedFixtures: new Set(['bar']),
      textFilter: '',
    })
    // ⌘A shape: parent and every child selected together.
    const selected = new Set(rows.map((r) => r.id))
    expect(expandSelectionToTargets(rows, selected).map((t) => t.key)).toEqual(['bar'])
  })

  it('drops element targets whose parent is covered via a selected group row', () => {
    const bar = makePixelBar('gbar', 2, [], { groups: ['A'] })
    const rows = buildRows({
      fixtures: [bar],
      groups: [groupSummary('A', 1)],
      expandedGroups: new Set(['A']),
      expandedFixtures: new Set(['gbar']),
      textFilter: '',
    })
    const selected = new Set(['group:A', 'element:member:A:gbar:gbar.pixel-1'])
    expect(expandSelectionToTargets(rows, selected).map((t) => t.key)).toEqual(['gbar'])
  })

  it('dedupes the same element selected under two group instances', () => {
    const bar = makePixelBar('gbar', 2, [], { groups: ['A', 'B'] })
    const rows = buildRows({
      fixtures: [bar],
      groups: [groupSummary('A', 1), groupSummary('B', 1)],
      expandedGroups: new Set(['A', 'B']),
      expandedFixtures: new Set(['gbar']),
      textFilter: '',
    })
    const selected = new Set([
      'element:member:A:gbar:gbar.pixel-0',
      'element:member:B:gbar:gbar.pixel-0',
    ])
    expect(expandSelectionToTargets(rows, selected).map((t) => t.key)).toEqual(['gbar.pixel-0'])
  })
})

describe('batch write planning', () => {
  const rgbFixture = makeFixture('rgb', [colourProp('rgbColour', chan(1), chan(2), chan(3))])
  const wheelFixture = makeFixture('wheel', [settingProp('colourWheel', 'colour', chan(4))])
  const dimmerFixture = makeFixture('dim', dimmerOnly())

  it('skips fixtures whose property cannot take the commit shape', () => {
    const planned = planBatchWrites([rgbFixture, wheelFixture, dimmerFixture], 'colour', {
      kind: 'colour',
      r: 255,
      g: 0,
      b: 0,
    })
    expect(planned.map((p) => p.target.key)).toEqual(['rgb'])
  })

  it('routes setting commits to both plain settings and colour wheels', () => {
    const planned = planBatchWrites([rgbFixture, wheelFixture], 'colour', {
      kind: 'setting',
      level: 10,
    })
    expect(planned.map((p) => p.target.key)).toEqual(['wheel'])
  })

  it('skips fixtures without the property at all', () => {
    const planned = planBatchWrites([dimmerFixture, rgbFixture], 'dimmer', {
      kind: 'slider',
      value: 128,
    })
    expect(planned.map((p) => p.target.key)).toEqual(['dim'])
  })

  it('commitMatchesResolution rejects nulls and cross-kind pairs', () => {
    expect(commitMatchesResolution({ kind: 'slider', value: 1 }, null)).toBe(false)
    const wheelRes = resolveCell(wheelFixture.properties, 'colour')
    expect(commitMatchesResolution({ kind: 'colour', r: 0, g: 0, b: 0 }, wheelRes)).toBe(false)
    expect(commitMatchesResolution({ kind: 'setting', level: 0 }, wheelRes)).toBe(true)
  })

  it('clamps each planned write to the target fixture\'s own ranges', () => {
    const widePan = makeFixture('wide', [
      sliderProp('pan', 'pan', chan(10), { axis: 'PAN', max: 540 }),
      sliderProp('tilt', 'tilt', chan(11), { axis: 'TILT' }),
    ])
    const narrowStrobe = makeFixture('narrow', [sliderProp('strobe', 'strobe', chan(12), { max: 200 })])

    const planned = planBatchWrites([narrowStrobe], 'strobe', { kind: 'slider', value: 255 })
    expect(planned[0].commit).toEqual({ kind: 'slider', value: 200 })

    const posRes = resolveCell(widePan.properties, 'position')
    expect(posRes).not.toBeNull()
    expect(clampCommitToResolution({ kind: 'position', pan: 600 }, posRes!)).toEqual({
      kind: 'position',
      pan: 540,
      tilt: undefined,
    })
  })
})

/**
 * The marquee's write path, end to end at the model level.
 *
 * A drag across two columns is grouped by column and each group becomes one `planBatchWrites` call.
 * The consequence worth pinning is that a commit of one shape reaches only the column that can take
 * it — so the "8 cells" the drag chip reports is an upper bound on what any single commit writes,
 * not a promise. Constraining the marquee to one family instead would throw away the multi-column
 * selection the design draws.
 */
describe('a multi-column marquee, grouped and planned', () => {
  const rgb = makeFixture('rgb', [
    sliderProp('dimmer', 'dimmer', chan(1)),
    colourProp('rgbColour', chan(2), chan(3), chan(4)),
  ])

  it('sends a colour commit to the colour cells only', () => {
    const rows = buildRows({ fixtures: [rgb], groups: [], expandedGroups: new Set(), textFilter: '' })
    // What a drag across Dimmer and Colour on one row leaves selected.
    const selected = new Set([
      cellKey('fixture:rgb' as RowId, 'dimmer' as ColumnKey),
      cellKey('fixture:rgb' as RowId, 'colour' as ColumnKey),
    ])

    const written = cellsByColumn(selected).flatMap(({ col, rowIds }) =>
      planBatchWrites(expandSelectionToTargets(rows, new Set(rowIds)), col, {
        kind: 'colour',
        r: 255,
        g: 0,
        b: 0,
      }),
    )

    expect(written).toHaveLength(1)
    expect(written[0].resolution?.kind).toBe('colour')
  })

  it('sends a level commit to the dimmer cell only', () => {
    const rows = buildRows({ fixtures: [rgb], groups: [], expandedGroups: new Set(), textFilter: '' })
    const selected = new Set([
      cellKey('fixture:rgb' as RowId, 'dimmer' as ColumnKey),
      cellKey('fixture:rgb' as RowId, 'colour' as ColumnKey),
    ])

    const written = cellsByColumn(selected).flatMap(({ col, rowIds }) =>
      planBatchWrites(expandSelectionToTargets(rows, new Set(rowIds)), col, {
        kind: 'slider',
        value: 128,
      }),
    )

    expect(written).toHaveLength(1)
    expect(written[0].resolution?.kind).toBe('slider')
  })
})

describe('batch write planning with multi-head fixtures', () => {
  it('expands a fixture without the parent property into per-element writes, in element order', () => {
    const bar = makePixelBar('bar', 3)
    const planned = planBatchWrites([bar], 'colour', { kind: 'colour', r: 255, g: 0, b: 0 })
    expect(planned.map((p) => p.target.key)).toEqual([
      'bar.pixel-0',
      'bar.pixel-1',
      'bar.pixel-2',
    ])
  })

  it('keeps element writes inline at the parent position in a mixed list (fan ordering)', () => {
    const spotA = makeFixture('spotA', [colourProp('rgbColour', chan(1), chan(2), chan(3))])
    const spotB = makeFixture('spotB', [colourProp('rgbColour', chan(4), chan(5), chan(6))])
    const bar = makePixelBar('bar', 3)
    const planned = planBatchWrites([spotA, bar, spotB], 'colour', {
      kind: 'colour',
      r: 0,
      g: 0,
      b: 255,
    })
    expect(planned.map((p) => p.target.key)).toEqual([
      'spotA',
      'bar.pixel-0',
      'bar.pixel-1',
      'bar.pixel-2',
      'spotB',
    ])
  })

  it('lets a parent-level property win over element fallbacks (master dimmer + colour heads)', () => {
    const master = makePixelBar('master', 2, [sliderProp('dimmer', 'dimmer', chan(100))])
    const slider = planBatchWrites([master], 'dimmer', { kind: 'slider', value: 200 })
    expect(slider.map((p) => p.target.key)).toEqual(['master'])
    const colour = planBatchWrites([master], 'colour', { kind: 'colour', r: 1, g: 2, b: 3 })
    expect(colour.map((p) => p.target.key)).toEqual(['master.pixel-0', 'master.pixel-1'])
  })

  it('never falls through to elements when the parent resolves but the commit shape mismatches', () => {
    // Parent colour WHEEL claims the colour column outright: a colour commit
    // is skipped, not routed to the heads — display and writes must agree.
    const wheelBar = makePixelBar('wheelBar', 2, [settingProp('colourWheel', 'colour', chan(101))])
    const planned = planBatchWrites([wheelBar], 'colour', { kind: 'colour', r: 255, g: 0, b: 0 })
    expect(planned).toEqual([])
  })

  it('clamps per element resolution', () => {
    const bar = makeFixture('bar', [], {
      elements: [
        element(0, 'bar.pixel-0', [sliderProp('dimmer', 'dimmer', chan(110), { max: 100 })]),
        element(1, 'bar.pixel-1', [sliderProp('dimmer', 'dimmer', chan(111))]),
      ],
    })
    const planned = planBatchWrites([bar], 'dimmer', { kind: 'slider', value: 255 })
    expect(planned.map((p) => p.commit)).toEqual([
      { kind: 'slider', value: 100 },
      { kind: 'slider', value: 255 },
    ])
  })
})

describe('select params', () => {
  it('round-trips fixture and group params, including keys containing colons', () => {
    expect(parseSelectParam(fixtureSelectParam('mac700-3'))).toEqual({
      kind: 'fixture',
      key: 'mac700-3',
    })
    expect(parseSelectParam(groupSelectParam('Front:Wash'))).toEqual({
      kind: 'group',
      key: 'Front:Wash',
    })
  })

  it('rejects malformed params', () => {
    expect(parseSelectParam('nonsense')).toBeNull()
    expect(parseSelectParam('fixture:')).toBeNull()
    expect(parseSelectParam('cue:5')).toBeNull()
  })
})
