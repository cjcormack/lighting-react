import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  useDndContext,
  useDndMonitor,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { BuskPage } from '@/api/buskApi'
import { applyDrop, type DropTarget } from '@/lib/buskLayout'
import { useBuskLayoutCommit, type BuskLayoutOp } from '@/store/busk'
import { buskDragData, dragSourceOf, resolveDropTarget, sameTarget, type BuskDragData } from './buskDnd'

/**
 * The busk page's half of the app's one drag context.
 *
 * It creates **no `DndContext` of its own** — that is the whole design. `Layout.tsx` mounts one
 * around both the FX cue-slot overlay and the routed page, and a nested context would win for this
 * subtree and hide the busk page from the overlay's droppables. `useDndMonitor` subscribes to the
 * ancestor's event bus instead, and gets `onDragOver` even though the provider passes no such prop.
 *
 * What it holds is a **hover target, not a document**: `{source, target}` in local state, at hover
 * rate — the standing reason such state stays out of the store. The renderer draws the source
 * ghosted where it is and one dashed slot at the target, and `applyDrop` runs exactly once, on the
 * drop. That is cheaper than previewing a whole document per hover and, more importantly, stable:
 * the layout moves by one slot the first time and then not again, so the placeholder cannot
 * oscillate under the pointer.
 *
 * Three things about how the hover is fed, each the fix for a drop that landed somewhere other
 * than where the slot was drawn:
 *
 * - **It listens to `onDragMove`, not only `onDragOver`.** dnd-kit fires `onDragOver` when the
 *   `over` id *changes* and at no other time, so a resolver fed from it alone decides the
 *   leading/trailing half of a pad once, on entry, and never again as the pointer crosses the
 *   centre. `onDragMove` carries the same `collisions` and `over` on every pointer movement;
 *   `sameTarget` keeps the state write to the moves that change the answer.
 * - **The droppables are re-measured whenever the target moves.** `MeasuringStrategy.Always` is not
 *   a timer: dnd-kit measures on demand — when the set of droppables changes, or a droppable's own
 *   ResizeObserver fires. Opening the dashed slot shifts every later pad and every row below it
 *   without resizing any of them, so their rects were stale for the rest of the drag. The effect
 *   below runs after the commit that moved the slot, so what it measures includes it. (The
 *   "stack under" strips that mount when a bank is lifted register new droppables, which is a
 *   container-set change dnd-kit re-measures on its own.)
 * - **The drop reads a ref, not state.** A drop that lands before the re-render following the
 *   last hover would otherwise read the target *before* that one.
 */
interface BuskEditContextValue {
  editing: boolean
  source: BuskDragData | null
  target: DropTarget | null
  /** Save one gesture as a whole page. See `useBuskLayoutCommit`. */
  commit: (op: BuskLayoutOp) => void
}

/** Exported for tests that need a source and a target without driving a pointer through dnd-kit. */
export const BuskEditContext = createContext<BuskEditContextValue>({
  editing: false,
  source: null,
  target: null,
  commit: () => {},
})

export function useBuskEdit() {
  return useContext(BuskEditContext)
}

export function BuskEditProvider({
  editing,
  projectId,
  page,
  children,
}: {
  editing: boolean
  projectId: number
  page: BuskPage | null
  children: React.ReactNode
}) {
  const [source, setSource] = useState<BuskDragData | null>(null)
  const [target, setTarget] = useState<DropTarget | null>(null)
  const targetRef = useRef<DropTarget | null>(null)
  const commit = useBuskLayoutCommit(projectId, page?.id ?? null)
  const { measureDroppableContainers } = useDndContext()

  const clear = useCallback(() => {
    setSource(null)
    setTarget(null)
    targetRef.current = null
  }, [])

  const hover = useCallback(
    (event: DragMoveEvent | DragOverEvent) => {
      const data = buskDragData(event.active)
      if (data == null || page == null) return
      const next = resolveDropTarget({
        page,
        source: dragSourceOf(data).kind,
        activeId: String(event.active.id),
        overId: event.over == null ? null : String(event.over.id),
        collisionIds: (event.collisions ?? []).map((c) => String(c.id)),
        activeRect: event.active.rect.current.translated,
        overRect: event.over?.rect ?? null,
        current: targetRef.current,
      })
      // A repeat hover must write no state, or the placeholder would re-render at pointer rate.
      if (sameTarget(targetRef.current, next)) return
      targetRef.current = next
      setTarget(next)
    },
    [page],
  )

  useDndMonitor({
    onDragStart(event: DragStartEvent) {
      const data = buskDragData(event.active)
      if (data != null) setSource(data)
    },
    onDragMove: hover,
    onDragOver: hover,
    onDragEnd(event: DragEndEvent) {
      const data = buskDragData(event.active)
      const landing = targetRef.current
      clear()
      if (data == null || landing == null || page == null) return
      const drop = dragSourceOf(data)
      // A drop that changes nothing is an ordinary outcome, not an edge case: the pointer sensor
      // arms at 8px, so half of all "never mind" gestures end back where they started. Committing
      // one anyway would spend a whole-page PUT and a `busk.layoutChanged` broadcast to every other
      // desk on a page that did not move. `applyDrop` already answers null for it — ask before
      // enqueuing rather than letting the `?? current` fallback swallow the answer.
      if (applyDrop(page, drop, landing) == null) return
      commit((current) => applyDrop(current, drop, landing) ?? current)
    },
    onDragCancel: clear,
  })

  // A drag in flight when the route changes never reaches its drop, and `useDndMonitor`
  // unsubscribes on unmount — so nothing else would clear these.
  useEffect(() => clear, [clear])

  // After the slot has moved (or the strips have appeared), every rect below it is wrong until
  // measured again. Only while something is lifted: outside a drag there is nothing to measure for.
  useEffect(() => {
    if (source != null) measureDroppableContainers([])
  }, [source, target, measureDroppableContainers])

  const value = useMemo(
    () => ({ editing, source, target, commit }),
    [editing, source, target, commit],
  )
  return <BuskEditContext.Provider value={value}>{children}</BuskEditContext.Provider>
}
