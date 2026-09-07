import { useCallback, useMemo } from 'react'
import { useFixtureListQuery } from '@/store/fixtures'
import { useGroupListQuery } from '@/store/groups'
import {
  clearDeskSelection,
  setDeskSelection,
  toggleDeskSelection,
  useDeskSelection,
} from '@/store/selection'
import { buskingTargetKey, lookLayerTarget, type BuskingTarget } from './buskingTypes'

/**
 * Which targets the pad is aimed at — **the desk's selection**, not this tab's.
 *
 * It was local `useState` until the MIDI surface arrived, and the move is plan D2: one desk, one
 * selection, server-owned. The composition model's argument for one programmer applies verbatim —
 * DMX is one byte per channel, so two selections would force a "whose press wins?" policy nothing
 * expresses — and the practical consequence is that a select button on a control surface, a
 * marquee in the programmer's list and a pad in the target band are three ways to say one thing.
 *
 * **This is not a thin wrapper over the cache.** The cache holds `{ type, key }`; the band and the
 * pads want a whole `GroupSummary` or `Fixture` (a member count, a name, an icon), so this
 * rehydrates against the two lists. Rehydration is also the *only* place a target is dropped: a
 * target that no longer resolves has already left the desk's own list (`DeskSelection` drops it on
 * fixture reload), so a target missing here means the lists have not arrived yet, and it comes back
 * on their next frame rather than being filtered out by a second client-side rule.
 *
 * A Map keyed by `buskingTargetKey` rather than an array, because every other part of the pad asks
 * "is this one selected" far more often than it iterates, and a group and a fixture can share a
 * name.
 */
export function useBuskingSelection() {
  const targets = useDeskSelection()
  const { data: groups } = useGroupListQuery()
  const { data: fixtures } = useFixtureListQuery()

  const selectedTargets = useMemo(() => {
    const out = new Map<string, BuskingTarget>()
    for (const target of targets) {
      let rich: BuskingTarget | null = null
      if (target.type === 'group') {
        const group = groups?.find((g) => g.name === target.key)
        if (group) rich = { type: 'group', name: group.name, group }
      } else {
        const fixture = fixtures?.find((f) => f.key === target.key)
        if (fixture) rich = { type: 'fixture', key: fixture.key, fixture }
      }
      if (rich) out.set(buskingTargetKey(rich), rich)
    }
    return out
  }, [targets, groups, fixtures])

  /** Replace the selection with exactly this target. */
  const selectTarget = useCallback((target: BuskingTarget) => {
    setDeskSelection([lookLayerTarget(target)])
  }, [])

  const clearSelection = useCallback(() => {
    clearDeskSelection()
  }, [])

  /**
   * Add or remove one target.
   *
   * The desk decides what "remove" means, and it is not symmetric with "add": a fixture already
   * covered by a selected group is narrowed *out of that group's coverage* rather than removed as
   * an entry. Doing it here would need the group's members, which `GroupSummary` does not carry.
   */
  const toggleTarget = useCallback((target: BuskingTarget) => {
    toggleDeskSelection(lookLayerTarget(target))
  }, [])

  return { selectedTargets, selectTarget, toggleTarget, clearSelection }
}
