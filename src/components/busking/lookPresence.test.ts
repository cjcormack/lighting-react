import { describe, expect, it } from 'vitest'
import { lookLayerPresence, templateLayerPresence } from './lookPresence'
import type { AppliedTarget, ProgrammerAppliedSource } from '@/store/programmer'
import type { CueTarget } from '@/api/cuesApi'

/** The desk's answer for one record: "Warm Wash" applied to whatever [targets] say. */
function applied(
  targets: AppliedTarget[],
  overrides: Partial<ProgrammerAppliedSource> = {},
): ProgrammerAppliedSource {
  return {
    source: { kind: 'LOOK', id: 7, uuid: 'u7', name: 'Warm Wash' },
    targets,
    ...overrides,
  }
}

const FRONT: CueTarget = { type: 'group', key: 'front-wash' }
const BACK: CueTarget = { type: 'group', key: 'back-wash' }

/** A group the desk reports as wholly covered, plus the heads that make it so. */
const FRONT_ALL: AppliedTarget[] = [
  { type: 'group', key: 'front-wash', state: 'all' },
  { type: 'fixture', key: 'hex-1', state: 'all' },
  { type: 'fixture', key: 'hex-2', state: 'all' },
]

describe('lookLayerPresence', () => {
  it('lights the ring for a Look made only of static rows', () => {
    // The regression this replaces: the old match read the effect list, so a rows-only Look could
    // never light its ring however plainly it was on stage. A layer exists either way, and the
    // desk resolves the layer.
    expect(lookLayerPresence([applied(FRONT_ALL)], [FRONT], 7)).toBe('all')
  })

  it('reads none when the desk reports no layer for this Look', () => {
    const other = applied(FRONT_ALL, { source: { kind: 'LOOK', id: 8, uuid: 'u8', name: 'Cool' } })
    expect(lookLayerPresence([other], [FRONT], 7)).toBe('none')
    expect(lookLayerPresence([], [FRONT], 7)).toBe('none')
  })

  it('reads some when only part of the selection is covered', () => {
    expect(lookLayerPresence([applied(FRONT_ALL)], [FRONT, BACK], 7)).toBe('some')
  })

  it('passes a partly-covered group straight through as some', () => {
    // Half the wash's heads: `some` is the desk's word, and the whole of the client's job is not
    // to lose it. Working out which half is covered was the rule that used to live here.
    const half: AppliedTarget[] = [
      { type: 'group', key: 'front-wash', state: 'some' },
      { type: 'fixture', key: 'hex-1', state: 'all' },
    ]
    expect(lookLayerPresence([applied(half)], [FRONT], 7)).toBe('some')
    expect(lookLayerPresence([applied(half)], [{ type: 'fixture', key: 'hex-1' }], 7)).toBe('all')
  })

  it('lights for a member of a group the layer names', () => {
    // A group is its fixtures — expanded server-side, so a head of a lit wash arrives lit. Before
    // the desk answered this, the ring went dark the moment the operator picked one head out of
    // the group they had just lit.
    expect(lookLayerPresence([applied(FRONT_ALL)], [{ type: 'fixture', key: 'hex-2' }], 7)).toBe('all')
  })

  it('distinguishes a fixture from a group of the same name', () => {
    // A pad must never answer for the other kind of target: the two share a namespace on the wire.
    expect(lookLayerPresence([applied(FRONT_ALL)], [{ type: 'fixture', key: 'front-wash' }], 7)).toBe('none')
  })

  it('reads none with nothing selected', () => {
    expect(lookLayerPresence([applied(FRONT_ALL)], [], 7)).toBe('none')
  })

  it('reads none for a record the desk lists with no targets', () => {
    // What a layer with empty targets resolves to: its source's own bound rows decide where it
    // lands, which is the cook's answer to give, so the desk reports it as covering nothing.
    expect(lookLayerPresence([applied([])], [FRONT], 7)).toBe('none')
  })
})

const templateApplied = (targets: AppliedTarget[]) =>
  applied(targets, { source: { kind: 'TEMPLATE', id: 4, uuid: 'ut4', name: 'Amber Breathe' } })

describe('templateLayerPresence', () => {
  it('lights the ring from the applied state, whatever the template holds', () => {
    // The rule that matters since a template can hold an **effect**: presence is read from the
    // layer, never from the running instance. Matching on the instance would light for an effect
    // template and leave every value template's pad dark — the worst of both answers.
    expect(templateLayerPresence([templateApplied(FRONT_ALL)], [FRONT], 4)).toBe('all')
  })

  it('does not confuse a Look and a template sharing an int PK', () => {
    // Two tables, two id spaces — so the Look here carries the *template's* id, or the assertion
    // would pass on `7 !== 4` and never reach the kind check it exists to pin.
    const lookWithTemplateId = applied(FRONT_ALL, {
      source: { kind: 'LOOK', id: 4, uuid: 'u4', name: 'Warm Wash' },
    })
    expect(templateLayerPresence([lookWithTemplateId], [FRONT], 4)).toBe('none')
    expect(lookLayerPresence([templateApplied(FRONT_ALL)], [FRONT], 4)).toBe('none')
  })

  it('reads some when only part of the selection is covered', () => {
    expect(templateLayerPresence([templateApplied(FRONT_ALL)], [FRONT, BACK], 4)).toBe('some')
  })

  it('reads a covered head of a named group like a Look pad does', () => {
    expect(templateLayerPresence([templateApplied(FRONT_ALL)], [{ type: 'fixture', key: 'hex-2' }], 4)).toBe('all')
  })

  it('reads none with nothing selected, or with no record applying it', () => {
    expect(templateLayerPresence([templateApplied(FRONT_ALL)], [], 4)).toBe('none')
    expect(templateLayerPresence([], [FRONT], 4)).toBe('none')
    expect(templateLayerPresence([templateApplied(FRONT_ALL)], [FRONT], 5)).toBe('none')
  })
})
