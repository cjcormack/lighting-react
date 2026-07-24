import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { useProjectCueStackListQuery } from '../store/cueStacks'
import {
  useCreateProjectCueMutation,
  useSnapshotCueFromLiveMutation,
} from '../store/cues'
import {
  useProjectProgramStateQuery,
  useActivateProgramMutation,
  useDeactivateProgramMutation,
} from '../store/cueStacks'
import type { Cue } from '../api/cuesApi'
import { buildCueInput } from '../lib/cueUtils'
import { useFxStateQuery, tapTempo } from '../store/fx'
import { useShowTransport } from '../hooks/useShowTransport'
import { ShowHeader } from '../components/ShowHeader'
import { ShowBar } from '../components/ShowBar'
import { ProgramView } from '../components/runner/program/ProgramView'

export function ProgramRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/program`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return null
}

/**
 * Back-compat for the removed FX Cues view. `/cues`, `/cues/all`, `/cues/standalone` →
 * `/program`; `/cues/stacks/:stackId` → `/program/stacks/:stackId`.
 */
export function CuesLegacyRedirect() {
  const { projectId, stackId } = useParams()
  const target = stackId
    ? `/projects/${projectId}/program/stacks/${stackId}`
    : `/projects/${projectId}/program`
  return <Navigate to={target} replace />
}

export function ProgramPage() {
  const { projectId, stackId } = useParams()
  const projectIdNum = Number(projectId)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: stacks, isLoading: stacksLoading, isFetching: stacksFetching } =
    useProjectCueStackListQuery(projectIdNum)
  const { data: programState } = useProjectProgramStateQuery(projectIdNum)

  const isShowActive = programState?.activeStackId != null
  const activeStackId = programState?.activeStackId ?? null
  const activeStack = useMemo(
    () => (activeStackId != null ? stacks?.find((s) => s.id === activeStackId) : undefined),
    [stacks, activeStackId],
  )

  // ── URL-derived navigation state ──
  // The drilled stack lives in the path (`/program/stacks/:stackId`); the inline-expanded cue is a
  // transient `?cue=` modifier. This mirrors how the (removed) FX Cues view derived its view from
  // the URL, and makes both deep-linkable / refresh-stable.
  const drillStackId = stackId ? Number(stackId) : null
  const drillStack = useMemo(
    () => (drillStackId != null ? stacks?.find((s) => s.id === drillStackId) : null),
    [stacks, drillStackId],
  )
  const cueParam = searchParams.get('cue')
  const expandedCueId = cueParam ? Number(cueParam) : null

  // Row 3 (show bar) — functional transport in the Program view (no keyboard shortcuts). Shown at
  // every width (it collapses responsively) whenever the show is running.
  const { data: fxState } = useFxStateQuery()
  const transport = useShowTransport({ projectId: projectIdNum, activeStackId, stacks })
  const [dbo, setDbo] = useState(false)
  const barActiveCue = transport.activeStack?.cues.find((c) => c.id === transport.activeCueId) ?? null
  const barStandbyCue =
    transport.activeStack?.cues.find((c) => c.id === transport.standbyCueId) ?? null

  const [createCue] = useCreateProjectCueMutation()
  const [snapshotCueFromLive, { isLoading: snapshotPending }] = useSnapshotCueFromLiveMutation()
  const [activateShow] = useActivateProgramMutation()
  const [deactivateShow] = useDeactivateProgramMutation()

  const [snapshotConfirmOpen, setSnapshotConfirmOpen] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [snapshotCueId, setSnapshotCueId] = useState<number | null>(null)

  // Set/clear the `?cue=` modifier without touching the stack path (replace: no history spam).
  const setExpandedCueId = useCallback(
    (cueId: number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (cueId == null) next.delete('cue')
          else next.set('cue', String(cueId))
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const handleDrillStack = useCallback(
    (id: number | null) => {
      if (id == null) navigate(`/projects/${projectIdNum}/program`)
      else navigate(`/projects/${projectIdNum}/program/stacks/${id}`)
    },
    [navigate, projectIdNum],
  )

  const handleBreadcrumbCurrentPageClick = useCallback(() => {
    navigate(`/projects/${projectIdNum}/program`)
  }, [navigate, projectIdNum])

  const initialDrillDoneRef = useRef(false)

  // Start/Stop the show in place — the header flips to the running state and the
  // operator stays in Program (the view switcher is one click to Run).
  const runnableStackCount = stacks?.filter((s) => s.type === 'STACK').length ?? 0
  const canStart = !isShowActive && runnableStackCount > 0

  const handleActivateShow = useCallback(() => {
    activateShow({ projectId: projectIdNum })
      .unwrap()
      .catch(() => {
        // Silently fail
      })
  }, [activateShow, projectIdNum])

  const handleStopShow = useCallback(async () => {
    await deactivateShow({ projectId: projectIdNum }).unwrap()
  }, [deactivateShow, projectIdNum])

  // Auto-expand the active/standby cue when first drilling into a stack
  // (matches today's behaviour where the editor would auto-open).
  useEffect(() => {
    if (drillStackId == null) return
    if (expandedCueId != null) return
    if (drillStackId !== activeStackId) return
    const target = activeStack?.activeCueId
    if (target != null) setExpandedCueId(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillStackId])

  const handleDuplicate = useCallback(
    async (cue: Cue) => {
      if (drillStackId == null) return
      try {
        const input = buildCueInput(cue)
        input.name = cue.name + ' (copy)'
        input.cueNumber = null
        input.cueStackId = drillStackId
        const result = await createCue({ projectId: projectIdNum, ...input }).unwrap()
        setExpandedCueId(result.id)
      } catch {
        // Silently fail
      }
    },
    [drillStackId, projectIdNum, createCue],
  )

  const handleSnapshotFromLiveRequest = useCallback((cueId: number) => {
    setSnapshotCueId(cueId)
    setSnapshotError(null)
    setSnapshotConfirmOpen(true)
  }, [])

  const handleSnapshotFromLiveConfirm = useCallback(async () => {
    if (snapshotCueId == null) return
    try {
      await snapshotCueFromLive({
        projectId: projectIdNum,
        cueId: snapshotCueId,
      }).unwrap()
      setSnapshotConfirmOpen(false)
      setSnapshotCueId(null)
    } catch (err) {
      setSnapshotError(
        err instanceof Error ? err.message : 'Failed to capture live state',
      )
    }
  }, [snapshotCueId, projectIdNum, snapshotCueFromLive])

  // ── Deep-link normalizer + auto-drill ──
  // - Legacy `/program?stack=X&cue=Y` links (from Run / Prompt Book "Edit Cue") are rewritten to
  //   the new path scheme `/program/stacks/X?cue=Y`.
  // - Otherwise, when the show is running, drill into the active stack on first mount so the
  //   operator lands where the action is.
  useEffect(() => {
    if (initialDrillDoneRef.current) return
    if (!stacks) return

    const legacyStack = searchParams.get('stack')
    if (legacyStack && drillStackId == null) {
      initialDrillDoneRef.current = true
      const sid = Number(legacyStack)
      if (Number.isFinite(sid) && stacks.some((s) => s.id === sid)) {
        const cue = searchParams.get('cue')
        navigate(
          `/projects/${projectIdNum}/program/stacks/${sid}${cue ? `?cue=${cue}` : ''}`,
          { replace: true },
        )
      } else {
        navigate(`/projects/${projectIdNum}/program`, { replace: true })
      }
      return
    }

    if (drillStackId == null && isShowActive && activeStackId != null) {
      initialDrillDoneRef.current = true
      navigate(`/projects/${projectIdNum}/program/stacks/${activeStackId}`, { replace: true })
    }
  }, [stacks, isShowActive, activeStackId, drillStackId, searchParams, navigate, projectIdNum])

  // Redirect away from a stale/unknown drilled stack (e.g. after deletion). Wait until the list has
  // settled — during the refetch that follows creating a stack, `stacks` briefly lacks the new
  // stack, and redirecting then would bounce the operator straight back out of it.
  useEffect(() => {
    if (
      drillStackId != null &&
      stacks &&
      !stacksFetching &&
      !stacks.some((s) => s.id === drillStackId)
    ) {
      navigate(`/projects/${projectIdNum}/program`, { replace: true })
    }
  }, [drillStackId, stacks, stacksFetching, navigate, projectIdNum])

  // Loading / redirect guards
  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    return <Navigate to={`/projects/${currentProject.id}/program`} replace />
  }

  if (projectLoading || currentLoading || stacksLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!project) {
    return (
      <Card className="m-4 p-4">
        <p className="text-muted-foreground">Project not found</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ShowHeader
        view="program"
        projectId={projectIdNum}
        projectName={project.name}
        extra={drillStack ? [drillStack.name] : undefined}
        onCurrentPageClick={handleBreadcrumbCurrentPageClick}
        isShowActive={isShowActive}
        canStart={canStart}
        onStart={handleActivateShow}
        onStop={handleStopShow}
      />

      {isShowActive && (
        <ShowBar
          stackName={transport.activeStack?.name ?? null}
          dbo={dbo}
          onDbo={() => setDbo((d) => !d)}
          bpm={fxState?.bpm ?? null}
          onTap={tapTempo}
          activeNumber={barActiveCue?.cueNumber ? `Q${barActiveCue.cueNumber}` : null}
          activeName={barActiveCue?.name ?? null}
          standbyNumber={barStandbyCue?.cueNumber ? `Q${barStandbyCue.cueNumber}` : null}
          standbyName={barStandbyCue?.name ?? null}
          fadeRemainMs={transport.fadeRemainMs}
          onGo={transport.go}
          onBack={transport.back}
          goDisabled={transport.goDisabled}
        />
      )}

      {(
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <ProgramView
              projectId={projectIdNum}
              stacks={stacks ?? []}
              drillStackId={drillStackId}
              onDrillStack={handleDrillStack}
              activeStackId={activeStackId}
              // Server-tracked activeCueId reflects what's on stage, not the
              // transient fade cursor — so the marker stays stable during fades.
              activeCueId={activeStack?.activeCueId ?? null}
              expandedCueId={expandedCueId}
              onExpandedCueChange={setExpandedCueId}
              onDuplicate={handleDuplicate}
              onSnapshotFromLive={handleSnapshotFromLiveRequest}
              snapshotPending={snapshotPending}
            />
          </div>
        </div>
      )}

      <Dialog
        open={snapshotConfirmOpen}
        onOpenChange={(open) => {
          if (!snapshotPending) setSnapshotConfirmOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grab live state?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Replace this cue&apos;s property assignments with the current stage
            state. Existing fixture assignments on the cue will be overwritten.
          </DialogDescription>
          {snapshotError && (
            <p className="text-sm text-destructive">{snapshotError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSnapshotConfirmOpen(false)}
              disabled={snapshotPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSnapshotFromLiveConfirm} disabled={snapshotPending}>
              {snapshotPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Capturing...
                </>
              ) : (
                'Grab live state'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
