import { useState, useMemo } from 'react'
import { ChevronRight, Layers, ListMusic } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useProjectCueListQuery } from '../store/cues'
import { useProjectCueStackListQuery } from '../store/cueStacks'
import { SlotItemContent, type CueSlotAssignDragData } from './CueSlotOverviewPanel'

interface EditModeAssignPanelProps {
  projectId: number
}

export function EditModeAssignPanel({ projectId }: EditModeAssignPanelProps) {
  const { data: cues } = useProjectCueListQuery(projectId)
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const [expandedStackId, setExpandedStackId] = useState<number | null>(null)

  // Standalone cues (not belonging to any stack)
  const standaloneCues = useMemo(
    () => (cues ?? []).filter((c) => c.cueStackId == null),
    [cues],
  )

  const expandedStack = useMemo(
    () => (stacks ?? []).find((s) => s.id === expandedStackId),
    [stacks, expandedStackId],
  )

  return (
    <div className="border-t pt-2">
      <Tabs defaultValue="stacks" className="gap-1.5">
        <TabsList className="w-full">
          <TabsTrigger value="cues" className="text-xs">
            <ListMusic className="size-3.5" />
            Cues
          </TabsTrigger>
          <TabsTrigger value="stacks" className="text-xs">
            <Layers className="size-3.5" />
            Stacks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cues">
          <div className="max-h-48 overflow-y-auto">
            {standaloneCues.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No standalone cues</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {standaloneCues.map((cue) => (
                  <DraggableAssignCard
                    key={cue.id}
                    id={cue.id}
                    name={cue.name}
                    palette={cue.palette}
                    itemType="cue"
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stacks">
          <div className="max-h-48 overflow-y-auto space-y-2">
            {(stacks ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No cue stacks</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {(stacks ?? []).map((stack) => (
                    <DraggableStackCard
                      key={stack.id}
                      stackId={stack.id}
                      name={stack.name}
                      palette={stack.palette}
                      cueCount={stack.cues.length}
                      isExpanded={expandedStackId === stack.id}
                      onToggleExpand={() =>
                        setExpandedStackId(expandedStackId === stack.id ? null : stack.id)
                      }
                    />
                  ))}
                </div>

                {/* Expanded stack's individual cues */}
                {expandedStack && expandedStack.cues.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">
                      {expandedStack.name} cues
                    </p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                      {expandedStack.cues.map((cue) => (
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
        </TabsContent>
      </Tabs>
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
