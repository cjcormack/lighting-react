import { describe, expect, it } from 'vitest'
import { fakeWsConnection } from '../test/fakeWsConnection'
import { createSelectionWsApi, type DeskSelectionSnapshot } from './selectionApi'

/**
 * The `selection.*` wire as this side speaks it (multi-screen plan §3.2, lighting7 af3575a) —
 * pinned by frame, not by argument: `store/selection.test.tsx` spies on what the store hands this
 * module, and a renamed key here would have left that suite green while the desk ignored it.
 */
describe('createSelectionWsApi', () => {
  it('sends the whole fact on a set — targets, families and the window’s name', () => {
    const { conn, sent } = fakeWsConnection()
    createSelectionWsApi(conn).set([{ type: 'fixture', key: 'par-1' }], ['COLOUR'], 'Screen 1')
    expect(sent).toEqual([
      {
        type: 'selection.set',
        targets: [{ type: 'fixture', key: 'par-1' }],
        families: ['COLOUR'],
        sourceName: 'Screen 1',
      },
    ])
  })

  it('omits families for no mask, and for all four — the desk’s own spelling', () => {
    // `parseMaskGroupsLenient` folds empty and complete to null; sending it folded is what lets
    // the echo compare equal to what was sent.
    const { conn, sent } = fakeWsConnection()
    const api = createSelectionWsApi(conn)
    api.set([], null, 'Screen 1')
    api.set([], ['INTENSITY', 'POSITION', 'COLOUR', 'BEAM'], 'Screen 1')
    expect(sent.map((frame) => 'families' in frame)).toEqual([false, false])
  })

  it('names the window on a toggle and sends a bare clear', () => {
    const { conn, sent } = fakeWsConnection()
    const api = createSelectionWsApi(conn)
    api.toggle({ type: 'group', key: 'Front wash' }, 'Screen 1')
    api.clear()
    expect(sent).toEqual([
      { type: 'selection.toggle', target: { type: 'group', key: 'Front wash' }, sourceName: 'Screen 1' },
      { type: 'selection.clear' },
    ])
  })

  it('never puts a source on the wire — the desk stamps it', () => {
    const { conn, sent } = fakeWsConnection()
    createSelectionWsApi(conn).set([{ type: 'fixture', key: 'par-1' }], null, 'Screen 1')
    expect(sent[0]).not.toHaveProperty('source')
  })

  it('decodes a state frame with the two fields absent as every attribute and nobody', () => {
    const { conn, frame } = fakeWsConnection()
    const api = createSelectionWsApi(conn)
    const seen: DeskSelectionSnapshot[] = []
    api.subscribe((snapshot) => seen.push(snapshot))
    frame({ type: 'selection.state', targets: [{ type: 'fixture', key: 'par-1' }] })
    frame({
      type: 'selection.state',
      targets: [{ type: 'fixture', key: 'par-1' }],
      families: ['COLOUR'],
      source: { kind: 'surface', name: 'Control surface' },
    })
    expect(seen).toEqual([
      { targets: [{ type: 'fixture', key: 'par-1' }], families: null, source: null },
      {
        targets: [{ type: 'fixture', key: 'par-1' }],
        families: ['COLOUR'],
        source: { kind: 'surface', name: 'Control surface' },
      },
    ])
    // The untouched targets keep their identity across the second frame.
    expect(seen[1]!.targets).toBe(seen[0]!.targets)
    expect(api.getState()).toBe(seen[1])
  })
})
