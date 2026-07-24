import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RotateCcw, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import {
  useProjectCueStackListQuery,
  useProjectProgramStateQuery,
  useAdvanceCueStackMutation,
  useActivateCueStackMutation,
  useDeactivateCueStackMutation,
  useSortCueStackByCueNumberMutation,
  useGoToCueInStackMutation,
  useActivateProgramMutation,
  useDeactivateProgramMutation,
  useAdvanceProgramMutation,
  useGoToStackMutation,
} from '../store/cueStacks'
import { useFxStateQuery } from '../store/fx'
import { useProjectCueLocationsQuery, useProjectPromptBookQuery } from '../store/promptBooks'
import { positionLabelFor } from '../lib/promptBook/geometry'
import { lightingApi } from '../api/lightingApi'
import {
  go,
  back,
  resetStack,
  setStandby,
  selectStackRunner,
} from '../store/runnerSlice'
import { useRunnerAnimation } from '../hooks/useRunnerAnimation'
import { ShowHeader } from '../components/ShowHeader'
import { MarkerRow } from '../components/runner/MarkerRow'
import {
  OutOfOrderBanner,
  detectOutOfOrder,
} from '../components/runner/OutOfOrderBanner'
import { ShowBar } from '../components/ShowBar'
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

  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: stacks, isLoading: stacksLoading } = useProjectCueStackListQuery(projectIdNum)
  const { data: fxState } = useFxStateQuery()
  const { data: programState } = useProjectProgramStateQuery(projectIdNum)
  const { data: cueLocations } = useProjectCueLocationsQuery(projectIdNum)
  // The book carries coverPages — the front-matter offset applied to each cue's page label.
  const { data: promptBook } = useProjectPromptBookQuery(projectIdNum)
  const coverPages = promptBook?.coverPages ?? 0

  // Per-cue prompt-book reading position, e.g. "top of p. 9". Empty when the project
  // has no prompt book — the label just doesn't render.
  const locationByCue = useMemo(() => {
    const m = new Map<number, string>()
    for (const l of cueLocations ?? []) m.set(l.cueId, positionLabelFor(l.page, l.y, coverPages))
    return m
  }, [cueLocations, coverPages])

  const isShowActive = programState?.activeStackId != null

  // The stack currently being browsed in the tab strip. Switching a tab moves the server playhead
  // (goToStack), so this follows `programState.activeStackId`; it's local so the strip stays
  // responsive between the click and the refetch.
  const [activeStackId, setActiveStackId] = useState<number | null>(null)

  const [dbo, setDbo] = useState(false)
  const [oooDismissed, setOooDismissed] = useState(false)
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

  const [activateShow] = useActivateProgramMutation()
  const [deactivateShow] = useDeactivateProgramMutation()
  const [advanceShow] = useAdvanceProgramMutation()
  const [goToStack] = useGoToStackMutation()

  // Bootstrap the browsed stack from the server playhead (falling back to the first runnable stack)
  // on mount / project switch / when the playhead moves or the stack list size changes.
  useEffect(() => {
    const next =
      programState?.activeStackId ?? stacks?.find((s) => s.type === 'STACK')?.id ?? null
    setActiveStackId((prev) => (prev === next ? prev : next))
    // Keyed on whether the stack list has *loaded* (not its length): follow server-playhead moves
    // and pick a first stack once data arrives, but never re-run on add/remove/reorder — which
    // would yank the operator off a manually-browsed tab mid-show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programState?.projectId, programState?.activeStackId, stacks != null])

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

  const nextStack = useMemo(() => {
    if (runner.standbyCueId != null || activeStackId == null || !stacks) return null
    const runnable = stacks.filter((s) => s.type === 'STACK')
    const curIdx = runnable.findIndex((s) => s.id === activeStackId)
    return curIdx >= 0 ? runnable[curIdx + 1] ?? null : null
  }, [runner.standbyCueId, stacks, activeStackId])

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
    nextStack,
    fadeProgress: isFadingActive ? runner.fadeProgress : null,
    autoProgress: runner.autoProgress,
    activeCueId: effectiveActiveCueId,
    standbyCueId: runner.standbyCueId,
    completedCueIds: runner.completedCueIds,
  }

  const handleGo = useCallback(() => {
    if (runner.standbyCueId == null) {
      // Boundary GO: advance to the next runnable stack in show order.
      if (activeStackId == null || !stacks) return
      const runnable = stacks.filter((s) => s.type === 'STACK')
      const curIdx = runnable.findIndex((s) => s.id === activeStackId)
      const next = curIdx >= 0 ? runnable[curIdx + 1] : undefined
      if (next) {
        advanceShow({ projectId: projectIdNum, direction: 'FORWARD' })
        setActiveStackId(next.id)
        cancelAnimations()
        setOooDismissed(false)
      }
      return
    }
    if (activeStackId == null || !stack) return
    dispatch(go({ stackId: activeStackId, cues, loop: stack.loop }))
    fireGo()
  }, [activeStackId, stack, cues, runner.standbyCueId, dispatch, fireGo, stacks, advanceShow, projectIdNum, cancelAnimations])

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
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      // Don't fire transport from within a modal (e.g. the Stop-confirm dialog),
      // where focus is trapped on a dialog button — there Space/Backspace act on the
      // dialog, not the show. Guarding all buttons would break Space=GO whenever a
      // toolbar/cue button holds focus, so scope the guard to open dialogs only.
      if (target.closest?.('[role="dialog"]')) return
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

  const handleSwitchToStack = useCallback(
    (target: CueStack) => {
      if (target.type !== 'STACK') return
      if (target.id === activeStackId) return
      manualSwitchRef.current = true
      if (activeStackId != null && stack?.activeCueId != null) {
        deactivateCueStack({ projectId: projectIdNum, stackId: activeStackId })
      }
      goToStack({ projectId: projectIdNum, stackId: target.id })
        .unwrap()
        .then(() => {
          deactivateCueStack({ projectId: projectIdNum, stackId: target.id })
        })
        .catch(() => {
          manualSwitchRef.current = false
        })
      setActiveStackId(target.id)
      setOooDismissed(false)
      cancelAnimations()
    },
    [activeStackId, stack, projectIdNum, deactivateCueStack, goToStack, cancelAnimations],
  )

  const ooo = !oooDismissed && detectOutOfOrder(cues)

  const handleFixOrder = useCallback(() => {
    if (activeStackId == null) return
    sortByCueNumber({ projectId: projectIdNum, stackId: activeStackId })
    setOooDismissed(false)
  }, [activeStackId, projectIdNum, sortByCueNumber])

  // ── Activation handlers ──

  const runnableStackCount = stacks?.filter((s) => s.type === 'STACK').length ?? 0
  const canStart = !isShowActive && runnableStackCount > 0

  const handleActivateShow = useCallback(() => {
    activateShow({ projectId: projectIdNum })
      .unwrap()
      .then((result) => {
        setActiveStackId(result.activeStackId)
      })
      .catch(() => {})
  }, [activateShow, projectIdNum])

  const handleStopShow = useCallback(async () => {
    await deactivateShow({ projectId: projectIdNum }).unwrap()
  }, [deactivateShow, projectIdNum])

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
      <ShowHeader
        view="run"
        projectId={projectIdNum}
        projectName={project.name}
        isShowActive={isShowActive}
        canStart={canStart}
        onStart={handleActivateShow}
        onStop={handleStopShow}
      />

      {!stacks || stacks.length === 0 ? (
        <Card className="m-4 p-8 flex flex-col items-center gap-2 text-muted-foreground">
          <p>No cue stacks yet.</p>
          <p className="text-sm">Create one in Program to get started.</p>
        </Card>
      ) : !isShowActive ? (
        // ── Start CTA hero ──
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <h2 className="text-2xl font-semibold">Show is not running</h2>
            {runnableStackCount === 0 ? (
              <>
                <p className="text-muted-foreground text-sm">
                  Create at least one cue stack before starting.
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
              stacks={stacks}
              activeStackId={activeStackId}
              stack={stack}
              multiStack={runnableStackCount > 1}
              display={runnerDisplay}
              bpm={fxState?.bpm ?? null}
              dbo={dbo}
              onGo={handleGo}
              onBack={handleBack}
              onDbo={handleDbo}
              onTap={handleTap}
              onSwitchToStack={handleSwitchToStack}
              onRequeueCue={handleCueRequeue}
              projectId={projectIdNum}
              fadeRemainMs={fadeRemainMs}
              activeLocation={activeCue ? locationByCue.get(activeCue.id) ?? null : null}
              standbyLocation={standbyCue ? locationByCue.get(standbyCue.id) ?? null : null}
            />
          ) : (
            <>
              {/* Row 3 — universal show bar */}
              <ShowBar
                stackName={runnableStackCount > 1 ? undefined : (stack?.name ?? null)}
                dbo={dbo}
                onDbo={handleDbo}
                bpm={fxState?.bpm ?? null}
                onTap={handleTap}
                activeNumber={activeCue?.cueNumber ? `Q${activeCue.cueNumber}` : null}
                activeName={activeCue?.name ?? null}
                standbyNumber={standbyCue?.cueNumber ? `Q${standbyCue.cueNumber}` : null}
                standbyName={
                  standbyCue?.name
                    ?? (nextStack ? `→ ${nextStack.name}` : null)
                }
                fadeRemainMs={fadeRemainMs}
                onGo={handleGo}
                onBack={handleBack}
                showShortcuts
              />

              {/* Stack tabs — hidden when the show has a single stack (nothing to switch to). */}
              {runnableStackCount > 1 && (
              <div className="flex h-12 shrink-0 items-stretch border-b overflow-x-auto">
                {stacks.map((s) => {
                  if (s.type === 'SEPARATOR') {
                    return (
                      <div
                        key={s.id}
                        className="flex items-center h-full px-2 gap-1.5 shrink-0 pointer-events-none"
                      >
                        <div className="w-px h-4 bg-border" />
                        <span className="text-xs font-medium uppercase text-muted-foreground whitespace-nowrap">
                          {s.label ?? s.name}
                        </span>
                        <div className="w-px h-4 bg-border" />
                      </div>
                    )
                  }
                  const standardCount = s.cues.filter((c) => c.cueType === 'STANDARD').length
                  return (
                    <Button
                      key={s.id}
                      variant="ghost"
                      onClick={() => handleSwitchToStack(s)}
                      className={cn(
                        'flex items-center gap-2 px-5 h-full rounded-none border-r text-xs font-medium text-muted-foreground relative shrink-0',
                        'hover:text-foreground hover:bg-muted/10',
                        s.id === activeStackId &&
                          'text-foreground bg-muted/20 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary',
                      )}
                    >
                      {s.id !== activeStackId && s.activeCueId != null && (
                        <span className="size-1.5 rounded-full bg-green-500 shadow-[0_0_6px_currentColor]" />
                      )}
                      {s.name}
                      {s.loop && (
                        <RotateCcw className="size-3 text-muted-foreground" />
                      )}
                      <span className="font-mono text-[9.5px] rounded-full border bg-muted/40 px-1.5 text-muted-foreground/80 ml-0.5">
                        {standardCount}
                      </span>
                    </Button>
                  )
                })}
              </div>
              )}

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
                      location={locationByCue.get(cue.id) ?? null}
                    />
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
