import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowRight, Loader2, Play } from 'lucide-react'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { useProjectCueStackListQuery } from '../store/cueStacks'
import {
  useCreateProjectCueMutation,
  useSnapshotCueFromLiveMutation,
} from '../store/cues'
import {
  useProjectShowQuery,
  useActivateShowMutation,
} from '../store/show'
import type { Cue } from '../api/cuesApi'
import { buildCueInput } from '../lib/cueUtils'
import { Breadcrumbs } from '../components/Breadcrumbs'
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

export function ProgramPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: stacks, isLoading: stacksLoading } = useProjectCueStackListQuery(projectIdNum)
  const { data: show } = useProjectShowQuery(projectIdNum)

  const isShowActive = show?.activeEntryId != null

  const activeEntry = useMemo(
    () => show?.entries.find((e) => e.id === show.activeEntryId),
    [show],
  )
  const activeStackId = activeEntry?.cueStackId ?? null
  const activeStack = useMemo(
    () => (activeStackId != null ? stacks?.find((s) => s.id === activeStackId) : undefined),
    [stacks, activeStackId],
  )

  const [drillStackId, setDrillStackId] = useState<number | null>(null)
  const drillStack = useMemo(
    () => (drillStackId != null ? stacks?.find((s) => s.id === drillStackId) : null),
    [stacks, drillStackId],
  )

  /** Inline-expanded cue card. One at a time — opening another collapses any
   *  existing one (and ends its `cueEdit.*` session inside `CueCardEditor`). */
  const [expandedCueId, setExpandedCueId] = useState<number | null>(null)

  const [createCue] = useCreateProjectCueMutation()
  const [snapshotCueFromLive, { isLoading: snapshotPending }] = useSnapshotCueFromLiveMutation()
  const [activateShow] = useActivateShowMutation()

  const [snapshotConfirmOpen, setSnapshotConfirmOpen] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [snapshotCueId, setSnapshotCueId] = useState<number | null>(null)

  const handleDrillStack = useCallback((id: number | null) => {
    setDrillStackId(id)
    if (id == null) setExpandedCueId(null)
  }, [])

  const handleBreadcrumbCurrentPageClick = useCallback(() => {
    setDrillStackId(null)
    setExpandedCueId(null)
  }, [])

  const initialDrillDoneRef = useRef(false)

  // Start Show → activate, then jump to the runner
  const stackEntryCount = show?.entries.filter((e) => e.entryType === 'STACK').length ?? 0
  const canStart = !isShowActive && stackEntryCount > 0

  const handleActivateShow = useCallback(() => {
    activateShow({ projectId: projectIdNum })
      .unwrap()
      .then(() => {
        navigate(`/projects/${projectIdNum}/run`)
      })
      .catch(() => {
        // Silently fail
      })
  }, [activateShow, projectIdNum, navigate])

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

  const handleGoToRun = useCallback(() => {
    navigate(`/projects/${projectIdNum}/run`)
  }, [navigate, projectIdNum])

  // ── Auto-drill / deep-link ──
  // - If the URL has ?stack=&cue= (typically from Run's "Edit Cue" button),
  //   drill into that stack and auto-expand the cue.
  // - Otherwise, when the show is running, drill into the active stack on
  //   first mount so the operator lands where the action is.
  useEffect(() => {
    if (initialDrillDoneRef.current) return
    if (!stacks) return

    const stackParam = searchParams.get('stack')
    const cueParam = searchParams.get('cue')
    if (stackParam) {
      const stackId = Number(stackParam)
      if (Number.isFinite(stackId) && stacks.some((s) => s.id === stackId)) {
        setDrillStackId(stackId)
        if (cueParam) {
          const cueId = Number(cueParam)
          if (Number.isFinite(cueId)) {
            setExpandedCueId(cueId)
          }
        }
      }
      // Strip the params so a refresh doesn't re-open the card.
      setSearchParams({}, { replace: true })
      initialDrillDoneRef.current = true
      return
    }

    if (isShowActive && activeStackId != null) {
      setDrillStackId(activeStackId)
      initialDrillDoneRef.current = true
    }
  }, [stacks, isShowActive, activeStackId, searchParams, setSearchParams])

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
      {/* Header row */}
      <div className="flex items-center p-4 gap-3">
        <div className="flex-1 min-w-0">
          <Breadcrumbs
            projectName={project.name}
            currentPage="Program"
            extra={drillStack ? [drillStack.name] : undefined}
            onCurrentPageClick={handleBreadcrumbCurrentPageClick}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isShowActive ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" onClick={handleGoToRun} aria-label="Go to Run">
                    <span className="hidden min-[420px]:inline">Go to Run</span>
                    <ArrowRight className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Go to Run</TooltipContent>
              </Tooltip>
              <span
                className="size-3 rounded-full bg-green-500 ml-1"
                aria-label="Show is running"
                title="Show is running"
              />
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={handleActivateShow}
                  disabled={!canStart}
                  aria-label="Start show"
                >
                  <Play className="size-3.5" />
                  <span className="hidden min-[420px]:inline">Start Show</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Start show</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {!stacks || stacks.length === 0 ? (
        <Card className="m-4 p-8 flex flex-col items-center gap-2 text-muted-foreground">
          <p>No cue stacks found.</p>
          <p className="text-sm">Create a cue stack in the FX Cues view first.</p>
        </Card>
      ) : (
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0">
            <ProgramView
              projectId={projectIdNum}
              stacks={stacks}
              drillStackId={drillStackId}
              onDrillStack={handleDrillStack}
              show={show}
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
