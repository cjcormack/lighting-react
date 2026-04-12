import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { Card } from '@/components/ui/card'
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
import type { CueInput, Cue } from '../api/cuesApi'
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

  // Tab state
  const [activeTab, setActiveTab] = useState<'program' | 'show'>('show')

  // Shared stack state — synced between tabs
  const [activeStackId, setActiveStackId] = useState<number | null>(null)
  const [drillStackId, setDrillStackId] = useState<number | null>(null)

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


  // Auto-select first stack
  useEffect(() => {
    if (stacks && stacks.length > 0 && activeStackId == null) {
      setActiveStackId(stacks[0].id)
    }
  }, [stacks, activeStackId])

  const stack: CueStack | undefined = useMemo(
    () => stacks?.find((s) => s.id === activeStackId),
    [stacks, activeStackId],
  )

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

  // GO handler
  const handleGo = useCallback(() => {
    if (activeStackId == null || !stack) return
    if (runner.standbyCueId == null) return
    dispatch(go({ stackId: activeStackId, cues, loop: stack.loop }))
    fireGo()
  }, [activeStackId, stack, cues, runner.standbyCueId, dispatch, fireGo])

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

  // Stack switch — deactivate old stack on the server if it was active.
  // Also syncs drillStackId so Program tab follows.
  const switchStack = useCallback(
    (id: number) => {
      if (activeStackId != null && stack?.activeCueId != null) {
        deactivateCueStack({ projectId: projectIdNum, stackId: activeStackId })
      }
      setActiveStackId(id)
      setDrillStackId(id)
      setOooDismissed(false)
      cancelAnimations()
    },
    [activeStackId, stack, projectIdNum, deactivateCueStack, cancelAnimations],
  )

  // When Program tab drills into a stack, also update activeStackId so Show tab follows.
  const handleDrillStack = useCallback(
    (id: number | null) => {
      setDrillStackId(id)
      if (id != null) setActiveStackId(id)
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
      </div>

      {/* ═══ Program tab ═══ */}
      {activeTab === 'program' && (
        <ProgramView
          projectId={projectIdNum}
          stacks={stacks ?? []}
          drillStackId={drillStackId}
          onDrillStack={handleDrillStack}
          onSwitchToShow={() => setActiveTab('show')}
          onOpenCueForm={openCueForm}
        />
      )}

      {/* ═══ Show tab ═══ */}
      {activeTab === 'show' && (
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
            onGo={handleGo}
            onBack={handleBack}
          />

          {/* Runner body */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Stack tabs + context toggle */}
            <div className="flex h-[38px] shrink-0 items-center border-b bg-card">
              {stacks?.map((s) => (
                <button
                  key={s.id}
                  onClick={() => switchStack(s.id)}
                  className={cn(
                    'flex items-center gap-2 px-5 h-full border-r text-[12px] font-bold tracking-[0.12em] uppercase text-muted-foreground/25 transition-colors relative shrink-0',
                    'hover:text-muted-foreground/50 hover:bg-muted/10',
                    s.id === activeStackId &&
                      'text-muted-foreground/70 bg-muted/20 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary',
                  )}
                >
                  {s.name}
                  {s.loop && <span className="text-base text-muted-foreground/25">{s.id === activeStackId ? <RotateCcw className="size-3 text-muted-foreground/50" /> : <RotateCcw className="size-3" />}</span>}
                </button>
              ))}
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
