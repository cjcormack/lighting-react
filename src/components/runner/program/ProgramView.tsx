import { useCallback, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import {
  useCreateProjectCueMutation,
  usePatchProjectCueMutation,
  useProjectCueListQuery,
} from '@/store/cues'
import {
  useRemoveCueFromCueStackMutation,
} from '@/store/cueStacks'
import type { CueStack } from '@/api/cueStacksApi'
import type { ShowDetails } from '@/api/showApi'
import { StackDetail } from './StackDetail'
import { ShowOverview } from './ShowOverview'

/** Find the next available name of the form "{base}", "{base} 2", "{base} 3"… */
function nextAvailableName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base} ${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base} ${Date.now()}`
}

interface ProgramViewProps {
  projectId: number
  stacks: CueStack[]
  drillStackId: number | null
  onDrillStack: (id: number | null) => void
  onOpenCueForm: (stackId: number, cueId: number) => void
  show?: ShowDetails
  activeStackId: number | null
  activeCueId: number | null
  /** Cue currently loaded in the inline edit panel (for highlight). */
  editingCueId?: number | null
}

export function ProgramView({
  projectId,
  stacks,
  drillStackId,
  onDrillStack,
  onOpenCueForm,
  show,
  activeStackId,
  activeCueId,
  editingCueId,
}: ProgramViewProps) {
  const [createCue] = useCreateProjectCueMutation()
  const [removeCueFromStack] = useRemoveCueFromCueStackMutation()
  const [patchCue] = usePatchProjectCueMutation()
  const { data: allCues } = useProjectCueListQuery(projectId)

  const drillStack = drillStackId != null ? stacks.find((s) => s.id === drillStackId) : null

  const existingCueNames = useMemo(
    () => new Set((allCues ?? []).map((c) => c.name)),
    [allCues],
  )

  const handleAddCue = useCallback(async () => {
    if (drillStackId == null) return
    try {
      const result = await createCue({
        projectId,
        name: nextAvailableName('New Cue', existingCueNames),
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
  }, [drillStackId, projectId, createCue, onOpenCueForm, existingCueNames])

  const handleAddMarker = useCallback(async () => {
    if (drillStackId == null) return
    try {
      await createCue({
        projectId,
        name: nextAvailableName('New Separator', existingCueNames),
        palette: [],
        updateGlobalPalette: false,
        presetApplications: [],
        adHocEffects: [],
        cueStackId: drillStackId,
        cueType: 'MARKER',
      }).unwrap()
    } catch {
      // Silently fail
    }
  }, [drillStackId, projectId, createCue, existingCueNames])

  const handleMarkerRename = useCallback(
    (cueId: number, name: string) => {
      // PATCH so we only touch the name; PUT would wipe children and risk
      // reverting the cueType to the NewCue default.
      patchCue({ projectId, cueId, name })
    },
    [projectId, patchCue],
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
        activeCueId={drillStackId === activeStackId ? activeCueId : null}
        editingCueId={editingCueId}
        onBack={() => onDrillStack(null)}
        onOpenCueForm={(cueId) => onOpenCueForm(drillStackId!, cueId)}
        onAddCue={handleAddCue}
        onAddMarker={handleAddMarker}
        onMarkerRename={handleMarkerRename}
        onMarkerDelete={handleMarkerDelete}
      />
    )
  }

  // Show overview — always visible; the show is always present on a project.
  if (show) {
    return (
      <ShowOverview
        projectId={projectId}
        show={show}
        stacks={stacks}
        activeStackId={activeStackId}
        onDrillStack={(id) => onDrillStack(id)}
      />
    )
  }

  return (
    <Card className="m-4 p-4 flex items-center justify-center text-muted-foreground">
      Loading show…
    </Card>
  )
}
