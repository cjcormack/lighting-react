import { memo, useCallback, useMemo } from 'react'
import {
  useCreateProjectCueMutation,
  useDeleteProjectCueMutation,
  usePatchProjectCueMutation,
  useProjectCueListQuery,
} from '@/store/cues'
import type { CueStack } from '@/api/cueStacksApi'
import type { Cue } from '@/api/cuesApi'
import { StackDetail } from './StackDetail'
import { ShowOverview } from './ShowOverview'
import { nextAvailableName } from '@/lib/cueUtils'

interface ProgramViewProps {
  projectId: number
  stacks: CueStack[]
  drillStackId: number | null
  onDrillStack: (id: number | null) => void
  activeStackId: number | null
  activeCueId: number | null
  /** Cue id whose card is currently expanded inline. */
  expandedCueId: number | null
  onExpandedCueChange: (cueId: number | null) => void
  onDuplicate?: (cue: Cue) => void
  onSnapshotFromLive?: (cueId: number) => Promise<void> | void
  snapshotPending?: boolean
}

// Memoized: ProgramPage now subscribes to the runner slice (via useShowTransport for the
// Row 3 show bar), so it re-renders on every fade frame. Its props are stable during a fade
// (activeCueId is the server cursor, not the optimistic fade cursor), so memo keeps the whole
// editor subtree from reconciling ~60x/sec while a cue fades.
export const ProgramView = memo(function ProgramView({
  projectId,
  stacks,
  drillStackId,
  onDrillStack,
  activeStackId,
  activeCueId,
  expandedCueId,
  onExpandedCueChange,
  onDuplicate,
  onSnapshotFromLive,
  snapshotPending,
}: ProgramViewProps) {
  const [createCue] = useCreateProjectCueMutation()
  const [deleteCue] = useDeleteProjectCueMutation()
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
      onExpandedCueChange(result.id)
    } catch {
      // Silently fail
    }
  }, [drillStackId, projectId, createCue, existingCueNames, onExpandedCueChange])

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
      // In-stack separators are just MARKER cues — deleting one removes the cue.
      deleteCue({ projectId, cueId })
    },
    [projectId, deleteCue],
  )

  if (drillStack) {
    return (
      <StackDetail
        stack={drillStack}
        projectId={projectId}
        activeCueId={drillStackId === activeStackId ? activeCueId : null}
        expandedCueId={expandedCueId}
        onExpandedCueChange={onExpandedCueChange}
        onBack={() => onDrillStack(null)}
        onAddCue={handleAddCue}
        onAddMarker={handleAddMarker}
        onMarkerRename={handleMarkerRename}
        onMarkerDelete={handleMarkerDelete}
        onDuplicate={onDuplicate}
        onSnapshotFromLive={onSnapshotFromLive}
        snapshotPending={snapshotPending}
      />
    )
  }

  // Overview — the project's ordered stacks + separators.
  return (
    <ShowOverview
      projectId={projectId}
      stacks={stacks}
      activeStackId={activeStackId}
      onDrillStack={(id) => onDrillStack(id)}
    />
  )
})
