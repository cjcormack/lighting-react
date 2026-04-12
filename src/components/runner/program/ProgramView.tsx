import { useCallback } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useCreateProjectCueMutation,
  useSaveProjectCueMutation,
} from '@/store/cues'
import {
  useRemoveCueFromCueStackMutation,
} from '@/store/cueStacks'
import type { CueStack } from '@/api/cueStacksApi'
import { StackDetail } from './StackDetail'

interface ProgramViewProps {
  projectId: number
  stacks: CueStack[]
  drillStackId: number | null
  onDrillStack: (id: number | null) => void
  onSwitchToShow: () => void
  onOpenCueForm: (stackId: number, cueId: number) => void
}

export function ProgramView({
  projectId,
  stacks,
  drillStackId,
  onDrillStack,
  onSwitchToShow,
  onOpenCueForm,
}: ProgramViewProps) {
  const [createCue] = useCreateProjectCueMutation()
  const [removeCueFromStack] = useRemoveCueFromCueStackMutation()
  const [saveCue] = useSaveProjectCueMutation()

  const drillStack = drillStackId != null ? stacks.find((s) => s.id === drillStackId) : null

  const handleAddCue = useCallback(async () => {
    if (drillStackId == null) return
    try {
      const result = await createCue({
        projectId,
        name: 'New Cue',
        palette: [],
        updateGlobalPalette: false,
        presetApplications: [],
        adHocEffects: [],
        triggers: [],
        fadeDurationMs: 3000,
        fadeCurve: 'LINEAR',
        cueStackId: drillStackId,
      }).unwrap()
      onOpenCueForm(drillStackId, result.id)
    } catch {
      // Silently fail
    }
  }, [drillStackId, projectId, createCue, onOpenCueForm])

  const handleAddMarker = useCallback(async () => {
    if (drillStackId == null) return
    try {
      await createCue({
        projectId,
        name: 'New Section',
        palette: [],
        updateGlobalPalette: false,
        presetApplications: [],
        adHocEffects: [],
        cueStackId: drillStackId,
      }).unwrap()
    } catch {
      // Silently fail
    }
  }, [drillStackId, projectId, createCue])

  const handleMarkerRename = useCallback(
    (cueId: number, name: string) => {
      saveCue({ projectId, cueId, name, palette: [], updateGlobalPalette: false, presetApplications: [], adHocEffects: [] })
    },
    [projectId, saveCue],
  )

  const handleMarkerDelete = useCallback(
    (cueId: number) => {
      if (drillStackId == null) return
      removeCueFromStack({ projectId, stackId: drillStackId, cueId })
    },
    [drillStackId, projectId, removeCueFromStack],
  )

  if (stacks.length === 0) {
    return (
      <Card className="m-4 p-8 flex flex-col items-center gap-2 text-muted-foreground">
        <p>No cue stacks found.</p>
        <p className="text-sm">Create a cue stack in the FX Cues view first.</p>
      </Card>
    )
  }

  if (drillStack) {
    return (
      <StackDetail
        stack={drillStack}
        projectId={projectId}
        onBack={() => onDrillStack(null)}
        onOpenCueForm={(cueId) => onOpenCueForm(drillStackId!, cueId)}
        onAddCue={handleAddCue}
        onAddMarker={handleAddMarker}
        onMarkerRename={handleMarkerRename}
        onMarkerDelete={handleMarkerDelete}
      />
    )
  }

  // Stack list overview
  const totalCues = stacks.reduce(
    (n, s) => n + s.cues.filter((c) => c.cueType === 'STANDARD').length,
    0,
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center h-12 px-5 border-b bg-card gap-4 shrink-0">
        <span className="text-lg font-semibold text-muted-foreground/70 tracking-wide">
          Cue Stacks
        </span>
        <span className="text-xs text-muted-foreground/40 tracking-wider">
          {stacks.length} stacks &middot; {totalCues} cues
        </span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="font-bold tracking-wider text-green-400 border-green-500/30 bg-green-950/40 hover:bg-green-900/50 hover:text-green-300"
          onClick={onSwitchToShow}
        >
          Ready to run <ArrowRight className="size-3.5 ml-1.5" />
        </Button>
      </div>

      {/* Stack list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
        {stacks.map((stack, idx) => {
          const cueCount = stack.cues.filter((c) => c.cueType === 'STANDARD').length
          return (
            <button
              key={stack.id}
              className="flex items-center w-full gap-3 px-4 py-2.5 bg-card border rounded transition-colors hover:bg-muted/30 hover:border-muted-foreground/20 text-left"
              onClick={() => onDrillStack(stack.id)}
            >
              <span className="w-6 text-center font-mono text-[11px] text-muted-foreground/30 shrink-0">
                {idx + 1}
              </span>
              <span className="flex-1 text-sm font-semibold text-muted-foreground/60">
                {stack.name}
              </span>
              <span className="text-[11px] text-muted-foreground/30 shrink-0">
                {cueCount} cues
              </span>
              {stack.loop && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-1">
                  <RotateCcw className="size-2.5" />
                  Loop
                </Badge>
              )}
              <ArrowRight className="size-4 text-muted-foreground/30 shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
