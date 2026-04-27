import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Loader2, RotateCcw, Play, Pencil, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import {
  useProjectCueStackListQuery,
  useAdvanceCueStackMutation,
  useActivateCueStackMutation,
  useDeactivateCueStackMutation,
  useSortCueStackByCueNumberMutation,
  useGoToCueInStackMutation,
} from '../store/cueStacks'
import {
  useProjectShowQuery,
  useActivateShowMutation,
  useDeactivateShowMutation,
  useAdvanceShowMutation,
  useGoToShowEntryMutation,
} from '../store/show'
import type { ShowEntryDto } from '../api/showApi'
import { useFxStateQuery } from '../store/fx'
import { lightingApi } from '../api/lightingApi'
import {
  go,
  back,
  resetStack,
  setStandby,
  selectStackRunner,
} from '../store/runnerSlice'
import { useRunnerAnimation } from '../hooks/useRunnerAnimation'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { MarkerRow } from '../components/runner/MarkerRow'
import {
  OutOfOrderBanner,
  detectOutOfOrder,
} from '../components/runner/OutOfOrderBanner'
import { RunToolbar } from '../components/runner/run/RunToolbar'
import { RunCueCard } from '../components/runner/run/RunCueCard'
import {
  RunMobile,
  type RunnerDisplayState,
} from '../components/runner/run/RunMobile'
import { useNarrowContainer } from '../hooks/useNarrowContainer'
import type { CueStack, CueStackCueEntry } from '../api/cueStacksApi'

const EMPTY_CUES: CueStackCueEntry[] = []

// Below this container width, the runner swaps to the mobile takeover layout.
const MOBILE_RUNNER_THRESHOLD = 600

