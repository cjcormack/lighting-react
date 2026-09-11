import { useEffect, useRef } from 'react'
import { setDeskSelection, useDeskSelection } from '../../store/selection'
import type { LocateTarget } from '../../store/locate'
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
 * - **The bridge remembers what it published, and drops its own echoes.** The desk acknowledges
 *   every `selection.set` with a `selection.state` broadcast and nothing else, so a frame that
 *   equals something this bridge sent is the desk agreeing, not the desk moving. Until the
 *   selection could change several times a second that never mattered: a click published once and
 *   its echo matched. A marquee publishes at every row boundary it crosses, and two things then go
 *   wrong without this. Echoes arrive in order but late, so the echo of an earlier frame reaches a
 *   selection that has moved on, "mismatches", and is applied — replacing the marquee with a stale
 *   row selection the instant the drag ends. And the id round trip is lossy by design: a marquee
 *   over a parent and its element rows publishes the parent alone, and a fixture in two expanded
 *   groups answers `rowIdsForTargets` as two rows, so even the *final* echo can resolve to a
 *   different id set than the one that produced it. Both are one problem — "is this frame mine?" —
 *   and both close at the **target** level, where our own `set` echoes verbatim: `publishedRef` is
 *   a short FIFO of the target sets sent and not yet seen back; a frame matching any of them (or a
 *   subset, since the desk drops a target it cannot resolve) is an echo, everything up to and
 *   including it is acknowledged, and nothing is applied. A desk-side change that happens to equal
 *   a pending publish is skipped, which is a no-op.
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
  /** Target sets this bridge has sent and not yet seen echoed, oldest first. See the docblock. */
  const publishedRef = useRef<Set<string>[]>([])

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
    // Our own echo: acknowledge it and every publish before it, and apply nothing.
    const frame = new Set(targets.map(targetKey))
    const echoOf = publishedRef.current.findIndex((sent) => isSubset(frame, sent))
    if (echoOf !== -1) {
      publishedRef.current.splice(0, echoOf + 1)
      return
    }
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
    const published = selectedRowTargets(rowsRef.current, selectedIds)
    publishedRef.current.push(new Set(published.map(targetKey)))
    // A bounded memory: an echo that never comes (the socket dropped mid-drag) must not let the
    // list grow for the life of the page. Well past the frames a drag can have in flight.
    if (publishedRef.current.length > MAX_PENDING_PUBLISHES) publishedRef.current.shift()
    setDeskSelection(published)
  }, [enabled, selectedIds])
}

const MAX_PENDING_PUBLISHES = 64

function targetKey(target: LocateTarget): string {
  return `${target.type}:${target.key}`
}

/**
 * Every key of [frame] is in [sent] — equal, or the desk dropped a target it could not resolve.
 *
 * An **empty** frame is an echo only of an empty publish. It is trivially a subset of anything, and
 * reading it as one would swallow a genuine deselect-all from the desk that lands inside one
 * unacknowledged round trip — and leave the list selected against a desk that is not.
 */
function isSubset(frame: ReadonlySet<string>, sent: ReadonlySet<string>): boolean {
  if (frame.size === 0) return sent.size === 0
  if (frame.size > sent.size) return false
  for (const key of frame) if (!sent.has(key)) return false
  return true
}

function sameSet(a: ReadonlySet<RowId> | null, b: ReadonlySet<RowId>): boolean {
  if (a == null || a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}
