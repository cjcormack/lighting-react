import { useEffect, useRef } from 'react'
import { setDeskSelection, useDeskSelection } from '../../store/selection'
import { rowIdsForTargets, selectedRowTargets, type Row, type RowId } from './rowModel'

/**
 * The programmer list ↔ desk selection bridge (`midi-surface-plan.md` §3.2).
 *
 * One desk, one selection (D2). A marquee here lights the strip select LEDs on an attached surface
 * and fills the busk view's target band; a select button pressed on the surface lights the rows
 * here. `selectionSlice` keeps what only a list has — anchor, ranges, row ids — and this is the
 * two-way wiring between it and the server-owned list.
 *
 * **Only the `programmer` scope.** `/fixtures/list` and `/groups/list` are browsing surfaces whose
 * selection scopes a Record or a locate; making either of them move the desk's selection would give
 * the operator two lists that fight over one fact.
 *
 * Four things are load-bearing, and three of them fail silently:
 *
 * - **Rows are published through `rowLocateTarget`** — via [selectedRowTargets] — never through the
 *   scope's `targetKeys`, which is already flattened to member keys. See that function's docblock
 *   for what breaks.
 * - **The publish is keyed on the selection, not on the target list.** `selectedRowTargets` narrows
 *   whenever `rows` narrows, and `rows` narrows on a filter keystroke while `selectedIds` does not —
 *   so an effect depending on the targets would shrink the desk's selection every time the operator
 *   typed in the filter box.
 * - **It never publishes on mount.** The slice starts empty (the container clears its scope on
 *   unmount), so a first-run publish would clear whatever the surface had selected the moment the
 *   programmer page was opened.
 * - **Apply mutes publish until the change it made lands.** `setSelection` is a dispatch, so the
 *   publish effect runs once more in the same commit with the *old* ids; without `pendingRef` it
 *   would publish a selection the desk had already replaced, and the two would ping-pong. The mute
 *   is released by *either* outcome — the applied ids arriving, or the operator getting there first
 *   — because a mute that only ever lifted on an exact match would latch forever the first time a
 *   click raced a frame, silently disabling the publish direction for the rest of the mount.
 */
export function useDeskSelectionBridge(
  enabled: boolean,
  rows: readonly Row[],
  selectedIds: ReadonlySet<RowId>,
  setSelection: (ids: readonly RowId[]) => void,
): void {
  const targets = useDeskSelection()

  // Read through refs: both effects want the *current* value of the other's input without
  // re-running when it moves, which is the whole point of keying each on one thing.
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const selectedRef = useRef(selectedIds)
  selectedRef.current = selectedIds

  /** Ids the apply effect has dispatched and is waiting to see land, or null. */
  const pendingRef = useRef<RowId[] | null>(null)
  /**
   * The ids that were selected *when* apply dispatched — the only value the publish effect can see
   * that means "your dep has not re-rendered yet" rather than "the operator moved it". Without it,
   * a mismatch is ambiguous and the only safe reading is to stay muted, which latches.
   */
  const dispatchedOverRef = useRef<ReadonlySet<RowId> | null>(null)
  const publishedOnceRef = useRef(false)

  // Desk → list. Declared first so a frame and the publish that would answer it resolve in that
  // order within one commit.
  //
  // Keyed on the frame plus "are there rows yet": the first frame usually arrives before the
  // fixture list does, and without the second dep a selection made on the surface before this page
  // opened would not appear until the operator moved it again. Deliberately **not** keyed on `rows`
  // itself — that fires on every filter keystroke, and with a desk that is not connected (so
  // `targets` is permanently empty) it would clear the operator's own selection.
  const rowsEmpty = rows.length === 0
  useEffect(() => {
    if (!enabled) return
    const ids = rowIdsForTargets(rowsRef.current, targets)
    const current = selectedRef.current
    if (ids.length === current.size && ids.every((id) => current.has(id))) {
      pendingRef.current = null
      return
    }
    pendingRef.current = ids
    dispatchedOverRef.current = current
    setSelection(ids)
  }, [enabled, targets, rowsEmpty, setSelection])

  // List → desk.
  useEffect(() => {
    if (!enabled) return
    if (!publishedOnceRef.current) {
      publishedOnceRef.current = true
      return
    }
    if (pendingRef.current != null) {
      const pending = pendingRef.current
      const landed = pending.length === selectedIds.size && pending.every((id) => selectedIds.has(id))
      // Still the pre-dispatch value: apply's `setSelection` has not re-rendered yet, so
      // `selectedIds` is stale and publishing it would tell the desk to undo the frame it just
      // sent. Wait — this is the *only* case that stays muted, and it lasts one commit.
      const stale = !landed && sameSet(dispatchedOverRef.current, selectedIds)
      if (stale) return
      pendingRef.current = null
      dispatchedOverRef.current = null
      // `landed` means the operator did nothing; the change was the desk's own and it already
      // knows. Anything else is the operator having moved the selection while the frame was in
      // flight, and that is theirs to publish.
      if (landed) return
    }
    setDeskSelection(selectedRowTargets(rowsRef.current, selectedIds))
  }, [enabled, selectedIds])
}

function sameSet(a: ReadonlySet<RowId> | null, b: ReadonlySet<RowId>): boolean {
  if (a == null || a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}
