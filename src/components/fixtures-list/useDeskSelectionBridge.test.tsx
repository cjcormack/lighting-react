// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CueTarget } from '@/api/cuesApi'
import type { Fixture } from '@/store/fixtures'
import { rowIdsForTargets, selectedRowTargets, type Row } from './rowModel'

/**
 * The programmer list ↔ desk selection bridge (`midi-surface-plan.md` §3.2).
 *
 * The load-bearing case is the first one: a selected **group row** publishes one `group` entry, not
 * its eight members. Publishing the scope's `targetKeys` instead — the obvious wiring — would send
 * loose fixture keys carrying no discriminator, the strip's group select LED would stay dark, and
 * nothing would light the group row again on the way back. The rest are the three quiet ones: no
 * publish on mount, no publish caused by the filter, and no echo.
 */

let deskTargets: CueTarget[] = []
const setDeskSelection = vi.fn()

vi.mock('@/store/selection', () => ({
  useDeskSelection: () => deskTargets,
  setDeskSelection: (t: CueTarget[]) => setDeskSelection(t),
}))

const { useDeskSelectionBridge } = await import('./useDeskSelectionBridge')

function fixture(key: string): Fixture {
  return { key, name: key, typeKey: 'par' } as Fixture
}

const rows: Row[] = [
  {
    kind: 'group',
    id: 'group:Front wash',
    name: 'Front wash',
    members: [fixture('par-1'), fixture('par-2')],
    memberCount: 2,
    expanded: false,
  } as unknown as Row,
  { kind: 'fixture', id: 'fixture:par-9', fixture: fixture('par-9') } as unknown as Row,
]

/**
 * Drives the hook the way `FixturesListContainer` does — ids in, `setSelection` out — with the
 * container's own storage stubbed by `state.ids`, so a change the hook makes is visible to the
 * next render exactly as a Redux dispatch would be.
 */
function drive(initial: string[] = []) {
  const state = { ids: new Set(initial), rows }
  const setSelection = vi.fn((ids: readonly string[]) => {
    state.ids = new Set(ids)
  })
  const hook = renderHook(
    (p: { ids: Set<string>; rows: Row[] }) =>
      useDeskSelectionBridge(true, p.rows, p.ids, setSelection),
    { initialProps: { ids: state.ids, rows } },
  )
  const render = () => act(() => hook.rerender({ ids: state.ids, rows: state.rows }))
  /** The operator moves the marquee. */
  const select = (ids: string[]) => {
    state.ids = new Set(ids)
    render()
  }
  /** The list's filter changes what is on screen; the selection does not move. */
  const filter = (next: Row[]) => {
    state.rows = next
    render()
  }
  return { hook, setSelection, state, render, select, filter }
}

beforeEach(() => {
  deskTargets = []
  setDeskSelection.mockClear()
})

describe('selectedRowTargets', () => {
  it('publishes a selected group row as one group entry, never as its members', () => {
    expect(selectedRowTargets(rows, new Set(['group:Front wash']))).toEqual([
      { type: 'group', key: 'Front wash' },
    ])
  })

  it('answers a fixture row by key', () => {
    expect(selectedRowTargets(rows, new Set(['fixture:par-9']))).toEqual([
      { type: 'fixture', key: 'par-9' },
    ])
  })
})

describe('rowIdsForTargets', () => {
  it('reads the same mapping backwards', () => {
    expect(rowIdsForTargets(rows, [{ type: 'group', key: 'Front wash' }])).toEqual([
      'group:Front wash',
    ])
  })

  it('ignores a target with no row rather than inventing one', () => {
    expect(rowIdsForTargets(rows, [{ type: 'group', key: 'Nowhere' }])).toEqual([])
  })
})

describe('useDeskSelectionBridge', () => {
  it('publishes nothing on mount', () => {
    // The slice starts empty — the container clears its scope on unmount — so a first-run publish
    // would wipe whatever the surface had selected the moment this page opened.
    drive()
    expect(setDeskSelection).not.toHaveBeenCalled()
  })

  it('publishes an operator’s change', () => {
    const { select } = drive()
    select(['group:Front wash'])
    expect(setDeskSelection).toHaveBeenCalledWith([{ type: 'group', key: 'Front wash' }])
  })

  it('marks the rows a frame names, and does not echo it back', () => {
    const { setSelection, render } = drive()
    deskTargets = [{ type: 'group', key: 'Front wash' }]
    render()
    expect(setSelection).toHaveBeenCalledWith(['group:Front wash'])

    // The dispatch has landed; the publish effect must recognise its own doing.
    render()
    expect(setDeskSelection).not.toHaveBeenCalled()
  })

  it('does not narrow the desk when the list filters a selected row out of view', () => {
    // `selectedRowTargets` narrows whenever `rows` narrows, and `rows` narrows on a filter
    // keystroke while `selectedIds` does not — an effect keyed on the target list would shrink the
    // desk's selection every time the operator typed.
    const { select, filter } = drive()
    select(['group:Front wash'])
    setDeskSelection.mockClear()
    filter([rows[1]!])
    expect(setDeskSelection).not.toHaveBeenCalled()
  })

  /**
   * The mute apply sets must lift on *either* outcome. A click that races an incoming frame leaves
   * `selectedIds` matching neither the applied ids nor the pre-dispatch ones — and a guard that
   * only cleared on an exact match would then stay armed for the rest of the mount, silently
   * disabling the publish direction with nothing to see.
   */
  it('keeps publishing after an operator click races an incoming frame', () => {
    const { setSelection, render, select, state } = drive()
    deskTargets = [{ type: 'group', key: 'Front wash' }]
    render()
    expect(setSelection).toHaveBeenCalledWith(['group:Front wash'])

    // The operator gets somewhere else before apply's dispatch has rendered.
    state.ids = new Set(['fixture:par-9'])
    render()
    expect(setDeskSelection).toHaveBeenCalledWith([{ type: 'fixture', key: 'par-9' }])

    // And the next click still gets through.
    setDeskSelection.mockClear()
    select(['group:Front wash'])
    expect(setDeskSelection).toHaveBeenCalledWith([{ type: 'group', key: 'Front wash' }])
  })

  it('does nothing at all for a list that is not the programmer’s', () => {
    // `/fixtures/list` and `/groups/list` are browsing surfaces; two lists moving one desk-wide
    // fact would fight.
    const setSelection = vi.fn()
    deskTargets = [{ type: 'group', key: 'Front wash' }]
    const hook = renderHook(
      (p: { ids: Set<string> }) => useDeskSelectionBridge(false, rows, p.ids, setSelection),
      { initialProps: { ids: new Set<string>() } },
    )
    act(() => {
      hook.rerender({ ids: new Set(['fixture:par-9']) })
    })
    expect(setSelection).not.toHaveBeenCalled()
    expect(setDeskSelection).not.toHaveBeenCalled()
  })
})
