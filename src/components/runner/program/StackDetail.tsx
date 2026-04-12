import { useCallback, useMemo } from 'react'
import { ArrowLeft, Plus, SeparatorHorizontal } from 'lucide-react'
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
  onBack,
  onOpenCueForm,
  onAddCue,
  onAddMarker,
  onMarkerRename,
  onMarkerDelete,
}: StackDetailProps) {
  const { data: presets } = useProjectPresetListQuery(projectId)
  const { data: library } = useEffectLibraryQuery()
  const { data: allCues } = useProjectCueListQuery(projectId)
  const [reorderCues] = useReorderCueStackCuesMutation()

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
      <div className="flex items-center h-[42px] px-4 border-b bg-card gap-3 shrink-0">
        <Button variant="outline" size="sm" onClick={onBack} className="font-bold tracking-wider">
          <ArrowLeft className="size-3.5 mr-1.5" />
          Stacks
        </Button>
        <span className="text-[15px] font-semibold text-muted-foreground/60 tracking-wide">
          {stack.name}
        </span>
        <span className="text-[11px] text-muted-foreground/30">
          {standardCount} cues
        </span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onAddCue}>
          <Plus className="size-3.5 mr-1.5" />
          Add Cue
        </Button>
        <Button variant="outline" size="sm" onClick={onAddMarker}>
          <SeparatorHorizontal className="size-3.5 mr-1.5" />
          Separator
        </Button>
      </div>

      {/* Column headers */}
      <div className="flex items-center h-6 px-4 border-b bg-card shrink-0">
        <div className="w-4" />
        <div className="w-11 text-[9px] font-bold tracking-[0.13em] uppercase text-muted-foreground/20 pl-2">
          Q
        </div>
        <div className="flex-1 text-[9px] font-bold tracking-[0.13em] uppercase text-muted-foreground/20">
          Name
        </div>
        <div className="w-20 text-right pr-2 text-[9px] font-bold tracking-[0.13em] uppercase text-muted-foreground/20">
          Fade
        </div>
        <div className="w-9" />
        <div className="w-[120px]" />
        <div className="size-5" />
      </div>

      {/* Cue list */}
      <div className="flex-1 overflow-y-auto">
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
