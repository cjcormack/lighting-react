import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import type { CueStack } from '../api/cueStacksApi'

// Redirect component for /cue-stacks route
export function CueStackRunnerRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/cue-stacks`, { replace: true })
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

// Main route component
export function ProjectCueStackRunner() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const dispatch = useDispatch()
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: stacks, isLoading: stacksLoading } = useProjectCueStackListQuery(projectIdNum)
  const { data: fxState } = useFxStateQuery()
  const { data: sessions } = useProjectShowSessionListQuery(projectIdNum)

  // Tab state
  const [activeTab, setActiveTab] = useState<'program' | 'show'>('show')

  // Session-driven active stack — activeEntryId drives which stack is active
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null)
  const [drillStackId, setDrillStackId] = useState<number | null>(null)
  const [newSessionName, setNewSessionName] = useState('')

  // Derive active session from local ID
  const activeSession = useMemo(
    () => (activeSessionId != null ? sessions?.find((s) => s.id === activeSessionId) : undefined) ?? undefined,
    [sessions, activeSessionId],
  )

  // Auto-pick previously-active session on initial load
  useEffect(() => {
    if (activeSessionId != null || !sessions || sessions.length === 0) return
    const prev = sessions.find((s) => s.activeEntryId != null)
    if (prev) setActiveSessionId(prev.id)
  }, [sessions, activeSessionId])
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

  // Subscribe to showSessionChanged WS events for real-time activeEntryId updates
  useEffect(() => {
    const sub = lightingApi.showSessions.subscribeToChanged((event) => {
      if (activeSession && event.sessionId === activeSession.id) {
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

  // Initialize runner state when stack changes — seed from server's activeCueId if available
  useEffect(() => {
    if (activeStackId != null && cues.length > 0) {
      dispatch(resetStack({
        stackId: activeStackId,
        cues,
        serverActiveCueId: stack?.activeCueId,
        loop: stack?.loop,
      }))
    }
    // Intentionally only depends on activeStackId — we want to reset state when the user
    // switches stacks, NOT when cues/stack refresh from WebSocket (which would wipe mid-run state).
    // The closures over cues, stack.activeCueId, and stack.loop are read only on mount/stack-switch.
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
      // Stack not yet active on the server — activate it with the standby cue
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
        // Optimistically update — WS event will confirm
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
    // Only send backend call if the stack is active on the server
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

  // Keyboard handler — only when on Show tab
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activeTab !== 'show') return
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
  }, [handleGo, handleBack, activeTab])

  // Switch to a session entry (Show tab strip click)
  const handleSwitchToEntry = useCallback(
    (entry: ShowSessionEntryDto) => {
      if (entry.entryType !== 'STACK' || entry.cueStackId == null) return
      // Deactivate old stack on the server if it was active
      if (activeStackId != null && stack?.activeCueId != null) {
        deactivateCueStack({ projectId: projectIdNum, stackId: activeStackId })
      }
      // Tell the backend to go to this entry
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

  // When Program tab drills into a stack, set drillStackId.
  // activeStackId is now session-driven, so we don't update it here.
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

  // Fix order
  const handleFixOrder = useCallback(() => {
    if (activeStackId == null) return
    sortByCueNumber({ projectId: projectIdNum, stackId: activeStackId })
    setOooDismissed(false)
  }, [activeStackId, projectIdNum, sortByCueNumber])

  // ── Session management handlers ──

  const handleCreateSession = useCallback(async () => {
    const name = newSessionName.trim()
    if (!name) return
    try {
      const result = await createSession({ projectId: projectIdNum, name }).unwrap()
      setNewSessionName('')
      // Set as active locally (no backend activate — session has no entries yet)
      setActiveSessionId(result.id)
      setActiveEntryId(null)
      setDrillStackId(null)
      setActiveTab('program')
    } catch {
      // Silently fail
    }
  }, [newSessionName, createSession, projectIdNum])

  const handleActivateSession = useCallback(
    (sessionId: number) => {
      const session = sessions?.find((s) => s.id === sessionId)
      setActiveSessionId(sessionId)
      setDrillStackId(null)
      // If session has entries, try activating on the backend too
      if (session && session.entries.length > 0) {
        activateSessionMut({ projectId: projectIdNum, sessionId })
          .unwrap()
          .then((result) => setActiveEntryId(result.activeEntryId))
          .catch(() => {
            // Backend activation failed — still set entry from session data
            const firstStack = session.entries.find((e) => e.entryType === 'STACK')
            setActiveEntryId(firstStack?.id ?? null)
          })
      } else {
        setActiveEntryId(session?.activeEntryId ?? null)
      }
    },
    [sessions, activateSessionMut, projectIdNum],
  )

  const handleDeactivateSession = useCallback(async () => {
    if (!activeSession) return
    // Deactivate on the backend if the session was activated
    if (activeSession.activeEntryId != null) {
      try {
        await deactivateSessionMut({ projectId: projectIdNum, sessionId: activeSession.id }).unwrap()
      } catch {
        // Silently fail
      }
    }
    setActiveSessionId(null)
    setActiveEntryId(null)
  }, [activeSession, deactivateSessionMut, projectIdNum])

  // ── CueForm sheet handlers ──

  const openCueForm = useCallback(
    async (stackId: number, cueId: number) => {
      // Save scroll position if coming from Show tab
      if (activeTab === 'show' && listScrollRef.current) {
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
    [activeTab, fetchCue, projectIdNum],
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
        // Restore scroll position if we came from Show tab
        if (activeTab === 'show') {
          requestAnimationFrame(() => {
            if (listScrollRef.current) {
              listScrollRef.current.scrollTop = savedScrollPos.current
            }
          })
        }
      }
    },
    [activeTab],
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
      // Close current sheet and open the duplicate
      setCueFormOpen(false)
      // Small delay to let sheet close animation finish
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

  // Loading / redirect guards
  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    return <Navigate to={`/projects/${currentProject.id}/cue-stacks`} replace />
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

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2">
        <Breadcrumbs projectName={project.name} currentPage="Show" />
      </div>

      {/* Top tab bar: Program / Show + session name */}
      <div className="flex items-stretch h-10 border-b bg-card/80 shrink-0">
        <button
          className={cn(
            'flex items-center px-6 border-r text-[12px] font-bold tracking-[0.12em] uppercase text-muted-foreground/25 transition-colors relative',
            'hover:text-muted-foreground/50 hover:bg-muted/10',
            activeTab === 'program' &&
              'text-muted-foreground/70 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary',
          )}
          onClick={() => setActiveTab('program')}
        >
          Program
        </button>
        <button
          className={cn(
            'flex items-center px-6 border-r text-[12px] font-bold tracking-[0.12em] uppercase text-muted-foreground/25 transition-colors relative',
            'hover:text-muted-foreground/50 hover:bg-muted/10',
            activeTab === 'show' &&
              'text-muted-foreground/70 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary',
          )}
          onClick={() => setActiveTab('show')}
        >
          Show
        </button>
        <div className="flex-1" />
        {activeSession && (
          <>
            <button
              className="flex items-center px-3.5 border-l text-[10px] font-bold tracking-[0.1em] uppercase text-muted-foreground/25 hover:text-destructive/60 transition-colors"
              onClick={handleDeactivateSession}
            >
              Deactivate
            </button>
            <div className="flex items-center px-4 gap-1.5 text-[11px] text-muted-foreground/30">
              <div className="size-1.5 rounded-full bg-green-500" />
              {activeSession.name}
            </div>
          </>
        )}
      </div>

      {/* ═══ Session picker (no active session) ═══ */}
      {!activeSession && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
          <div className="w-full max-w-[480px] mb-2">
            <h2 className="text-lg font-bold text-muted-foreground/50 tracking-[0.06em] uppercase">
              Choose Session
            </h2>
          </div>
          <div className="flex gap-2 w-full max-w-[480px]">
            <Input
              className="flex-1"
              placeholder="New session name..."
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSession()}
              autoFocus
            />
            <Button
              variant="outline"
              className="font-bold tracking-wider text-green-400 border-green-500/30 bg-green-950/40 hover:bg-green-900/50 hover:text-green-300 shrink-0"
              onClick={handleCreateSession}
              disabled={!newSessionName.trim()}
            >
              Create
            </Button>
          </div>
          {sessions && sessions.length > 0 && (
            <>
              <div className="flex items-center gap-2.5 w-full max-w-[480px] my-1">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[9px] font-bold tracking-[0.13em] uppercase text-muted-foreground/20">
                  or resume existing
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <div className="w-full max-w-[480px] flex flex-col gap-2">
                {sessions.map((s) => {
                  const stackCount = s.entries.filter((e) => e.entryType === 'STACK').length
                  return (
                    <div
                      key={s.id}
                      className="flex items-center px-4 py-3.5 bg-card border rounded-md gap-3.5 hover:bg-muted/20 hover:border-muted-foreground/20 transition-colors"
                    >
                      <span className="flex-1 text-[15px] font-semibold text-muted-foreground/60">
                        {s.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground/30 shrink-0">
                        {stackCount} stack{stackCount !== 1 ? 's' : ''}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-bold tracking-wider text-green-400 border-green-500/30 bg-green-950/40 hover:bg-green-900/50 hover:text-green-300 shrink-0"
                        onClick={() => handleActivateSession(s.id)}
                      >
                        Activate
                      </Button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ Program tab ═══ */}
      {activeSession && activeTab === 'program' && (
        <ProgramView
          projectId={projectIdNum}
          stacks={stacks ?? []}
          drillStackId={drillStackId}
          onDrillStack={handleDrillStack}
          onSwitchToShow={() => setActiveTab('show')}
          onOpenCueForm={openCueForm}
          activeSession={activeSession}
        />
      )}

      {/* ═══ Show tab ═══ */}
      {activeSession && activeTab === 'show' && (
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
            <div className="flex h-[38px] shrink-0 items-center border-b bg-card">
              {activeSession.entries.map((entry) => {
                if (entry.entryType === 'MARKER') {
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center h-full px-2 gap-1.5 shrink-0 pointer-events-none"
                    >
                      <div className="w-px h-4 bg-border/30" />
                      <span className="text-[9px] font-bold tracking-[0.13em] uppercase text-muted-foreground/15 whitespace-nowrap">
                        {entry.label}
                      </span>
                      <div className="w-px h-4 bg-border/30" />
                    </div>
                  )
                }
                const entryStack = entry.cueStackId != null ? stackMap.get(entry.cueStackId) : undefined
                return (
                  <button
                    key={entry.id}
                    onClick={() => handleSwitchToEntry(entry)}
                    className={cn(
                      'flex items-center gap-2 px-5 h-full border-r text-[12px] font-bold tracking-[0.12em] uppercase text-muted-foreground/25 transition-colors relative shrink-0',
                      'hover:text-muted-foreground/50 hover:bg-muted/10',
                      entry.id === activeEntryId &&
                        'text-muted-foreground/70 bg-muted/20 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary',
                    )}
                  >
                    {entry.cueStackName}
                    {entryStack?.loop && (
                      <span className="text-base text-muted-foreground/25">
                        {entry.id === activeEntryId ? (
                          <RotateCcw className="size-3 text-muted-foreground/50" />
                        ) : (
                          <RotateCcw className="size-3" />
                        )}
                      </span>
                    )}
                  </button>
                )
              })}
              <div className="flex-1" />
              <div className="flex items-center mr-3.5">
                <button
                  onClick={() => toggleCtx('theatre')}
                  className={cn(
                    'h-[26px] px-3 text-[10px] font-bold tracking-wider uppercase border border-border bg-card text-muted-foreground/25 transition-colors rounded-l-sm',
                    isTheatre && 'bg-muted/30 text-muted-foreground/60 border-muted-foreground/20',
                  )}
                >
                  Theatre
                </button>
                <button
                  onClick={() => toggleCtx('band')}
                  className={cn(
                    'h-[26px] px-3 text-[10px] font-bold tracking-wider uppercase border border-l-0 border-border bg-card text-muted-foreground/25 transition-colors rounded-r-sm',
                    !isTheatre && 'bg-muted/30 text-muted-foreground/60 border-muted-foreground/20',
                  )}
                >
                  Band
                </button>
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
            <div className="flex items-center h-6 pl-4 border-b bg-card shrink-0">
              <div className="w-5" />
              {isTheatre && (
                <div className="w-12 text-[9px] font-bold tracking-[0.13em] uppercase text-muted-foreground/20">
                  Q
                </div>
              )}
              <div className="flex-1 text-[9px] font-bold tracking-[0.13em] uppercase text-muted-foreground/20">
                Name
              </div>
              <div className="w-[86px] text-right pr-2 text-[9px] font-bold tracking-[0.13em] uppercase text-muted-foreground/20">
                Fade
              </div>
              <div className="w-9" />
              {isTheatre && (
                <div className="w-[200px] pl-3 text-[9px] font-bold tracking-[0.13em] uppercase text-muted-foreground/20">
                  Note
                </div>
              )}
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

      {/* CueForm sheet (shared across both tabs) */}
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
