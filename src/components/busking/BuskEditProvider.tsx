import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useDndMonitor, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
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
 */
interface BuskEditContextValue {
  editing: boolean
  source: BuskDragData | null
  target: DropTarget | null
  /** Save one gesture as a whole page. See `useBuskLayoutCommit`. */
  commit: (op: BuskLayoutOp) => void
}

const BuskEditContext = createContext<BuskEditContextValue>({
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
  const commit = useBuskLayoutCommit(projectId, page?.id ?? null)

  const clear = useCallback(() => {
    setSource(null)
    setTarget(null)
  }, [])

  useDndMonitor({
    onDragStart(event: DragStartEvent) {
      const data = buskDragData(event.active)
      if (data != null) setSource(data)
    },
    onDragOver(event: DragOverEvent) {
      const data = buskDragData(event.active)
      if (data == null || page == null) return
      const next = resolveDropTarget({
        page,
        activeId: String(event.active.id),
        overId: event.over == null ? null : String(event.over.id),
        collisionIds: (event.collisions ?? []).map((c) => String(c.id)),
        activeRect: event.active.rect.current.translated,
        overRect: event.over?.rect ?? null,
      })
      // A repeat hover must write no state, or the placeholder would re-render at pointer rate.
      setTarget((current) => (sameTarget(current, next) ? current : next))
    },
    onDragEnd(event: DragEndEvent) {
      const data = buskDragData(event.active)
      const landing = target
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

  const value = useMemo(
    () => ({ editing, source, target, commit }),
    [editing, source, target, commit],
  )
  return <BuskEditContext.Provider value={value}>{children}</BuskEditContext.Provider>
}
