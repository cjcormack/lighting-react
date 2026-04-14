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
  useProjectShowSessionListQuery,
  useCreateShowSessionMutation,
  useActivateShowSessionMutation,
  useDeactivateShowSessionMutation,
  useAdvanceShowSessionMutation,
  useGoToShowSessionEntryMutation,
} from '../store/showSessions'
import type { CueInput, Cue } from '../api/cuesApi'
import type { ShowSessionEntryDto } from '../api/showSessionsApi'
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
import { SessionPicker } from '../components/runner/SessionPicker'
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

// Redirect: /projects/:id/show/sessions/:sessionId/(program|run) → /projects/:id/show?mode=(program|run)
// The active session is server-tracked now, so old bookmarked session ids are dropped.
export function LegacyShowSessionRedirect() {
  const { projectId } = useParams()
  const location = useLocation()
  const mode = location.pathname.endsWith('/run') ? 'run' : 'program'
  return <Navigate to={`/projects/${projectId}/show?mode=${mode}`} replace />
}

type ShowMode = 'program' | 'run'

// Main route component — active session is server-tracked, mode is a query param
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
  const { data: sessions } = useProjectShowSessionListQuery(projectIdNum)

  // Session-driven active stack — activeEntryId drives which stack is active
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null)
  const [drillStackId, setDrillStackId] = useState<number | null>(null)

  // Derive active session from server state (isActive flag)
  const activeSession = useMemo(
    () => sessions?.find((s) => s.isActive),
    [sessions],
  )

  const activeEntry: ShowSessionEntryDto | undefined = useMemo(
    () => activeSession?.entries.find((e) => e.id === activeEntryId),
    [activeSession, activeEntryId],
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

  // Session mutations
  const [createSession] = useCreateShowSessionMutation()
  const [activateSessionMut] = useActivateShowSessionMutation()
  const [deactivateSessionMut] = useDeactivateShowSessionMutation()
  const [advanceSession] = useAdvanceShowSessionMutation()
  const [goToEntry] = useGoToShowSessionEntryMutation()

  // Sync activeEntryId from session state on initial load / session change
  useEffect(() => {
    if (!activeSession) {
      setActiveEntryId(null)
      return
    }
    if (activeSession.activeEntryId != null) {
      setActiveEntryId(activeSession.activeEntryId)
    } else {
      const first = activeSession.entries.find((e) => e.entryType === 'STACK')
      setActiveEntryId(first?.id ?? null)
    }
    // Only re-run when the active session identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id])

  // Subscribe to showSessionChanged WS events for real-time activeEntryId updates.
  // Active-session flips (isActive true/false on a different session) are handled via the
  // accompanying showSessionListChanged invalidation — the list refetch re-derives
  // activeSession from the server-authoritative isActive flag.
  useEffect(() => {
    const sub = lightingApi.showSessions.subscribeToChanged((event) => {
      if (activeSession && event.sessionId === activeSession.id && event.isActive) {
        setActiveEntryId(event.activeEntryId)
      }
    })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id])

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
    if (runner.standbyCueId != null || !activeSession || activeEntryId == null) return null
    const curIdx = activeSession.entries.findIndex((e) => e.id === activeEntryId)
    return activeSession.entries.slice(curIdx + 1).find((e) => e.entryType === 'STACK') ?? null
  }, [runner.standbyCueId, activeSession, activeEntryId])

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
      // Boundary GO: advance to next STACK entry in session
      if (!activeSession || activeEntryId == null) return
      const curIdx = activeSession.entries.findIndex((e) => e.id === activeEntryId)
      const nextStack = activeSession.entries.slice(curIdx + 1).find((e) => e.entryType === 'STACK')
      if (nextStack) {
        advanceSession({
          projectId: projectIdNum,
          sessionId: activeSession.id,
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
  }, [activeStackId, stack, cues, runner.standbyCueId, dispatch, fireGo, activeSession, activeEntryId, advanceSession, projectIdNum, cancelAnimations])

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

  // Switch to a session entry (Show tab strip click)
  const handleSwitchToEntry = useCallback(
    (entry: ShowSessionEntryDto) => {
      if (entry.entryType !== 'STACK' || entry.cueStackId == null) return
      if (activeStackId != null && stack?.activeCueId != null) {
        deactivateCueStack({ projectId: projectIdNum, stackId: activeStackId })
      }
      if (activeSession) {
        goToEntry({
          projectId: projectIdNum,
          sessionId: activeSession.id,
          entryId: entry.id,
        })
      }
      setActiveEntryId(entry.id)
      setOooDismissed(false)
      cancelAnimations()
    },
    [activeStackId, stack, activeSession, projectIdNum, deactivateCueStack, goToEntry, cancelAnimations],
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

  // ── Session management handlers — backend is authoritative for isActive ──

  const handleCreateSession = useCallback(async (name: string) => {
    try {
      await createSession({ projectId: projectIdNum, name }).unwrap()
      // Creation does not auto-activate — the user stays on the picker and clicks Activate next.
    } catch {
      // Silently fail
    }
  }, [createSession, projectIdNum])

  const handleActivateSession = useCallback(
    (sid: number) => {
      const session = sessions?.find((s) => s.id === sid)
      setDrillStackId(null)
      const hasEntries = !!session && session.entries.length > 0
      // Sessions with entries → run mode; empty sessions → program mode to add stacks.
      setSearchParams({ mode: hasEntries ? 'run' : 'program' })
      // If the user clicked the already-active session (picker "Open" button), skip the
      // mutation — the backend would short-circuit anyway, and avoiding the round-trip
      // makes the mode switch feel instant.
      if (session?.isActive) return
      activateSessionMut({ projectId: projectIdNum, sessionId: sid })
        .unwrap()
        .then((result) => setActiveEntryId(result.activeEntryId))
        .catch(() => {
          // Fall back to the first STACK entry if the backend round-trip fails.
          const firstStack = session?.entries.find((e) => e.entryType === 'STACK')
          setActiveEntryId(firstStack?.id ?? null)
        })
    },
    [sessions, activateSessionMut, projectIdNum, setSearchParams],
  )

  const handleDeactivateSession = useCallback(async () => {
    if (!activeSession) return
    try {
      await deactivateSessionMut({ projectId: projectIdNum, sessionId: activeSession.id }).unwrap()
    } catch {
      // Silently fail
    }
    setSearchParams({})
  }, [activeSession, deactivateSessionMut, projectIdNum, setSearchParams])

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
    if (!activeSession) return undefined
    const segments = [activeSession.name]
    if (mode === 'program') {
      segments.push('Program')
      if (drillStack) segments.push(drillStack.name)
    } else {
      segments.push('Run')
    }
    return segments
  }, [activeSession, mode, drillStack])

  const handleBreadcrumbCurrentPageClick = useCallback(() => {
    // Clicking "Show" in the breadcrumb resets to top-level program view —
    // clear both the mode (defaults to program) and any auto-drilled stack
    // so the user lands on Session Overview, not whatever they were last viewing.
    setSearchParams({})
    setDrillStackId(null)
  }, [setSearchParams])

  const handleBreadcrumbExtraClick = useCallback(
    (index: number) => {
      if (index === 0) {
        // Clicked session name — drop the drill and show program overview.
        setSearchParams({ mode: 'program' })
        setDrillStackId(null)
      } else if (index === 1) {
        // Clicked mode name — already here. In program mode with a stack drilled, step back.
        if (mode === 'program' && drillStackId != null) {
          setDrillStackId(null)
        }
      }
    },
    [setSearchParams, mode, drillStackId],
  )

  // ── Mode toggle navigation ──

  const handleSwitchMode = useCallback(
    (targetMode: ShowMode) => {
      if (targetMode === mode) return
      // On Run → Program switch, drill into the active stack so the operator
      // lands on what's running rather than the session overview.
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

  // ── Session picker (no session in URL) ──

  if (!activeSession) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-3 pb-2">
          <Breadcrumbs projectName={project.name} currentPage="Show" />
        </div>
        <SessionPicker
          sessions={sessions}
          onCreateSession={handleCreateSession}
          onActivateSession={handleActivateSession}
        />
      </div>
    )
  }

  // ── Active session view ──

  return (
    <div className="flex flex-col h-full">
      {/* Header row: breadcrumbs + mode toggle + session status */}
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

          {/* Session status */}
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-green-500" />
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-destructive"
              onClick={handleDeactivateSession}
            >
              Deactivate
            </Button>
          </div>
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
          activeSession={activeSession}
          activeStackId={activeStackId}
          // Use server-tracked activeCueId so the marker reflects what's
          // currently on stage rather than the transient fade cursor —
          // runner.activeCueId clears after markDone (e.g. SNAP fades).
          activeCueId={stack?.activeCueId ?? null}
        />
      )}

      {/* ═══ Run mode ═══ */}
      {mode === 'run' && (
        <div
          ref={runnerContainerRef}
          className="flex-1 flex flex-col min-w-0 overflow-hidden"
        >
          {isNarrowRunner ? (
            <ShowRunnerMobile
              activeSession={activeSession}
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
                  {activeSession.entries.map((entry) => {
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
