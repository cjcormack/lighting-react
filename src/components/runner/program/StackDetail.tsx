import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, SeparatorHorizontal, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import {
  useReorderCueStackCuesMutation,
  useSortCueStackByCueNumberMutation,
} from '@/store/cueStacks'
import type { CueStack } from '@/api/cueStacksApi'
import type { Cue } from '@/api/cuesApi'
import { ProgramCueRow } from './ProgramCueRow'
import { ProgramMarkerRow } from './ProgramMarkerRow'
import { OutOfOrderBanner } from '@/components/runner/OutOfOrderBanner'
import { cueNumberColumnChars, detectOutOfOrder } from '@/lib/cueNumber'

interface StackDetailProps {
  stack: CueStack
  projectId: number
  activeCueId: number | null
  /** Cue queued to fire on the next GO. Only meaningful when drilled into the active stack. */
  standbyCueId?: number | null
  /** Cue id whose card is currently expanded inline. */
  expandedCueId: number | null
  onExpandedCueChange: (cueId: number | null) => void
  onBack: () => void
  /**
   * Record the programmer into a new cue in this stack — what replaced "Add Cue".
   *
   * Optional so the surface still renders where nothing can record (a stack list read while the
   * programmer sheets are not mounted); the button disables itself rather than vanishing, so the
   * route in is still discoverable.
   */
  onRecordIntoStack?: (stackId: number) => void
  onAddMarker: () => void
  onMarkerRename: (cueId: number, name: string) => void
  onMarkerDelete: (cueId: number) => void
  onDuplicate?: (cue: Cue) => void
  /** Record the programmer into this cue — opens the Record sheet targeting it. */
  onRecordInto?: (cueId: number) => void
  /** Load this cue into the programmer to edit it on stage. */
  onIncludeCue?: (cueId: number) => void
  includePending?: boolean
}

export function StackDetail({
  stack,
  projectId,
  activeCueId,
  standbyCueId,
  expandedCueId,
  onExpandedCueChange,
  onBack,
  onRecordIntoStack,
  onAddMarker,
  onMarkerRename,
  onMarkerDelete,
  onDuplicate,
  onRecordInto,
  onIncludeCue,
  includePending,
}: StackDetailProps) {
  const [reorderCues] = useReorderCueStackCuesMutation()
  const [sortByCueNumber] = useSortCueStackByCueNumberMutation()

  // Offer to fix the order when a cue-number group descends against itself. Dismissal is scoped
  // to the stack so drilling into another one asks again.
  const outOfOrder = useMemo(() => detectOutOfOrder(stack.cues), [stack.cues])
  const [dismissedFor, setDismissedFor] = useState<number | null>(null)
  const showOutOfOrder = outOfOrder && dismissedFor !== stack.id

  // Scroll the active cue into view when drilling in or when the active cue
  // changes for this stack.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (activeCueId == null || !listRef.current) return
    const row = listRef.current.querySelector(`[data-cue-row="${activeCueId}"]`)
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [stack.id, activeCueId])

  // Scroll an expanded card into view so the operator sees the editor body.
  useEffect(() => {
    if (expandedCueId == null || !listRef.current) return
    const row = listRef.current.querySelector(`[data-cue-row="${expandedCueId}"]`)
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [expandedCueId])

  const standardCount = useMemo(
    () => stack.cues.filter((c) => c.cueType === 'STANDARD').length,
    [stack.cues],
  )

  // Number-column width for every row in this stack. MARKERs are unnumbered dividers, so they
  // must not drag the column down to the "—" placeholder width.
  const cueNumChars = useMemo(
    () =>
      cueNumberColumnChars(
        stack.cues.filter((c) => c.cueType === 'STANDARD').map((c) => c.cueNumber),
      ),
    [stack.cues],
  )

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = stack.cues.findIndex((c) => c.id === active.id)
      const newIndex = stack.cues.findIndex((c) => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(stack.cues, oldIndex, newIndex)
      reorderCues({
        projectId,
        stackId: stack.id,
        cueIds: reordered.map((c) => c.id),
      })
    },
    [stack, projectId, reorderCues],
  )

  return (
    <div className="@container flex-1 flex flex-col overflow-hidden">
      {/* Header — controls drop their text labels progressively as the content area narrows
          (container-query, sidebar-aware); everything stays reachable as an icon button down
          to phone widths. */}
      <div className="flex items-center h-12 px-4 border-b gap-3 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="font-bold tracking-wider"
          aria-label="Back to stacks"
        >
          <ArrowLeft className="size-3.5" />
          <span className="ml-1.5 hidden @[520px]:inline">Stacks</span>
        </Button>
        <span className="text-sm font-semibold text-foreground truncate min-w-0">
          {stack.name}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {standardCount} cues
        </span>
        <div className="flex-1" />

        {/* **Recording is the only way in.** "Add Cue" made an empty cue and opened an editor
            on it, which is backwards: a cue is a captured state, so the thing that makes one is the
            state you captured. An empty cue was a container asking to be filled by hand, which is
            what the three-pane editor existed to do — and it is gone.

            Separators keep their button, and so do stacks: neither is a captured state. That is the
            line, not "no new buttons". */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRecordIntoStack?.(stack.id)}
          disabled={!onRecordIntoStack}
          aria-label={`Record the programmer into ${stack.name}`}
          title="Record what the programmer is holding as a new cue in this stack"
        >
          <Zap className="size-3.5" />
          <span className="ml-1.5 hidden @[600px]:inline">Record into {stack.name}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={onAddMarker} aria-label="Add separator">
          <SeparatorHorizontal className="size-3.5" />
          <span className="ml-1.5 hidden @[600px]:inline">Separator</span>
        </Button>
      </div>

      {showOutOfOrder && (
        <OutOfOrderBanner
          onFixOrder={() => sortByCueNumber({ projectId, stackId: stack.id })}
          onDismiss={() => setDismissedFor(stack.id)}
        />
      )}

      {/* Cue list — scrolls within the recessed Row 4 surface set on the root above. */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto py-1"
        style={{ '--cue-num-chars': cueNumChars } as CSSProperties}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={stack.cues.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {stack.cues.map((cue) => {
              if (cue.cueType === 'MARKER') {
                return (
                  <ProgramMarkerRow
                    key={cue.id}
                    id={cue.id}
                    name={cue.name}
                    onRename={(name) => onMarkerRename(cue.id, name)}
                    onDelete={() => onMarkerDelete(cue.id)}
                  />
                )
              }
              return (
                <ProgramCueRow
                  key={cue.id}
                  cue={cue}
                  projectId={projectId}
                  expanded={expandedCueId === cue.id}
                  onToggleExpanded={() =>
                    onExpandedCueChange(expandedCueId === cue.id ? null : cue.id)
                  }
                  isActive={cue.id === activeCueId}
                  isStandby={cue.id === standbyCueId}
                  onDuplicate={onDuplicate}
                  onRecordInto={onRecordInto}
                  onIncludeCue={onIncludeCue}
                  includePending={includePending}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}
