// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CueTarget } from '@/api/cuesApi'

/**
 * The busk view over the **desk's** selection rather than its own (plan D2).
 *
 * Two things are worth pinning and both are quiet failures: the rehydration, which is the only
 * place a target is dropped, and the two writes, which must send the *layer* target shape — a
 * group by name — because a pad's ring and a select LED have to agree about which group they mean.
 */

let deskTargets: CueTarget[] = []
const setSelection = vi.fn()
const toggleSelection = vi.fn()
const clearSelection = vi.fn()

const movers = { name: 'Movers', memberCount: 4, capabilities: [], symmetricMode: 'NONE', defaultDistribution: 'LINEAR', compatibleLookIds: [] }
const par = { key: 'par-1', name: 'PAR 1', typeKey: 'par' }

vi.mock('@/store/selection', () => ({
  useDeskSelection: () => deskTargets,
  setDeskSelection: (t: CueTarget[]) => setSelection(t),
  toggleDeskSelection: (t: CueTarget) => toggleSelection(t),
  clearDeskSelection: () => clearSelection(),
}))
vi.mock('@/store/groups', () => ({ useGroupListQuery: () => ({ data: [movers] }) }))
vi.mock('@/store/fixtures', () => ({ useFixtureListQuery: () => ({ data: [par] }) }))

import { useBuskingSelection } from './useBuskingSelection'

beforeEach(() => {
  deskTargets = []
  setSelection.mockClear()
  toggleSelection.mockClear()
  clearSelection.mockClear()
})

describe('useBuskingSelection', () => {
  it('rehydrates the desk’s `{type,key}` list into whole groups and fixtures', () => {
    // The band draws a member count and a name; the cache holds neither, so this is the step that
    // makes the desk's list usable here at all.
    deskTargets = [
      { type: 'group', key: 'Movers' },
      { type: 'fixture', key: 'par-1' },
    ]
    const { result } = renderHook(() => useBuskingSelection())
    expect([...result.current.selectedTargets.keys()]).toEqual(['group:Movers', 'fixture:par-1'])
    const group = result.current.selectedTargets.get('group:Movers')
    expect(group?.type === 'group' && group.group.memberCount).toBe(4)
  })

  it('shows nothing for a target the lists have not caught up with, and never filters it away', () => {
    // A target that has genuinely stopped resolving has already left `DeskSelection` server-side.
    // One missing here means the fixture list is still arriving, so it returns on the next frame —
    // this must not become a second, client-side drop rule.
    deskTargets = [{ type: 'fixture', key: 'not-yet' }]
    const { result } = renderHook(() => useBuskingSelection())
    expect(result.current.selectedTargets.size).toBe(0)
    expect(setSelection).not.toHaveBeenCalled()
  })

  it('replaces with the layer target shape — a group by name', () => {
    const { result } = renderHook(() => useBuskingSelection())
    result.current.selectTarget({ type: 'group', name: 'Movers', group: movers })
    expect(setSelection).toHaveBeenCalledWith([{ type: 'group', key: 'Movers' }])
  })

  it('hands a toggle to the desk rather than deciding it here', () => {
    // The desk narrows a partly covered group head by head (D2). Doing it here would need the
    // group's members, which `GroupSummary` does not carry — and a second answer would drift.
    const { result } = renderHook(() => useBuskingSelection())
    result.current.toggleTarget({ type: 'fixture', key: 'par-1', fixture: par as never })
    expect(toggleSelection).toHaveBeenCalledWith({ type: 'fixture', key: 'par-1' })
    expect(setSelection).not.toHaveBeenCalled()
  })

  it('clears through the desk', () => {
    const { result } = renderHook(() => useBuskingSelection())
    result.current.clearSelection()
    expect(clearSelection).toHaveBeenCalled()
  })
})
