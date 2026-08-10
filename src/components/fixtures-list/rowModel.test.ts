import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import {
  buildRows,
  clampCommitToResolution,
  commitMatchesResolution,
  expandSelectionToFixtures,
  fixtureSelectParam,
  groupSelectParam,
  parseSelectParam,
  planBatchWrites,
} from './rowModel'
import { resolveCell } from './columns'
import { chan, colourProp, makeFixture, settingProp, sliderProp } from '@/test/fixtureFactories'
import type { GroupSummary } from '@/api/groupsApi'

function groupSummary(name: string, memberCount = 0): GroupSummary {
  return {
    name,
    memberCount,
    capabilities: [],
    symmetricMode: 'NONE',
    defaultDistribution: 'LINEAR',
    compatiblePresetIds: [],
  }
}

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

describe('expandSelectionToFixtures', () => {
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
    expect(expandSelectionToFixtures(rows, selected).map((f) => f.key)).toEqual([
      'spotA',
      'spotB',
      'loose',
    ])
  })

  it('ignores selected ids whose rows are no longer visible', () => {
    const rows = buildRows({ fixtures, groups, expandedGroups: new Set(), textFilter: '' })
    const selected = new Set(['member:Spots:spotB', 'fixture:loose'])
    expect(expandSelectionToFixtures(rows, selected).map((f) => f.key)).toEqual(['loose'])
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
    expect(planned.map((p) => p.fixture.key)).toEqual(['rgb'])
  })

  it('routes setting commits to both plain settings and colour wheels', () => {
    const planned = planBatchWrites([rgbFixture, wheelFixture], 'colour', {
      kind: 'setting',
      level: 10,
    })
    expect(planned.map((p) => p.fixture.key)).toEqual(['wheel'])
  })

  it('skips fixtures without the property at all', () => {
    const planned = planBatchWrites([dimmerFixture, rgbFixture], 'dimmer', {
      kind: 'slider',
      value: 128,
    })
    expect(planned.map((p) => p.fixture.key)).toEqual(['dim'])
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
