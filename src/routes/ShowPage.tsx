import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import {
  useProjectCueStackListQuery,
  useAdvanceCueStackMutation,
  useActivateCueStackMutation,
  useDeactivateCueStackMutation,
  useSortCueStackByCueNumberMutation,
  useRemoveCueFromCueStackMutation,
} from '../store/cueStacks'
import {
  useSaveProjectCueMutation,
  useLazyProjectCueQuery,
  useCreateProjectCueMutation,
} from '../store/cues'
import {
  useProjectShowQuery,
  useActivateShowMutation,
  useDeactivateShowMutation,
  useAdvanceShowMutation,
  useGoToShowEntryMutation,
} from '../store/show'
import type { CueInput, Cue } from '../api/cuesApi'
import type { ShowEntryDto } from '../api/showApi'
import { useFxStateQuery } from '../store/fx'
import { lightingApi } from '../api/lightingApi'
import {
  go,
  back,
  resetStack,
  selectStackRunner,
} from '../store/runnerSlice'
import { useRunnerAnimation } from '../hooks/useRunnerAnimation'
import { buildCueInput } from '../lib/cueUtils'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { ShowBar } from '../components/runner/ShowBar'
import { CueRow } from '../components/runner/CueRow'
import { MarkerRow } from '../components/runner/MarkerRow'
import {
  OutOfOrderBanner,
  detectOutOfOrder,
} from '../components/runner/OutOfOrderBanner'
import { CueForm } from '../components/cues/CueForm'
import { ProgramView } from '../components/runner/program/ProgramView'
import {
  ShowRunnerMobile,
  type RunnerDisplayState,
} from '../components/runner/ShowRunnerMobile'
import { useNarrowContainer } from '../hooks/useNarrowContainer'
import type { CueStack } from '../api/cueStacksApi'

// Below this container width, the Run tab swaps to the remote-control layout.
// Threshold reacts to the runner body's own width, so side panels squeezing the
// runner on desktop flip to the compact layout too.
const MOBILE_RUNNER_THRESHOLD = 600

// Redirect: /show or /cue-stacks (no project) → active project's /show
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

// Redirect: /projects/:id/cue-stacks → /projects/:id/show
export function LegacyCueStackRedirect() {
  const { projectId } = useParams()
  return <Navigate to={`/projects/${projectId}/show`} replace />
}

type ShowMode = 'program' | 'run'

