import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, Plus, SeparatorHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { useProjectPresetListQuery } from '@/store/fxPresets'
import { useEffectLibraryQuery } from '@/store/fixtureFx'
import { useProjectCueListQuery } from '@/store/cues'
import type { CueStack } from '@/api/cueStacksApi'
import type { Cue } from '@/api/cuesApi'
import { ProgramCueRow } from './ProgramCueRow'
import { ProgramMarkerRow } from './ProgramMarkerRow'

interface StackDetailProps {
  stack: CueStack
  projectId: number
  activeCueId: number | null
  /** Cue currently loaded in the inline edit panel (for highlight). */
  editingCueId?: number | null
  /** Cue queued to fire on the next GO. Only meaningful when drilled into the active stack. */
  standbyCueId?: number | null
  onBack: () => void
  onOpenCueForm: (cueId: number) => void
  onAddCue: () => void
  onAddMarker: () => void
  onMarkerRename: (cueId: number, name: string) => void
  onMarkerDelete: (cueId: number) => void
}

export function StackDetail({
  stack,
  projectId,
  activeCueId,
  editingCueId,
  standbyCueId,
  onBack,
  onOpenCueForm,
  onAddCue,
  onAddMarker,
  onMarkerRename,
  onMarkerDelete,
}: StackDetailProps) {
  const isWide = useMediaQuery(SM_BREAKPOINT)
  const { data: presets } = useProjectPresetListQuery(projectId)
  const { data: library } = useEffectLibraryQuery()
  const { data: allCues } = useProjectCueListQuery(projectId)
  const [reorderCues] = useReorderCueStackCuesMutation()

  // Scroll the active cue into view when drilling in or when the active cue
  // changes for this stack — saves the operator from scrolling to find
  // what's currently on stage. Uses 'nearest' to avoid unnecessary motion.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (activeCueId == null || !listRef.current) return
    const row = listRef.current.querySelector(`[data-cue-row="${activeCueId}"]`)
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [stack.id, activeCueId])

  // Build a map of full cue data for expandable rows
  const cueMap = useMemo(() => {
    if (!allCues) return new Map<number, Cue>()
    return new Map(allCues.filter((c) => c.cueStackId === stack.id).map((c) => [c.id, c]))
  }, [allCues, stack.id])

  const standardCount = stack.cues.filter((c) => c.cueType === 'STANDARD').length

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

      {/* Column headers */}
      <div className="flex items-center h-10 px-4 border-b shrink-0">
        <div className="w-8 px-2" />
        {isWide && <div className="w-8" />}
        <div className="w-14 px-2 text-sm font-medium text-foreground">
          Q
        </div>
        <div className="flex-1 px-2 text-sm font-medium text-foreground">
          Name
        </div>
        {isWide && (
          <>
            <div className="w-24 text-right px-2 text-sm font-medium text-foreground">
              Fade
            </div>
            <div className="w-12 px-2" />
            <div className="px-2" />
            <div className="w-8" />
          </>
        )}
      </div>

      {/* Cue list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
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
                  fullCue={cueMap.get(cue.id)}
                  projectId={projectId}
                  presets={presets}
                  library={library}
                  isActive={cue.id === activeCueId}
                  isStandby={cue.id === standbyCueId}
                  isEditing={cue.id === editingCueId}
                  onOpenCueForm={() => onOpenCueForm(cue.id)}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}
