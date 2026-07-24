import { useState, useMemo } from 'react'
import { ChevronRight, Layers } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { useProjectCueStackListQuery } from '../store/cueStacks'
import { SlotItemContent, type CueSlotAssignDragData } from './CueSlotOverviewPanel'

interface EditModeAssignPanelProps {
  projectId: number
}

export function EditModeAssignPanel({ projectId }: EditModeAssignPanelProps) {
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const [expandedStackId, setExpandedStackId] = useState<number | null>(null)

  // Only runnable stacks are assignable — separators carry no cues.
  const runnableStacks = useMemo(
    () => (stacks ?? []).filter((s) => s.type === 'STACK'),
    [stacks],
  )

  const expandedStack = useMemo(
    () => runnableStacks.find((s) => s.id === expandedStackId),
    [runnableStacks, expandedStackId],
  )

  const expandedCues = useMemo(
    () => (expandedStack?.cues ?? []).filter((c) => c.cueType === 'STANDARD'),
    [expandedStack],
  )

  return (
    <div className="border-t pt-2 space-y-2">
      <div className="flex items-center gap-1.5 px-0.5 text-xs text-muted-foreground">
        <Layers className="size-3.5" />
        Stacks
      </div>
      <div className="max-h-48 overflow-y-auto space-y-2">
        {runnableStacks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No cue stacks</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {runnableStacks.map((stack) => {
                const cueCount = stack.cues.filter((c) => c.cueType === 'STANDARD').length
                return (
                  <DraggableStackCard
                    key={stack.id}
                    stackId={stack.id}
                    name={stack.name}
                    palette={stack.palette}
                    cueCount={cueCount}
                    isExpanded={expandedStackId === stack.id}
                    onToggleExpand={() =>
                      setExpandedStackId(expandedStackId === stack.id ? null : stack.id)
                    }
                  />
                )
              })}
            </div>

            {/* Expanded stack's individual cues */}
            {expandedStack && expandedCues.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">
                  {expandedStack.name} cues
                </p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {expandedCues.map((cue) => (
                    <DraggableAssignCard
                      key={cue.id}
                      id={cue.id}
                      name={cue.name}
                      palette={[]}
                      itemType="cue"
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Draggable card for a single cue ──────────────────────────────────

interface DraggableAssignCardProps {
  id: number
  name: string
  palette: string[]
  itemType: 'cue' | 'cue_stack'
}

function DraggableAssignCard({ id, name, palette, itemType }: DraggableAssignCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `assign-${itemType}-${id}`,
    data: {
      type: 'cue-slot-assign',
      itemType,
      itemId: id,
      itemName: name,
    } satisfies CueSlotAssignDragData,
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-md border flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] px-1.5 py-1 cursor-grab active:cursor-grabbing select-none touch-none transition-opacity hover:bg-muted/50',
        isDragging && 'opacity-40',
      )}
    >
      <SlotItemContent name={name} itemType={itemType} palette={palette} />
    </div>
  )
}

// ─── Draggable card for a cue stack (with expand toggle) ─────────────

interface DraggableStackCardProps {
  stackId: number
  name: string
  palette: string[]
  cueCount: number
  isExpanded: boolean
  onToggleExpand: () => void
}

function DraggableStackCard({
  stackId,
  name,
  palette,
  cueCount,
  isExpanded,
  onToggleExpand,
}: DraggableStackCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `assign-cue_stack-${stackId}`,
    data: {
      type: 'cue-slot-assign',
      itemType: 'cue_stack',
      itemId: stackId,
      itemName: name,
    } satisfies CueSlotAssignDragData,
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'relative rounded-md border flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] px-1.5 py-1 cursor-grab active:cursor-grabbing select-none touch-none transition-opacity hover:bg-muted/50',
        isDragging && 'opacity-40',
        isExpanded && 'ring-1 ring-primary/30',
      )}
    >
      <SlotItemContent name={name} itemType="cue_stack" palette={palette} />
      {cueCount > 0 && (
        <button
          className="absolute bottom-0 right-0 size-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ChevronRight
            className={cn('size-2.5 transition-transform', isExpanded && 'rotate-90')}
          />
        </button>
      )}
    </div>
  )
}