// Main route component — show entries belong to the project directly; mode is a query param
export function ShowPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const dispatch = useDispatch()
  const [searchParams, setSearchParams] = useSearchParams()

  // Derive mode from query param (default program)
  const mode: ShowMode = searchParams.get('mode') === 'run' ? 'run' : 'program'

  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: stacks, isLoading: stacksLoading } = useProjectCueStackListQuery(projectIdNum)
  const { data: fxState } = useFxStateQuery()
  const { data: show } = useProjectShowQuery(projectIdNum)

  // Show is active when the project has an activeEntryId set
  const isShowActive = show?.activeEntryId != null

  // Active entry drives which stack is active
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null)
  const [drillStackId, setDrillStackId] = useState<number | null>(null)

  const activeEntry: ShowEntryDto | undefined = useMemo(
    () => show?.entries.find((e) => e.id === activeEntryId),
    [show, activeEntryId],
  )
  const activeStackId = activeEntry?.cueStackId ?? null

  // Show tab state
  const [dbo, setDbo] = useState(false)
  const [oooDismissed, setOooDismissed] = useState(false)
  const [ctxOverride, setCtxOverride] = useState<Record<number, 'theatre' | 'band'>>({})

  // CueForm sheet state (shared by both tabs)
  const [cueFormOpen, setCueFormOpen] = useState(false)
  const [cueFormCueId, setCueFormCueId] = useState<number | null>(null)
  const [cueFormStackId, setCueFormStackId] = useState<number | null>(null)
  const [cueFormCue, setCueFormCue] = useState<Cue | null>(null)
  const [cueFormSaving, setCueFormSaving] = useState(false)

  // Scroll save/restore for Show tab edit mode
  const listScrollRef = useRef<HTMLDivElement>(null)
  const savedScrollPos = useRef(0)

  const [runnerContainerRef, isNarrowRunner] = useNarrowContainer(MOBILE_RUNNER_THRESHOLD)

  const [advanceCueStack] = useAdvanceCueStackMutation()
  const [activateCueStack] = useActivateCueStackMutation()
  const [deactivateCueStack] = useDeactivateCueStackMutation()
  const [sortByCueNumber] = useSortCueStackByCueNumberMutation()
  const [removeCueFromStack] = useRemoveCueFromCueStackMutation()
  const [saveCue] = useSaveProjectCueMutation()
  const [createCue] = useCreateProjectCueMutation()
  const [fetchCue] = useLazyProjectCueQuery()

  // Show mutations
  const [activateShow] = useActivateShowMutation()
  const [deactivateShow] = useDeactivateShowMutation()
  const [advanceShow] = useAdvanceShowMutation()
  const [goToEntry] = useGoToShowEntryMutation()

  // Bootstrap activeEntryId from server show state on mount / project switch / refetch.
  // The WS subscription below provides lower-latency updates between refetches; this
  // effect handles initial load and ensures we re-sync if the refetched data disagrees.
  // When the show isn't running yet, default to the first STACK so the user can still
  // drill into a stack via the tab strip in run mode.
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

  // Live updates between refetches.
  useEffect(() => {
    const sub = lightingApi.show.subscribeToChanged((event) => {
      if (event.projectId !== projectIdNum) return
      setActiveEntryId((prev) => (prev === event.activeEntryId ? prev : event.activeEntryId))
    })
    return () => sub.unsubscribe()
  }, [projectIdNum])

  const stackMap = useMemo(
    () => new Map(stacks?.map((s) => [s.id, s]) ?? []),
    [stacks],
  )

  const stack: CueStack | undefined = activeStackId != null ? stackMap.get(activeStackId) : undefined

  const cues = stack?.cues ?? []

  // Initialize runner state when stack changes
  useEffect(() => {
    if (activeStackId != null && cues.length > 0) {
      dispatch(resetStack({
        stackId: activeStackId,
        cues,
        serverActiveCueId: stack?.activeCueId,
        loop: stack?.loop,
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStackId, dispatch])

  const runner = useSelector((state: { runner: ReturnType<typeof import('../store/runnerSlice').runnerSlice.getInitialState> }) =>
    selectStackRunner(state, activeStackId ?? 0),
  )

  const activeCue = useMemo(
    () => cues.find((c) => c.id === runner.activeCueId) ?? null,
    [cues, runner.activeCueId],
  )

  const standbyCue = useMemo(
    () => cues.find((c) => c.id === runner.standbyCueId) ?? null,
    [cues, runner.standbyCueId],
  )

  // Sends the right backend call: activate (first GO) vs advance (subsequent)
  const fireGo = useCallback(() => {
    if (activeStackId == null || !stack) return
    if (stack.activeCueId == null) {
      activateCueStack({
        projectId: projectIdNum,
        stackId: activeStackId,
        cueId: runner.standbyCueId ?? undefined,
      })
    } else {
      advanceCueStack({ projectId: projectIdNum, stackId: activeStackId, direction: 'FORWARD' })
    }
  }, [activeStackId, stack, runner.standbyCueId, activateCueStack, advanceCueStack, projectIdNum])

  // Animation hook
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

  // Next STACK entry after current (for boundary hint and GO advance)
  const nextStackEntry = useMemo(() => {
    if (runner.standbyCueId != null || !show || activeEntryId == null) return null
    const curIdx = show.entries.findIndex((e) => e.id === activeEntryId)
    return show.entries.slice(curIdx + 1).find((e) => e.entryType === 'STACK') ?? null
  }, [runner.standbyCueId, show, activeEntryId])

  const runnerDisplay: RunnerDisplayState = {
    activeCue,
    standbyCue,
    nextStackEntry,
    fadeProgress: runner.fadeProgress,
    autoProgress: runner.autoProgress,
    activeCueId: runner.activeCueId,
    standbyCueId: runner.standbyCueId,
    completedCueIds: runner.completedCueIds,
  }

  // GO handler
  const handleGo = useCallback(() => {
    if (runner.standbyCueId == null) {
      // Boundary GO: advance to next STACK entry in show
      if (!show || activeEntryId == null) return
      const curIdx = show.entries.findIndex((e) => e.id === activeEntryId)
      const nextStack = show.entries.slice(curIdx + 1).find((e) => e.entryType === 'STACK')
      if (nextStack) {
        advanceShow({
          projectId: projectIdNum,
          direction: 'FORWARD',
        })
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

  // BACK handler
  const handleBack = useCallback(() => {
    if (activeStackId == null) return
    cancelAnimations()
    dispatch(back({ stackId: activeStackId, cues }))
    if (stack?.activeCueId != null) {
      advanceCueStack({ projectId: projectIdNum, stackId: activeStackId, direction: 'BACKWARD' })
    }
  }, [activeStackId, stack, cues, dispatch, cancelAnimations, advanceCueStack, projectIdNum])

  // DBO handler
  const handleDbo = useCallback(() => {
    setDbo((d) => !d)
  }, [])

  // TAP handler
  const handleTap = useCallback(() => {
    lightingApi.fx.tap()
  }, [])

  // Keyboard handler — only when in Run mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'run') return
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (e.code === 'Space') {
        e.preventDefault()
        handleGo()
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleGo, handleBack, mode])

  // Switch to a show entry (Show tab strip click)
  const handleSwitchToEntry = useCallback(
    (entry: ShowEntryDto) => {
      if (entry.entryType !== 'STACK' || entry.cueStackId == null) return
      if (activeStackId != null && stack?.activeCueId != null) {
        deactivateCueStack({ projectId: projectIdNum, stackId: activeStackId })
      }
      goToEntry({
        projectId: projectIdNum,
        entryId: entry.id,
      })
      setActiveEntryId(entry.id)
      setOooDismissed(false)
      cancelAnimations()
    },
    [activeStackId, stack, projectIdNum, deactivateCueStack, goToEntry, cancelAnimations],
  )

  const handleDrillStack = useCallback(
    (id: number | null) => {
      setDrillStackId(id)
    },
    [],
  )

  // Context toggle
  const isTheatre = ctxOverride[activeStackId ?? 0] !== 'band'
  const toggleCtx = (val: 'theatre' | 'band') => {
    if (activeStackId != null) {
      setCtxOverride((p) => ({ ...p, [activeStackId]: val }))
    }
  }

  // OOO detection
  const ooo = isTheatre && !oooDismissed && detectOutOfOrder(cues)

  const handleFixOrder = useCallback(() => {
    if (activeStackId == null) return
    sortByCueNumber({ projectId: projectIdNum, stackId: activeStackId })
    setOooDismissed(false)
  }, [activeStackId, projectIdNum, sortByCueNumber])

  // ── Show activation handlers — project is the show ──

  const handleActivateShow = useCallback(() => {
    activateShow({ projectId: projectIdNum })
      .unwrap()
      .then((result) => {
        setActiveEntryId(result.activeEntryId)
        // After activating, jump to run mode so the operator can hit GO.
        setSearchParams({ mode: 'run' })
      })
      .catch(() => {
        // Silently fail
      })
  }, [activateShow, projectIdNum, setSearchParams])

  const handleDeactivateShow = useCallback(async () => {
    try {
      await deactivateShow({ projectId: projectIdNum }).unwrap()
    } catch {
      // Silently fail
    }
  }, [deactivateShow, projectIdNum])

  // ── CueForm sheet handlers ──

  const openCueForm = useCallback(
    async (stackId: number, cueId: number) => {
      if (mode === 'run' && listScrollRef.current) {
        savedScrollPos.current = listScrollRef.current.scrollTop
      }
      try {
        const { data: fullCue } = await fetchCue({ projectId: projectIdNum, cueId }, true)
        if (fullCue) {
          setCueFormCue(fullCue)
          setCueFormCueId(cueId)
          setCueFormStackId(stackId)
          setCueFormOpen(true)
        }
      } catch {
        // Silently fail
      }
    },
    [mode, fetchCue, projectIdNum],
  )

  const handleCueFormSave = useCallback(
    async (input: CueInput) => {
      if (cueFormCueId == null) return
      setCueFormSaving(true)
      try {
        await saveCue({ projectId: projectIdNum, cueId: cueFormCueId, ...input }).unwrap()
      } finally {
        setCueFormSaving(false)
      }
    },
    [cueFormCueId, saveCue, projectIdNum],
  )

  const handleCueFormClose = useCallback(
    (open: boolean) => {
      setCueFormOpen(open)
      if (!open) {
        if (mode === 'run') {
          requestAnimationFrame(() => {
            if (listScrollRef.current) {
              listScrollRef.current.scrollTop = savedScrollPos.current
            }
          })
        }
      }
    },
    [mode],
  )

  const handleDuplicate = useCallback(async () => {
    if (!cueFormCue || cueFormStackId == null) return
    setCueFormSaving(true)
    try {
      const input = buildCueInput(cueFormCue)
      input.name = cueFormCue.name + ' (copy)'
      input.cueNumber = null
      input.cueStackId = cueFormStackId
      const result = await createCue({ projectId: projectIdNum, ...input }).unwrap()
      setCueFormOpen(false)
      setTimeout(() => openCueForm(cueFormStackId!, result.id), 200)
    } catch {
      // Silently fail
    } finally {
      setCueFormSaving(false)
    }
  }, [cueFormCue, cueFormStackId, projectIdNum, createCue, openCueForm])

  const handleRemoveFromStack = useCallback(() => {
    if (cueFormCueId == null || cueFormStackId == null) return
    removeCueFromStack({ projectId: projectIdNum, stackId: cueFormStackId, cueId: cueFormCueId })
    setCueFormOpen(false)
  }, [cueFormCueId, cueFormStackId, projectIdNum, removeCueFromStack])

  // ── Breadcrumb helpers ──

  const drillStack = drillStackId != null ? stackMap.get(drillStackId) : undefined

  const breadcrumbExtra = useMemo(() => {
    const segments: string[] = []
    if (mode === 'program') {
      segments.push('Program')
      if (drillStack) segments.push(drillStack.name)
    } else {
      segments.push('Run')
    }
    return segments
  }, [mode, drillStack])

  const handleBreadcrumbCurrentPageClick = useCallback(() => {
    // Clicking "Show" in the breadcrumb resets to top-level program view —
    // clear both the mode (defaults to program) and any auto-drilled stack
    // so the user lands on the show overview, not whatever they were last viewing.
    setSearchParams({})
    setDrillStackId(null)
  }, [setSearchParams])

  const handleBreadcrumbExtraClick = useCallback(
    (index: number) => {
      if (index === 0) {
        // Clicked mode name — in program mode with a stack drilled, step back.
        if (mode === 'program' && drillStackId != null) {
          setDrillStackId(null)
        }
      }
    },
    [mode, drillStackId],
  )

  // ── Mode toggle navigation ──

  const handleSwitchMode = useCallback(
    (targetMode: ShowMode) => {
      if (targetMode === mode) return
      // On Run → Program switch, drill into the active stack so the operator
      // lands on what's running rather than the show overview.
      if (targetMode === 'program' && activeStackId != null) {
        setDrillStackId(activeStackId)
      }
      setSearchParams({ mode: targetMode })
    },
    [mode, setSearchParams, activeStackId],
  )

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

  if (!stacks || stacks.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3 pb-2">
          <Breadcrumbs projectName={project.name} currentPage="Show" />
        </div>
        <Card className="m-4 p-8 flex flex-col items-center gap-2 text-muted-foreground">
          <p>No cue stacks found.</p>
          <p className="text-sm">Create a cue stack in the FX Cues view first.</p>
        </Card>
      </div>
    )
  }

  // ── Show view (always rendered; the show is the project) ──

  return (
    <div className="flex flex-col h-full">
      {/* Header row: breadcrumbs + mode toggle + show status */}
      <div className="flex flex-col sm:flex-row sm:items-center p-4 gap-3">
        <div className="flex-1 min-w-0">
          <Breadcrumbs
            projectName={project.name}
            currentPage="Show"
            extra={breadcrumbExtra}
            onCurrentPageClick={handleBreadcrumbCurrentPageClick}
            onExtraClick={handleBreadcrumbExtraClick}
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Mode toggle */}
          <Tabs value={mode} onValueChange={(v) => handleSwitchMode(v as ShowMode)} className="w-auto">
            <TabsList>
              <TabsTrigger value="program">Program</TabsTrigger>
              <TabsTrigger value="run">Run</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Show status */}
          {isShowActive && (
            <div className="flex items-center gap-1.5">
              <div className="size-1.5 rounded-full bg-green-500" />
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={handleDeactivateShow}
              >
                Stop
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Program mode ═══ */}
      {mode === 'program' && (
        <ProgramView
          projectId={projectIdNum}
          stacks={stacks ?? []}
          drillStackId={drillStackId}
          onDrillStack={handleDrillStack}
          onSwitchToShow={() => handleSwitchMode('run')}
          onOpenCueForm={openCueForm}
          show={show}
          activeStackId={activeStackId}
          // Use server-tracked activeCueId so the marker reflects what's
          // currently on stage rather than the transient fade cursor —
          // runner.activeCueId clears after markDone (e.g. SNAP fades).
          activeCueId={stack?.activeCueId ?? null}
          onActivate={handleActivateShow}
        />
      )}

      {/* ═══ Run mode ═══ */}
      {mode === 'run' && show && (
        <div
          ref={runnerContainerRef}
          className="flex-1 flex flex-col min-w-0 overflow-hidden"
        >
          {isNarrowRunner ? (
            <ShowRunnerMobile
              show={show}
              activeEntryId={activeEntryId}
              stack={stack}
              stackMap={stackMap}
              display={runnerDisplay}
              bpm={fxState?.bpm ?? null}
              dbo={dbo}
              isTheatre={isTheatre}
              onGo={handleGo}
              onBack={handleBack}
              onDbo={handleDbo}
              onTap={handleTap}
              onSwitchToEntry={handleSwitchToEntry}
              onToggleCtx={toggleCtx}
              onOpenCueForm={openCueForm}
            />
          ) : (
            <>
              {/* Show bar */}
              <ShowBar
                dbo={dbo}
                onDbo={handleDbo}
                bpm={fxState?.bpm ?? null}
                onTap={handleTap}
                stackName={stack?.name ?? ''}
                activeName={activeCue?.name ?? null}
                standbyName={standbyCue?.name ?? null}
                nextStackName={nextStackEntry?.cueStackName ?? undefined}
                onGo={handleGo}
                onBack={handleBack}
              />

              {/* Runner body */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Stack tabs + context toggle */}
                <div className="flex h-12 shrink-0 items-center border-b">
                  {show.entries.map((entry) => {
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
                        {entry.cueStackName}
                        {entryStack?.loop && (
                          <RotateCcw className="size-3 text-muted-foreground" />
                        )}
                      </Button>
                    )
                  })}
                  <div className="flex-1" />
                  <div className="px-4">
                    <Tabs value={isTheatre ? 'theatre' : 'band'} onValueChange={(v) => toggleCtx(v as 'theatre' | 'band')} className="w-auto">
                      <TabsList>
                        <TabsTrigger value="theatre">Theatre</TabsTrigger>
                        <TabsTrigger value="band">Band</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>

                {/* OOO banner */}
                {ooo && (
                  <OutOfOrderBanner
                    onFixOrder={handleFixOrder}
                    onDismiss={() => setOooDismissed(true)}
                  />
                )}

                {/* Column headers */}
                <div className="flex items-center h-10 px-4 border-b shrink-0">
                  <div className="w-8 px-2" />
                  {isTheatre && (
                    <div className="w-14 px-2 text-sm font-medium text-foreground">
                      Q
                    </div>
                  )}
                  <div className="flex-1 px-2 text-sm font-medium text-foreground">
                    Name
                  </div>
                  <div className="w-24 text-right px-2 text-sm font-medium text-foreground">
                    Fade
                  </div>
                  <div className="w-12 px-2" />
                  {isTheatre && (
                    <div className="w-[200px] px-2 text-sm font-medium text-foreground border-l">
                      Note
                    </div>
                  )}
                  <div className="w-10" />
                </div>

                {/* Cue list */}
                <div className="flex-1 overflow-y-auto py-0.5" ref={listScrollRef}>
                  {cues.map((cue) => {
                    if (cue.cueType === 'MARKER') {
                      return <MarkerRow key={cue.id} name={cue.name} />
                    }
                    const isActive = cue.id === runner.activeCueId
                    const isStandby = cue.id === runner.standbyCueId
                    const isDone = runner.completedCueIds.includes(cue.id)
                    return (
                      <CueRow
                        key={cue.id}
                        cueNumber={cue.cueNumber}
                        name={cue.name}
                        fadeDurationMs={cue.fadeDurationMs}
                        fadeCurve={cue.fadeCurve}
                        autoAdvance={cue.autoAdvance}
                        notes={cue.notes}
                        isActive={isActive}
                        isStandby={isStandby}
                        isDone={isDone}
                        isEditing={false}
                        isTheatre={isTheatre}
                        fadeProgress={isActive ? runner.fadeProgress : 0}
                        autoProgress={isActive ? runner.autoProgress : null}
                        onClick={() => {}}
                      />
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* CueForm sheet (shared across both modes) */}
      <CueForm
        open={cueFormOpen}
        onOpenChange={handleCueFormClose}
        cue={cueFormCue}
        projectId={projectIdNum}
        onSave={handleCueFormSave}
        isSaving={cueFormSaving}
        isInStack
        onDuplicate={handleDuplicate}
        onRemoveFromStack={handleRemoveFromStack}
      />
    </div>
  )
}
