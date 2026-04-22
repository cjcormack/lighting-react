import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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
import { useRemoveCueFromCueStackMutation } from '../store/cueStacks'
import {
  useSaveProjectCueMutation,
  useLazyProjectCueQuery,
  useCreateProjectCueMutation,
  useSnapshotCueFromLiveMutation,
} from '../store/cues'
import {
  useProjectShowQuery,
  useActivateShowMutation,
} from '../store/show'
import type { CueInput, Cue } from '../api/cuesApi'
import { buildCueInput } from '../lib/cueUtils'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { CueEditor } from '../components/cues/editor/CueEditor'
import { ProgramView } from '../components/runner/program/ProgramView'
import { useMediaQuery, XL_BREAKPOINT } from '../hooks/useMediaQuery'

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

  // Derive active entry from server state — Program doesn't need a local mirror;
  // it only uses this to highlight the active stack in ShowOverview / mark the
  // active cue in StackDetail.
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

  const isWideViewport = useMediaQuery(XL_BREAKPOINT)
  const showInlineCueEditor = isWideViewport && drillStackId != null

  const [cueEditorOpen, setCueEditorOpen] = useState(false)
  const [cueEditorCueId, setCueEditorCueId] = useState<number | null>(null)
  const [cueEditorStackId, setCueEditorStackId] = useState<number | null>(null)
  const [cueEditorCue, setCueEditorCue] = useState<Cue | null>(null)

  const [removeCueFromStack] = useRemoveCueFromCueStackMutation()
  const [saveCue] = useSaveProjectCueMutation()
  const [createCue] = useCreateProjectCueMutation()
  const [fetchCue] = useLazyProjectCueQuery()
  const [snapshotCueFromLive, { isLoading: snapshotPending }] = useSnapshotCueFromLiveMutation()
  const [activateShow] = useActivateShowMutation()

  const [snapshotConfirmOpen, setSnapshotConfirmOpen] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)

  const handleDrillStack = useCallback((id: number | null) => {
    setDrillStackId(id)
    if (id == null) setCueEditorOpen(false)
  }, [])

  const handleBreadcrumbCurrentPageClick = useCallback(() => {
    setDrillStackId(null)
    setCueEditorOpen(false)
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
        // Silently fail — mutation surfaces its own error state
      })
  }, [activateShow, projectIdNum, navigate])

  const openCueEditor = useCallback(
    async (stackId: number, cueId: number) => {
      try {
        const { data: fullCue } = await fetchCue({ projectId: projectIdNum, cueId }, true)
        if (fullCue) {
          setCueEditorCue(fullCue)
          setCueEditorCueId(cueId)
          setCueEditorStackId(stackId)
          setCueEditorOpen(true)
        }
      } catch {
        // Silently fail
      }
    },
    [fetchCue, projectIdNum],
  )

  // Auto-open the first (or active) cue when drilling into a stack on wide viewports.
  // Skips when the deep-link effect already initiated a cue load for this stack.
  useEffect(() => {
    if (!showInlineCueEditor || drillStackId == null) return
    if (cueEditorStackId === drillStackId) return
    const stack = stacks?.find((s) => s.id === drillStackId)
    if (!stack || stack.cues.length === 0) return
    const targetCueId = stack.activeCueId ?? stack.cues[0]?.id
    if (targetCueId != null) {
      openCueEditor(drillStackId, targetCueId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInlineCueEditor, drillStackId])

  const handleCueEditorSave = useCallback(
    async (input: CueInput) => {
      if (cueEditorCueId == null) return
      await saveCue({ projectId: projectIdNum, cueId: cueEditorCueId, ...input }).unwrap()
    },
    [cueEditorCueId, saveCue, projectIdNum],
  )

  const handleCueEditorClose = useCallback((open: boolean) => {
    setCueEditorOpen(open)
  }, [])

  const handleDuplicate = useCallback(async () => {
    if (!cueEditorCue || cueEditorStackId == null) return
    try {
      const input = buildCueInput(cueEditorCue)
      input.name = cueEditorCue.name + ' (copy)'
      input.cueNumber = null
      input.cueStackId = cueEditorStackId
      const result = await createCue({ projectId: projectIdNum, ...input }).unwrap()
      setCueEditorOpen(false)
      setTimeout(() => openCueEditor(cueEditorStackId!, result.id), 200)
    } catch {
      // Silently fail
    }
  }, [cueEditorCue, cueEditorStackId, projectIdNum, createCue, openCueEditor])

  const handleRemoveFromStack = useCallback(() => {
    if (cueEditorCueId == null || cueEditorStackId == null) return
    removeCueFromStack({ projectId: projectIdNum, stackId: cueEditorStackId, cueId: cueEditorCueId })
    setCueEditorOpen(false)
  }, [cueEditorCueId, cueEditorStackId, projectIdNum, removeCueFromStack])

  const handleSnapshotFromLiveRequest = useCallback(() => {
    if (cueEditorCueId == null) return
    setSnapshotError(null)
    setSnapshotConfirmOpen(true)
  }, [cueEditorCueId])

  const handleSnapshotFromLiveConfirm = useCallback(async () => {
    if (cueEditorCueId == null) return
    try {
      const updated = await snapshotCueFromLive({
        projectId: projectIdNum,
        cueId: cueEditorCueId,
      }).unwrap()
      setCueEditorCue(updated)
      setSnapshotConfirmOpen(false)
    } catch (err) {
      setSnapshotError(
        err instanceof Error ? err.message : 'Failed to capture live state',
      )
    }
  }, [cueEditorCueId, projectIdNum, snapshotCueFromLive])

  const handleGoToRun = useCallback(() => {
    navigate(`/projects/${projectIdNum}/run`)
  }, [navigate, projectIdNum])

  // ── Auto-drill / deep-link ──
  // - If the URL has ?stack=&cue= (typically from Run's "Edit Cue" button),
  //   drill into that stack and open the cue editor.
  // - Otherwise, when the show is running, drill into the active stack on
  //   first mount so the operator lands where the action is. The ref ensures
  //   we only auto-drill once per mount — the user can click "Stacks" / the
  //   breadcrumb to escape to the overview without us re-drilling them.
  useEffect(() => {
    if (initialDrillDoneRef.current) return
    if (!stacks) return // wait for data

    const stackParam = searchParams.get('stack')
    const cueParam = searchParams.get('cue')
    if (stackParam) {
      const stackId = Number(stackParam)
      if (Number.isFinite(stackId) && stacks.some((s) => s.id === stackId)) {
        setDrillStackId(stackId)
        if (cueParam) {
          const cueId = Number(cueParam)
          if (Number.isFinite(cueId)) {
            // Set stackId synchronously so the auto-open effect's guard
            // sees it and skips — otherwise it races with this async fetch.
            setCueEditorStackId(stackId)
            openCueEditor(stackId, cueId)
          }
        }
      }
      // Strip the params so a refresh doesn't re-open the sheet.
      setSearchParams({}, { replace: true })
      initialDrillDoneRef.current = true
      return
    }

    if (isShowActive && activeStackId != null) {
      setDrillStackId(activeStackId)
      initialDrillDoneRef.current = true
    }
  }, [stacks, isShowActive, activeStackId, searchParams, setSearchParams, openCueEditor])

  const cueEditorProps = {
    open: cueEditorOpen,
    onOpenChange: handleCueEditorClose,
    cue: cueEditorCue,
    projectId: projectIdNum,
    onSave: handleCueEditorSave,
    isInStack: true as const,
    defaultEditMode: 'live' as const,
    onDuplicate: handleDuplicate,
    onRemoveFromStack: handleRemoveFromStack,
    onSnapshotFromLive: handleSnapshotFromLiveRequest,
    snapshotPending,
  }

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
      {/* Header row — always one line; button labels hide at narrow widths
          so the row never has to wrap. Tooltip provides the affordance when
          the label is hidden. */}
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
              onOpenCueEditor={openCueEditor}
              show={show}
              activeStackId={activeStackId}
              // Server-tracked activeCueId reflects what's on stage, not the
              // transient fade cursor — so the marker stays stable during fades.
              activeCueId={activeStack?.activeCueId ?? null}
              editingCueId={showInlineCueEditor ? cueEditorCueId : null}
            />
          </div>

          {/* Inline CueEditor panel (wide viewports + drilled into a stack) */}
          {showInlineCueEditor && (
            <div className="w-[400px] shrink-0 border-l flex flex-col overflow-hidden bg-background">
              {cueEditorCue ? (
                <CueEditor {...cueEditorProps} mode="inline" />
              ) : (
                <div className="flex-1 flex items-center justify-center p-4">
                  <p className="text-sm text-muted-foreground">Select a cue to edit</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CueEditor sheet (narrow viewports only) */}
      {!showInlineCueEditor && <CueEditor {...cueEditorProps} mode="sheet" />}

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