export function RunRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/run`, { replace: true })
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

// Legacy redirects (/show, /projects/:id/show, /cue-stacks, /projects/:id/cue-stacks)
// all land on /run — Run is the default landing whether or not the show is active.
export function LegacyShowRedirect() {
  const { projectId } = useParams()
  if (projectId) {
    return <Navigate to={`/projects/${projectId}/run`} replace />
  }
  return <RunRedirect />
}

export function RunPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: stacks, isLoading: stacksLoading } = useProjectCueStackListQuery(projectIdNum)
  const { data: fxState } = useFxStateQuery()
  const { data: show } = useProjectShowQuery(projectIdNum)

  const isShowActive = show?.activeEntryId != null

  const [activeEntryId, setActiveEntryId] = useState<number | null>(null)

  const activeEntry: ShowEntryDto | undefined = useMemo(
    () => show?.entries.find((e) => e.id === activeEntryId),
    [show, activeEntryId],
  )
  const activeStackId = activeEntry?.cueStackId ?? null

  const [dbo, setDbo] = useState(false)
  const [oooDismissed, setOooDismissed] = useState(false)
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
  /** Set of expanded cue ids in the desktop list. */
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const [runnerContainerRef, isNarrowRunner] = useNarrowContainer(MOBILE_RUNNER_THRESHOLD)

  // Track when stack switches happen via the user clicking a tab vs the server
  // refetch. See the resetStack effect below.
  const manualSwitchRef = useRef(false)

  const [advanceCueStack] = useAdvanceCueStackMutation()
  const [activateCueStack] = useActivateCueStackMutation()
  const [deactivateCueStack] = useDeactivateCueStackMutation()
  const [goToCueInStack] = useGoToCueInStackMutation()
  const [sortByCueNumber] = useSortCueStackByCueNumberMutation()

  const [activateShow] = useActivateShowMutation()
  const [deactivateShow] = useDeactivateShowMutation()
  const [advanceShow] = useAdvanceShowMutation()
  const [goToEntry] = useGoToShowEntryMutation()

  // Bootstrap activeEntryId from server show state on mount / project switch / refetch.
  useEffect(() => {
    if (!show) {
      setActiveEntryId(null)
      return
    }
    const next = show.activeEntryId
      ?? show.entries.find((e) => e.entryType === 'STACK')?.id
      ?? null
    setActiveEntryId((prev) => (prev === next ? prev : next))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.projectId, show?.activeEntryId])

  const stackMap = useMemo(
    () => new Map(stacks?.map((s) => [s.id, s]) ?? []),
    [stacks],
  )

  const stack: CueStack | undefined = activeStackId != null ? stackMap.get(activeStackId) : undefined

  const cues = stack?.cues ?? EMPTY_CUES

  // Initialise runner state when the stack changes.
  useEffect(() => {
    if (activeStackId != null && cues.length > 0) {
      const isManualSwitch = manualSwitchRef.current
      manualSwitchRef.current = false
      dispatch(resetStack({
        stackId: activeStackId,
        cues,
        serverActiveCueId: isManualSwitch ? undefined : stack?.activeCueId,
        loop: stack?.loop,
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStackId, dispatch])

  const runner = useSelector((state: { runner: ReturnType<typeof import('../store/runnerSlice').runnerSlice.getInitialState> }) =>
    selectStackRunner(state, activeStackId ?? 0),
  )

  // ── Reconcile runner with remote cue changes ──
  const prevServerActiveCueRef = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    prevServerActiveCueRef.current = undefined
  }, [activeStackId])

  useEffect(() => {
    if (activeStackId == null || !stack) return
    const serverActive = stack.activeCueId
    const prev = prevServerActiveCueRef.current
    prevServerActiveCueRef.current = serverActive
    if (prev === undefined) return
    if (serverActive === prev) return
    if (runner.activeCueId != null) return
    if (cues.length > 0) {
      dispatch(resetStack({
        stackId: activeStackId,
        cues,
        serverActiveCueId: serverActive,
        loop: stack.loop,
      }))
    }
  }, [activeStackId, stack?.activeCueId, runner.activeCueId, cues, dispatch, stack?.loop])

  const effectiveActiveCueId = runner.activeCueId ?? stack?.activeCueId ?? null

  const completedSet = useMemo(() => new Set(runner.completedCueIds), [runner.completedCueIds])

  const activeCue = useMemo(
    () => cues.find((c) => c.id === effectiveActiveCueId) ?? null,
    [cues, effectiveActiveCueId],
  )

  const standbyCue = useMemo(
    () => cues.find((c) => c.id === runner.standbyCueId) ?? null,
    [cues, runner.standbyCueId],
  )

  const fireGo = useCallback(() => {
    if (activeStackId == null || !stack) return
    if (stack.activeCueId == null) {
      activateCueStack({
        projectId: projectIdNum,
        stackId: activeStackId,
        cueId: runner.standbyCueId ?? undefined,
      })
    } else if (runner.standbyCueId != null) {
      goToCueInStack({
        projectId: projectIdNum,
        stackId: activeStackId,
        cueId: runner.standbyCueId,
      })
    } else {
      advanceCueStack({ projectId: projectIdNum, stackId: activeStackId, direction: 'FORWARD' })
    }
  }, [activeStackId, stack, runner.standbyCueId, activateCueStack, advanceCueStack, goToCueInStack, projectIdNum])

  const handleAutoAdvanceComplete = useCallback(() => {
    if (activeStackId == null || !stack) return
    dispatch(go({ stackId: activeStackId, cues, loop: stack.loop }))
    fireGo()
  }, [activeStackId, stack, cues, dispatch, fireGo])

  const { cancelAnimations } = useRunnerAnimation({
    stackId: activeStackId ?? 0,
    activeCueId: runner.activeCueId,
    fadeDurationMs: activeCue?.fadeDurationMs ?? null,
    autoAdvance: activeCue?.autoAdvance ?? false,
    autoAdvanceDelayMs: activeCue?.autoAdvanceDelayMs ?? null,
    onAutoAdvanceComplete: handleAutoAdvanceComplete,
  })

  const nextStackEntry = useMemo(() => {
    if (runner.standbyCueId != null || !show || activeEntryId == null) return null
    const curIdx = show.entries.findIndex((e) => e.id === activeEntryId)
    return show.entries.slice(curIdx + 1).find((e) => e.entryType === 'STACK') ?? null
  }, [runner.standbyCueId, show, activeEntryId])

  // True only while a fade is in progress. `runner.activeCueId` is set by
  // go() and cleared by markDone(); the stack's server activeCueId persists
  // after the fade completes, so we can't use that. fadeProgress is 0 on
  // initial mount, hence the explicit gate here rather than `progress < 1`.
  const isFadingActive =
    runner.activeCueId != null && runner.fadeProgress < 1

  // Fade-remaining ms for the toolbar / cue card amber FADING badge. Null
  // unless the live cue is actively crossfading in.
  const fadeRemainMs = useMemo(() => {
    if (!isFadingActive || !activeCue) return null
    const dur = activeCue.fadeDurationMs ?? 0
    if (dur <= 0) return null
    return Math.max(0, dur * (1 - runner.fadeProgress))
  }, [isFadingActive, activeCue, runner.fadeProgress])

  const runnerDisplay: RunnerDisplayState = {
    activeCue,
    standbyCue,
    nextStackEntry,
    fadeProgress: isFadingActive ? runner.fadeProgress : null,
    autoProgress: runner.autoProgress,
    activeCueId: effectiveActiveCueId,
    standbyCueId: runner.standbyCueId,
    completedCueIds: runner.completedCueIds,
  }

  const handleGo = useCallback(() => {
    if (runner.standbyCueId == null) {
      // Boundary GO: advance to next STACK entry in show
      if (!show || activeEntryId == null) return
      const curIdx = show.entries.findIndex((e) => e.id === activeEntryId)
      const nextStack = show.entries.slice(curIdx + 1).find((e) => e.entryType === 'STACK')
      if (nextStack) {
        advanceShow({ projectId: projectIdNum, direction: 'FORWARD' })
        setActiveEntryId(nextStack.id)
        cancelAnimations()
        setOooDismissed(false)
      }
      return
    }
    if (activeStackId == null || !stack) return
    dispatch(go({ stackId: activeStackId, cues, loop: stack.loop }))
    fireGo()
  }, [activeStackId, stack, cues, runner.standbyCueId, dispatch, fireGo, show, activeEntryId, advanceShow, projectIdNum, cancelAnimations])

  const handleBack = useCallback(() => {
    if (activeStackId == null) return
    cancelAnimations()
    dispatch(back({ stackId: activeStackId, cues }))
    if (stack?.activeCueId != null) {
      advanceCueStack({ projectId: projectIdNum, stackId: activeStackId, direction: 'BACKWARD' })
    }
  }, [activeStackId, stack, cues, dispatch, cancelAnimations, advanceCueStack, projectIdNum])

  const handleDbo = useCallback(() => {
    setDbo((d) => !d)
  }, [])

  const handleTap = useCallback(() => {
    lightingApi.fx.tap()
  }, [])

  // Keyboard handler — Space=GO, Backspace=BACK. Only mounted on Run so no mode guard needed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShowActive) return
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (e.code === 'Space') {
        e.preventDefault()
        handleGo()
      }
      if (e.code === 'Backspace') {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleGo, handleBack, isShowActive])

  const handleSwitchToEntry = useCallback(
    (entry: ShowEntryDto) => {
      if (entry.entryType !== 'STACK' || entry.cueStackId == null) return
      if (entry.id === activeEntryId) return
      manualSwitchRef.current = true
      if (activeStackId != null && stack?.activeCueId != null) {
        deactivateCueStack({ projectId: projectIdNum, stackId: activeStackId })
      }
      goToEntry({ projectId: projectIdNum, entryId: entry.id })
        .unwrap()
        .then(() => {
          deactivateCueStack({ projectId: projectIdNum, stackId: entry.cueStackId! })
        })
        .catch(() => {
          manualSwitchRef.current = false
        })
      setActiveEntryId(entry.id)
      setOooDismissed(false)
      cancelAnimations()
    },
    [activeEntryId, activeStackId, stack, projectIdNum, deactivateCueStack, goToEntry, cancelAnimations],
  )

  const ooo = !oooDismissed && detectOutOfOrder(cues)

  const handleFixOrder = useCallback(() => {
    if (activeStackId == null) return
    sortByCueNumber({ projectId: projectIdNum, stackId: activeStackId })
    setOooDismissed(false)
  }, [activeStackId, projectIdNum, sortByCueNumber])

  // ── Activation handlers ──

  const stackEntryCount = show?.entries.filter((e) => e.entryType === 'STACK').length ?? 0
  const canStart = !isShowActive && stackEntryCount > 0

  const handleActivateShow = useCallback(() => {
    activateShow({ projectId: projectIdNum })
      .unwrap()
      .then((result) => {
        setActiveEntryId(result.activeEntryId)
      })
      .catch(() => {})
  }, [activateShow, projectIdNum])

  const handleConfirmDeactivate = useCallback(async () => {
    try {
      await deactivateShow({ projectId: projectIdNum }).unwrap()
    } catch {
      // Silently fail
    } finally {
      setStopConfirmOpen(false)
    }
  }, [deactivateShow, projectIdNum])

  const handleEditActiveCueInProgram = useCallback(() => {
    if (activeStackId == null) return
    const cueId = stack?.activeCueId ?? runner.activeCueId
    const params = new URLSearchParams({ stack: String(activeStackId) })
    if (cueId != null) params.set('cue', String(cueId))
    navigate(`/projects/${projectIdNum}/program?${params.toString()}`)
  }, [activeStackId, stack, runner.activeCueId, navigate, projectIdNum])

  // ── Cue card interactions ──

  const handleCueRequeue = useCallback(
    (cueId: number) => {
      if (activeStackId == null) return
      if (cueId === effectiveActiveCueId || cueId === runner.standbyCueId) return
      dispatch(setStandby({ stackId: activeStackId, cueId }))
    },
    [activeStackId, effectiveActiveCueId, runner.standbyCueId, dispatch],
  )

  const toggleExpanded = useCallback((cueId: number) => {
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(cueId)) n.delete(cueId)
      else n.add(cueId)
      return n
    })
  }, [])

  // Reset expansion when the stack switches. Declared BEFORE the auto-expand
  // effect so that on initial mount + first stack load the reset clears state
  // first, then auto-expand re-adds the live cue (effect order matters: a
  // later useEffect's setState supersedes an earlier one in the same commit
  // when the earlier passes a literal value).
  useEffect(() => {
    setExpanded(new Set())
  }, [activeStackId])

  // Auto-expand the live cue so the operator always sees what's outputting.
  useEffect(() => {
    if (effectiveActiveCueId == null) return
    setExpanded((s) => {
      if (s.has(effectiveActiveCueId)) return s
      const n = new Set(s)
      n.add(effectiveActiveCueId)
      return n
    })
  }, [effectiveActiveCueId])

  // ── Loading / redirect guards ──

  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    return <Navigate to={`/projects/${currentProject.id}/run`} replace />
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
      {/* Breadcrumb row + Edit Cue / Stop / connection-dot cluster */}
      <div className="flex items-center p-4 gap-3">
        <div className="flex-1 min-w-0">
          <Breadcrumbs projectName={project.name} currentPage="Run" />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isShowActive && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditActiveCueInProgram}
                    disabled={activeStackId == null}
                    aria-label="Edit live cue in Program"
                  >
                    <Pencil className="size-3.5" />
                    <span className="hidden min-[420px]:inline">Edit Cue</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Edit live cue</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setStopConfirmOpen(true)}
                    aria-label="Stop show"
                  >
                    <Square className="size-3.5" />
                    <span className="hidden min-[420px]:inline">Stop</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Stop show</TooltipContent>
              </Tooltip>
              <span
                className="size-3 rounded-full bg-green-500 ml-1"
                aria-label="Show is running"
                title="Show is running"
              />
            </>
          )}
        </div>
      </div>

      {!stacks || stacks.length === 0 ? (
        <Card className="m-4 p-8 flex flex-col items-center gap-2 text-muted-foreground">
          <p>No cue stacks found.</p>
          <p className="text-sm">Create a cue stack in the FX Cues view first.</p>
        </Card>
      ) : !isShowActive ? (
        // ── Start CTA hero ──
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <h2 className="text-2xl font-semibold">Show is not running</h2>
            {stackEntryCount === 0 ? (
              <>
                <p className="text-muted-foreground text-sm">
                  Add at least one stack to the show before starting.
                </p>
                <Button asChild variant="outline">
                  <Link to={`/projects/${projectIdNum}/program`}>Go to Program</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">
                  The show will start from the first stack. Press GO to fire the
                  first cue once it's running.
                </p>
                <Button
                  size="lg"
                  onClick={handleActivateShow}
                  disabled={!canStart}
                  className="h-12 px-8 text-base"
                >
                  <Play className="size-5 mr-2" />
                  Start Show
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        // ── Runner body ──
        <div
          ref={runnerContainerRef}
          className="flex-1 flex flex-col min-w-0 overflow-hidden"
        >
          {isNarrowRunner ? (
            <RunMobile
              show={show!}
              activeEntryId={activeEntryId}
              stack={stack}
              stackMap={stackMap}
              display={runnerDisplay}
              bpm={fxState?.bpm ?? null}
              dbo={dbo}
              onGo={handleGo}
              onBack={handleBack}
              onDbo={handleDbo}
              onTap={handleTap}
              onSwitchToEntry={handleSwitchToEntry}
              onRequeueCue={handleCueRequeue}
              projectId={projectIdNum}
              fadeRemainMs={fadeRemainMs}
            />
          ) : (
            <>
              {/* Top toolbar */}
              <RunToolbar
                dbo={dbo}
                onDbo={handleDbo}
                bpm={fxState?.bpm ?? null}
                onTap={handleTap}
                activeNumber={activeCue?.cueNumber ? `Q${activeCue.cueNumber}` : null}
                activeName={activeCue?.name ?? null}
                standbyNumber={standbyCue?.cueNumber ? `Q${standbyCue.cueNumber}` : null}
                standbyName={
                  standbyCue?.name
                    ?? (nextStackEntry ? `→ ${nextStackEntry.cueStackName}` : null)
                }
                fadeRemainMs={fadeRemainMs}
                onGo={handleGo}
                onBack={handleBack}
              />

              {/* Stack tabs */}
              <div className="flex h-12 shrink-0 items-stretch border-b overflow-x-auto">
                {show!.entries.map((entry) => {
                  if (entry.entryType === 'MARKER') {
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center h-full px-2 gap-1.5 shrink-0 pointer-events-none"
                      >
                        <div className="w-px h-4 bg-border" />
                        <span className="text-xs font-medium uppercase text-muted-foreground whitespace-nowrap">
                          {entry.label}
                        </span>
                        <div className="w-px h-4 bg-border" />
                      </div>
                    )
                  }
                  const entryStack = entry.cueStackId != null ? stackMap.get(entry.cueStackId) : undefined
                  const entryStandardCount =
                    entryStack?.cues.filter((c) => c.cueType === 'STANDARD').length ?? 0
                  return (
                    <Button
                      key={entry.id}
                      variant="ghost"
                      onClick={() => handleSwitchToEntry(entry)}
                      className={cn(
                        'flex items-center gap-2 px-5 h-full rounded-none border-r text-xs font-medium text-muted-foreground relative shrink-0',
                        'hover:text-foreground hover:bg-muted/10',
                        entry.id === activeEntryId &&
                          'text-foreground bg-muted/20 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary',
                      )}
                    >
                      {entry.cueStackId === stack?.activeCueId
                        ? null
                        : entryStack?.activeCueId != null && (
                          <span className="size-1.5 rounded-full bg-green-500 shadow-[0_0_6px_currentColor]" />
                        )}
                      {entry.cueStackName}
                      {entryStack?.loop && (
                        <RotateCcw className="size-3 text-muted-foreground" />
                      )}
                      <span className="font-mono text-[9.5px] rounded-full border bg-muted/40 px-1.5 text-muted-foreground/80 ml-0.5">
                        {entryStandardCount}
                      </span>
                    </Button>
                  )
                })}
              </div>

              {/* OOO banner */}
              {ooo && (
                <OutOfOrderBanner
                  onFixOrder={handleFixOrder}
                  onDismiss={() => setOooDismissed(true)}
                />
              )}

              {/* Cue list — inline expanding read-only cards */}
              <div className="flex-1 overflow-y-auto min-h-0 py-1">
                {cues.map((cue) => {
                  if (cue.cueType === 'MARKER') {
                    return <MarkerRow key={cue.id} name={cue.name} />
                  }
                  const isActive = cue.id === effectiveActiveCueId
                  const isStandby = cue.id === runner.standbyCueId
                  const isDone = completedSet.has(cue.id)
                  const isFading =
                    isActive && runner.activeCueId != null && runner.fadeProgress < 1
                  return (
                    <RunCueCard
                      key={cue.id}
                      cue={cue}
                      projectId={projectIdNum}
                      isActive={isActive}
                      isStandby={isStandby}
                      isDone={isDone}
                      expanded={expanded.has(cue.id)}
                      onSetStandby={() => handleCueRequeue(cue.id)}
                      onToggleExpanded={() => toggleExpanded(cue.id)}
                      fadeProgress={isFading ? runner.fadeProgress : null}
                      fadeRemainMs={isFading ? fadeRemainMs : null}
                    />
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Stop-show confirmation */}
      <Dialog open={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop the show?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            This will deactivate the show and clear the active cue. You can
            start it again from this view at any time.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeactivate}>
              Stop Show
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
