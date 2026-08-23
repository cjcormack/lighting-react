import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Navigate, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { useProjectCueStackListQuery } from '../store/cueStacks'
import { useCreateProjectCueMutation } from '../store/cues'
import {
  useProjectProgramStateQuery,
  useActivateProgramMutation,
  useDeactivateProgramMutation,
} from '../store/cueStacks'
import type { Cue } from '../api/cuesApi'
import { buildCueInput } from '../lib/cueUtils'
import { useShowBarProps } from '../hooks/useShowBarProps'
import { ShowHeader } from '../components/ShowHeader'
import { ShowBar } from '../components/ShowBar'
import { ProgramView } from '../components/runner/program/ProgramView'
import { RecordSheet } from '../components/programmer/RecordSheet'
import { useInclude } from '../components/programmer/useInclude'
import type { CueStack } from '../api/cueStacksApi'

/** The cue's display name for the Record sheet's header, or undefined if it has vanished. */
function cueNameFor(stacks: CueStack[] | undefined, cueId: number): string | undefined {
  for (const stack of stacks ?? []) {
    const cue = stack.cues?.find((c) => c.id === cueId)
    if (cue) return cue.name
  }
  return undefined
}

export function ShowRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/show`, { replace: true })
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
 * `/show`; `/cues/stacks/:stackId` → `/show/stacks/:stackId`.
 */
export function CuesLegacyRedirect() {
  const { projectId, stackId } = useParams()
  const target = stackId
    ? `/projects/${projectId}/show/stacks/${stackId}`
    : `/projects/${projectId}/show`
  return <Navigate to={target} replace />
}

export function ShowPage() {
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
  // The drilled stack lives in the path (`/show/stacks/:stackId`); the inline-expanded cue is a
  // transient `?cue=` modifier. This mirrors how the (removed) FX Cues view derived its view from
  // the URL, and makes both deep-linkable / refresh-stable.
  const drillStackId = stackId ? Number(stackId) : null
  const drillStack = useMemo(
    () => (drillStackId != null ? stacks?.find((s) => s.id === drillStackId) : null),
    [stacks, drillStackId],
  )
  const cueParam = searchParams.get('cue')
  const expandedCueId = cueParam ? Number(cueParam) : null

  // Row 3 (show bar) — a functional transport here, without Run's keyboard shortcuts. Shown at every
  // width (it collapses responsively) whenever the show is running. Shared with the Programmer view,
  // which mounts the same bar from the same wiring.
  const { showBarProps } = useShowBarProps(projectIdNum)

  const [createCue] = useCreateProjectCueMutation()
  const [activateShow] = useActivateProgramMutation()
  const [deactivateShow] = useDeactivateProgramMutation()

  // Record replaces the old "Grab live state" button. Grab-live is still reachable — it is
  // `source: 'STAGE_SNAPSHOT'` in the Record sheet — but it is no longer the only way to get
  // the stage into a cue, and it was the lossy one.
  const { includeCue, isLoading: includePending } = useInclude(projectIdNum)
  const [recordCueId, setRecordCueId] = useState<number | null>(null)

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
      if (id == null) navigate(`/projects/${projectIdNum}/show`)
      else navigate(`/projects/${projectIdNum}/show/stacks/${id}`)
    },
    [navigate, projectIdNum],
  )

  const handleBreadcrumbCurrentPageClick = useCallback(() => {
    navigate(`/projects/${projectIdNum}/show`)
  }, [navigate, projectIdNum])

  const initialDrillDoneRef = useRef(false)

  // Start/Stop the show in place — the header flips to the running state and the operator stays
  // on Show (the view switcher is one click to Run).
  const runnableStackCount = stacks?.filter((s) => s.type === 'STACK').length ?? 0
  const canStart = !isShowActive && runnableStackCount > 0

  const handleActivateShow = useCallback(() => {
    activateShow({ projectId: projectIdNum })
      .unwrap()
      .catch(() => {
        // Reported by errorToastMiddleware; caught here only to stop the unhandled rejection.
      })
  }, [activateShow, projectIdNum])

  const handleStopShow = useCallback(async () => {
    await deactivateShow({ projectId: projectIdNum })
      .unwrap()
      .catch(() => {
        // Reported by errorToastMiddleware; caught here only to stop the unhandled rejection.
      })
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
        // Reported by errorToastMiddleware; caught here only to stop the unhandled rejection.
      }
    },
    [drillStackId, projectIdNum, createCue, setExpandedCueId],
  )

  const handleRecordInto = useCallback((cueId: number) => setRecordCueId(cueId), [])

  const handleIncludeCue = useCallback((cueId: number) => void includeCue(cueId), [includeCue])

  // ── Deep-link normalizer + auto-drill ──
  // - Legacy `/show?stack=X&cue=Y` links (from Run / Prompt Book "Edit Cue") are rewritten to
  //   the new path scheme `/show/stacks/X?cue=Y`.
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
          `/projects/${projectIdNum}/show/stacks/${sid}${cue ? `?cue=${cue}` : ''}`,
          { replace: true },
        )
      } else {
        navigate(`/projects/${projectIdNum}/show`, { replace: true })
      }
      return
    }

    if (drillStackId == null && isShowActive && activeStackId != null) {
      initialDrillDoneRef.current = true
      navigate(`/projects/${projectIdNum}/show/stacks/${activeStackId}`, { replace: true })
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
      navigate(`/projects/${projectIdNum}/show`, { replace: true })
    }
  }, [drillStackId, stacks, stacksFetching, navigate, projectIdNum])

  // Loading / redirect guards
  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    return <Navigate to={`/projects/${currentProject.id}/show`} replace />
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
        view="show"
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
        <ShowBar {...showBarProps} />
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
              onRecordInto={handleRecordInto}
              onIncludeCue={handleIncludeCue}
              includePending={includePending}
            />
          </div>
        </div>
      )}

      {recordCueId != null && (
        <RecordSheet
          open
          onOpenChange={(open) => !open && setRecordCueId(null)}
          projectId={projectIdNum}
          targetCueId={recordCueId}
          targetCueName={cueNameFor(stacks, recordCueId)}
        />
      )}
    </div>
  )
}
