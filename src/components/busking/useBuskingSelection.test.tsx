// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CueTarget } from '@/api/cuesApi'
import type { AttributeFamily } from '@/lib/attributeFamily'
import {
  getLocalSelection,
  relinkToDesk,
  resetDeskFollowStores,
  unlinkFromDesk,
} from '@/lib/deskFollow'

/**
 * The busk view over the **desk's** selection rather than its own (plan D2) — and over its own
 * when the tab has unlinked (multi-screen plan D8).
 *
 * Three things are worth pinning and all are quiet failures: the rehydration, which is the only
 * place a target is dropped; the writes, which must send the *layer* target shape — a group by
 * name — because a pad's ring and a select LED have to agree about which group they mean; and the
 * local arm, where the same three writes must reach the tab's copy and never the desk.
 */

let deskTargets: CueTarget[] = []
let deskFamilies: AttributeFamily[] | null = null
const setSelection = vi.fn()
const toggleSelection = vi.fn()
const clearSelection = vi.fn()

const movers = { name: 'Movers', memberCount: 4, capabilities: [], symmetricMode: 'NONE', defaultDistribution: 'LINEAR', compatibleLookIds: [] }
const par = { key: 'par-1', name: 'PAR 1', typeKey: 'par' }

// The store's readers over a real `lib/deskFollow.ts`, so the local arm is the real one.
vi.mock('@/store/selection', async () => {
  const { useDeskFollow, useLocalSelection } = await import('@/lib/deskFollow')
  return {
    useSelectionPair: () => {
      const following = useDeskFollow()
      const local = useLocalSelection()
      return following ? { targets: deskTargets, families: deskFamilies } : local
    },
    setDeskSelection: (t: CueTarget[], f?: AttributeFamily[] | null) => setSelection(t, f ?? null),
    toggleDeskSelection: (t: CueTarget) => toggleSelection(t),
    clearDeskSelection: () => clearSelection(),
  }
})
vi.mock('@/store/groups', () => ({ useGroupListQuery: () => ({ data: [movers] }) }))
vi.mock('@/store/fixtures', () => ({ useFixtureListQuery: () => ({ data: [par] }) }))

import { useBuskingSelection } from './useBuskingSelection'

beforeEach(() => {
  deskTargets = []
  deskFamilies = null
  setSelection.mockClear()
  toggleSelection.mockClear()
  clearSelection.mockClear()
})

afterEach(() => {
  window.sessionStorage.clear()
  resetDeskFollowStores()
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

  it('hands the desk’s mask through beside the targets', () => {
    deskTargets = [{ type: 'fixture', key: 'par-1' }]
    deskFamilies = ['COLOUR']
    const { result } = renderHook(() => useBuskingSelection())
    expect(result.current.families).toEqual(['COLOUR'])
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

  it('replaces with the layer target shape — a group by name — and no mask', () => {
    // A replace clears the mask (D2): the narrow-width picker has no column axis to speak with.
    const { result } = renderHook(() => useBuskingSelection())
    result.current.selectTarget({ type: 'group', name: 'Movers', group: movers })
    expect(setSelection).toHaveBeenCalledWith([{ type: 'group', key: 'Movers' }], null)
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

  describe('unlinked from the desk (D8)', () => {
    it('shows the snapshot taken at unlink, and stops following the desk', () => {
      deskTargets = [{ type: 'fixture', key: 'par-1' }]
      deskFamilies = ['COLOUR']
      const { result } = renderHook(() => useBuskingSelection())
      act(() => unlinkFromDesk({ targets: deskTargets, families: deskFamilies }))
      expect([...result.current.selectedTargets.keys()]).toEqual(['fixture:par-1'])
      expect(result.current.families).toEqual(['COLOUR'])

      // The desk moves on; this tab does not.
      deskTargets = [{ type: 'group', key: 'Movers' }]
      deskFamilies = null
      act(() => {})
      expect([...result.current.selectedTargets.keys()]).toEqual(['fixture:par-1'])
      expect(result.current.families).toEqual(['COLOUR'])
    })

    it('writes to the tab’s own copy, keeps the mask on a toggle and clears it on a replace, and never touches the desk', () => {
      const { result } = renderHook(() => useBuskingSelection())
      act(() => unlinkFromDesk({ targets: [{ type: 'fixture', key: 'par-1' }], families: ['COLOUR'] }))

      act(() => result.current.toggleTarget({ type: 'group', name: 'Movers', group: movers }))
      expect([...result.current.selectedTargets.keys()]).toEqual(['fixture:par-1', 'group:Movers'])
      expect(result.current.families).toEqual(['COLOUR'])

      act(() => result.current.toggleTarget({ type: 'fixture', key: 'par-1', fixture: par as never }))
      expect([...result.current.selectedTargets.keys()]).toEqual(['group:Movers'])

      act(() => result.current.selectTarget({ type: 'fixture', key: 'par-1', fixture: par as never }))
      expect([...result.current.selectedTargets.keys()]).toEqual(['fixture:par-1'])
      expect(result.current.families).toBeNull()

      act(() => result.current.clearSelection())
      expect(result.current.selectedTargets.size).toBe(0)

      expect(setSelection).not.toHaveBeenCalled()
      expect(toggleSelection).not.toHaveBeenCalled()
      expect(clearSelection).not.toHaveBeenCalled()
    })

    it('adopts the desk’s selection on re-link and drops the copy', () => {
      deskTargets = [{ type: 'group', key: 'Movers' }]
      const { result } = renderHook(() => useBuskingSelection())
      act(() => unlinkFromDesk({ targets: [{ type: 'fixture', key: 'par-1' }], families: null }))
      expect([...result.current.selectedTargets.keys()]).toEqual(['fixture:par-1'])
      act(() => relinkToDesk())
      expect([...result.current.selectedTargets.keys()]).toEqual(['group:Movers'])
      expect(getLocalSelection().targets).toEqual([])
      // Nothing was published: re-linking adopts, it does not clear what another screen has.
      expect(setSelection).not.toHaveBeenCalled()
    })
  })
})
