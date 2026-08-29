import { describe, expect, it } from 'vitest'
import { lookLayerPresence } from './lookPresence'
import type { ProgrammerLayer } from '@/store/programmer'
import type { CueTarget } from '@/api/cuesApi'

function layer(overrides: Partial<ProgrammerLayer> = {}): ProgrammerLayer {
  return {
    layerId: 1,
    source: { kind: 'LOOK', id: 7, uuid: 'u7', name: 'Warm Wash' },
    sortOrder: 0,
    enabled: true,
    targets: [{ type: 'group', key: 'front-wash' }],
    blendMode: 'OVERRIDE',
    amount: 1,
    stomp: false,
    ...overrides,
  }
}

const FRONT: CueTarget = { type: 'group', key: 'front-wash' }
const BACK: CueTarget = { type: 'group', key: 'back-wash' }

describe('lookLayerPresence', () => {
  it('lights the ring for a Look made only of static rows', () => {
    // The regression this replaces: the old match read the effect list, so a rows-only Look could
    // never light its ring however plainly it was on stage. A layer exists either way.
    expect(lookLayerPresence([layer()], [FRONT], 7)).toBe('all')
  })

  it('reads none when no layer names this Look', () => {
    expect(lookLayerPresence([layer({ source: { kind: 'LOOK', id: 8, uuid: 'u8', name: 'Cool' } })], [FRONT], 7)).toBe('none')
    expect(lookLayerPresence([], [FRONT], 7)).toBe('none')
  })

  it('reads some when the layer covers part of the selection', () => {
    expect(lookLayerPresence([layer()], [FRONT, BACK], 7)).toBe('some')
  })

  it('adds coverage across several layers of the same Look', () => {
    // Two taps with two selections make two layers, which is what the server's toggle does when
    // the target list differs. Together they cover the whole selection.
    const layers = [layer(), layer({ layerId: 2, targets: [BACK] })]
    expect(lookLayerPresence(layers, [FRONT, BACK], 7)).toBe('all')
  })

  it('counts a layer with no targets as covering nothing', () => {
    // A bound Look's own rows decide where such a layer lands, and that is a server-side question
    // (group expansion, per-fixture resolution). Claiming coverage would be a guess; a pad always
    // sends its targets, so this only arises for a layer another surface added.
    expect(lookLayerPresence([layer({ targets: [] })], [FRONT], 7)).toBe('none')
  })

  it('distinguishes a fixture from a group of the same name', () => {
    expect(lookLayerPresence([layer()], [{ type: 'fixture', key: 'front-wash' }], 7)).toBe('none')
  })

  it('reads none with nothing selected', () => {
    expect(lookLayerPresence([layer()], [], 7)).toBe('none')
  })

  it('still counts a disabled layer', () => {
    // Deliberate: the pad's ring answers "is this look on the stack?", and a disabled layer is on
    // it — tapping again should take it off rather than add a second. Enabled-ness is shown, and
    // changed, in the layer stack.
    expect(lookLayerPresence([layer({ enabled: false })], [FRONT], 7)).toBe('all')
  })
})
