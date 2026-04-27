import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Layers,
  ListChecks,
  Plus,
  SeparatorHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useMediaQuery, SM_BREAKPOINT } from '@/hooks/useMediaQuery'
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
import { useReorderCueStackCuesMutation } from '@/store/cueStacks'
import type { CueStack } from '@/api/cueStacksApi'
import type { Cue } from '@/api/cuesApi'
import { ProgramCueRow } from './ProgramCueRow'
import { ProgramMarkerRow } from './ProgramMarkerRow'
import { cn } from '@/lib/utils'
import type { LayersMode } from './CueCardEditor/CueCardEditor'

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
  onAddCue: () => void
  onAddMarker: () => void
  onMarkerRename: (cueId: number, name: string) => void
  onMarkerDelete: (cueId: number) => void
  onDuplicate?: (cue: Cue) => void
  onSnapshotFromLive?: (cueId: number) => Promise<void> | void
  snapshotPending?: boolean
}

export function StackDetail({
  stack,
  projectId,
  activeCueId,
  standbyCueId,
  expandedCueId,
  onExpandedCueChange,
  onBack,
  onAddCue,
  onAddMarker,
  onMarkerRename,
  onMarkerDelete,
  onDuplicate,
  onSnapshotFromLive,
  snapshotPending,
}: StackDetailProps) {
  const isWide = useMediaQuery(SM_BREAKPOINT)
  const [reorderCues] = useReorderCueStackCuesMutation()
  const [layersMode, setLayersMode] = useState<LayersMode>('by-target')

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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center h-12 px-4 border-b gap-3 shrink-0">
        <Button
          variant="outline"
          size={isWide ? 'sm' : 'icon-sm'}
          onClick={onBack}
          className={isWide ? 'font-bold tracking-wider' : ''}
          aria-label="Back to stacks"
        >
          <ArrowLeft className="size-3.5" />
          {isWide && <span className="ml-1.5">Stacks</span>}
        </Button>
        <span className="text-sm font-semibold text-foreground truncate min-w-0">
          {stack.name}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {standardCount} cues
        </span>
        <div className="flex-1" />

        {/* By-target / By-layer toggle */}
        <div
          className="hidden sm:inline-flex items-center rounded-md border bg-muted/30 p-0.5 mr-1"
          role="group"
          aria-label="Layers arrangement"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setLayersMode('by-target')}
                className={cn(
                  'inline-flex items-center gap-1.5 h-7 px-2 rounded text-xs transition-colors',
                  layersMode === 'by-target'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Layers className="size-3.5" />
                By target
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Group every assignment / effect / preset by its target.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setLayersMode('by-layer')}
                className={cn(
                  'inline-flex items-center gap-1.5 h-7 px-2 rounded text-xs transition-colors',
                  layersMode === 'by-layer'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <ListChecks className="size-3.5" />
                By layer
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Top-level Presets · Assignments · Effects sections.
            </TooltipContent>
          </Tooltip>
        </div>

        {isWide ? (
          <>
            <Button variant="outline" size="sm" onClick={onAddCue}>
              <Plus className="size-3.5 mr-1.5" />
              Add Cue
            </Button>
            <Button variant="outline" size="sm" onClick={onAddMarker}>
              <SeparatorHorizontal className="size-3.5 mr-1.5" />
              Separator
            </Button>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Add">
                <Plus className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onAddCue}>Add Cue</DropdownMenuItem>
              <DropdownMenuItem onClick={onAddMarker}>Add Separator</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Cue list */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-1">
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
                  layersMode={layersMode}
                  onDuplicate={onDuplicate}
                  onSnapshotFromLive={onSnapshotFromLive}
                  snapshotPending={snapshotPending}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}
