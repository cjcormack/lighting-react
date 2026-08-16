import type { RowId } from './rowModel'

/**
 * The pure half of list selection: intent parsing and the state transitions.
 *
 * Separate from [useListSelection] so that `store/selectionSlice.ts` can reduce with these
 * without importing the hook that dispatches its actions — the two would otherwise form an
 * import cycle. Everything here is re-exported from `useListSelection.ts`, which stays the
 * public entry point.
 */

export type ListSelectIntent = 'replace' | 'toggle' | 'range' | 'range-add'

/** Shift = range from the anchor, ⌘/Ctrl = toggle, ⌘/Ctrl+Shift = extend the
 *  selection by a range. Range semantics (not stage3d's shift-means-add): this
 *  is a list, and shift-click ranges are the list convention. */
export function listSelectionIntentFor(
  e: Pick<MouseEvent, 'shiftKey' | 'metaKey' | 'ctrlKey'>,
): ListSelectIntent {
  const cmd = e.metaKey || e.ctrlKey
  if (cmd && e.shiftKey) return 'range-add'
  if (e.shiftKey) return 'range'
  if (cmd) return 'toggle'
  return 'replace'
}

export interface ListSelectionState {
  /** Selected ids, in the order they were added (not display order). */
  ids: readonly RowId[]
  /** The range pivot: stays put across successive shift-clicks so the user can
   *  re-pivot a range from the same starting row. */
  anchor: RowId | null
}

/**
 * Pure selection reducer. `visibleOrder` is the current `buildRows` output
 * order — ranges are slices of it. An anchor that's been filtered out of view
 * degrades the range to a plain replace.
 */
export function applyListSelection(
  state: ListSelectionState,
  action: { id: RowId; intent: ListSelectIntent },
  visibleOrder: readonly RowId[],
): ListSelectionState {
  const { id, intent } = action

  if (intent === 'range' || intent === 'range-add') {
    const anchorIdx = state.anchor === null ? -1 : visibleOrder.indexOf(state.anchor)
    if (anchorIdx === -1) {
      return { ids: [id], anchor: id }
    }
    const clickedIdx = visibleOrder.indexOf(id)
    if (clickedIdx === -1) return state
    const [lo, hi] = anchorIdx <= clickedIdx ? [anchorIdx, clickedIdx] : [clickedIdx, anchorIdx]
    const slice = visibleOrder.slice(lo, hi + 1)
    if (intent === 'range') {
      return { ids: slice, anchor: state.anchor }
    }
    const merged = [...state.ids]
    const present = new Set(state.ids)
    for (const rangeId of slice) {
      if (!present.has(rangeId)) {
        present.add(rangeId)
        merged.push(rangeId)
      }
    }
    return { ids: merged, anchor: state.anchor }
  }

  if (intent === 'toggle') {
    if (state.ids.includes(id)) {
      const ids = state.ids.filter((existing) => existing !== id)
      // Anchor falls back to the last remaining selection when the anchor
      // itself was toggled off.
      const anchor = state.anchor === id ? (ids[ids.length - 1] ?? null) : state.anchor
      return { ids, anchor }
    }
    return { ids: [...state.ids, id], anchor: id }
  }

  return { ids: [id], anchor: id }
}

/**
 * Replace the whole selection with [ids], keeping only those currently in view.
 *
 * Separate from `select(id, 'replace')` because it is not a click: Include hands back a set
 * of fixtures and the sheet selects exactly them. Ids that aren't visible (filtered out, or a
 * group row in the wrong rollup mode) are dropped rather than silently selecting nothing.
 */
export function setListSelection(
  ids: readonly RowId[],
  visibleOrder: readonly RowId[],
): ListSelectionState {
  const wanted = new Set(ids)
  const present = visibleOrder.filter((id) => wanted.has(id))
  return { ids: present, anchor: present[present.length - 1] ?? null }
}
