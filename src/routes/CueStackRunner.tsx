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
} from '../store/cueStacks'
import { useSaveProjectCueMutation, useLazyProjectCueQuery } from '../store/cues'
import type { CueInput } from '../api/cuesApi'
import { useFxStateQuery } from '../store/fx'
import { lightingApi } from '../api/lightingApi'
import {
  go,
  back,
  resetStack,
  selectStackRunner,
} from '../store/runnerSlice'
import { useRunnerAnimation } from '../hooks/useRunnerAnimation'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { ShowBar } from '../components/runner/ShowBar'
import { CueRow } from '../components/runner/CueRow'
import { MarkerRow } from '../components/runner/MarkerRow'
import { EditorPanel } from '../components/runner/EditorPanel'
import {
  OutOfOrderBanner,
  detectOutOfOrder,
} from '../components/runner/OutOfOrderBanner'
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

  const [activeStackId, setActiveStackId] = useState<number | null>(null)
  const [editingCueId, setEditingCueId] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [dbo, setDbo] = useState(false)
  const [oooDismissed, setOooDismissed] = useState(false)
  const [ctxOverride, setCtxOverride] = useState<Record<number, 'theatre' | 'band'>>({})

  const [advanceCueStack] = useAdvanceCueStackMutation()
  const [activateCueStack] = useActivateCueStackMutation()
  const [deactivateCueStack] = useDeactivateCueStackMutation()
  const [sortByCueNumber] = useSortCueStackByCueNumberMutation()
  const [saveCue] = useSaveProjectCueMutation()
  const [fetchCue] = useLazyProjectCueQuery()
  const pendingEditsRef = useRef<Record<number, Record<string, unknown>>>({})
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Keyboard handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, [handleGo, handleBack])

  // Stack switch — deactivate old stack on the server if it was active
  const switchStack = useCallback(
    (id: number) => {
      if (activeStackId != null && stack?.activeCueId != null) {
        deactivateCueStack({ projectId: projectIdNum, stackId: activeStackId })
      }
      setActiveStackId(id)
      setEditingCueId(null)
      setEditorOpen(false)
      setOooDismissed(false)
      cancelAnimations()
    },
    [activeStackId, stack, projectIdNum, deactivateCueStack, cancelAnimations],
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

  // Row click → toggle editor
  const handleRowClick = useCallback(
    (cueId: number) => {
      if (editingCueId === cueId && editorOpen) {
        setEditorOpen(false)
      } else {
        setEditingCueId(cueId)
        setEditorOpen(true)
      }
    },
    [editingCueId, editorOpen],
  )

  // Accumulates pending field changes so rapid edits to different fields don't clobber each other.
  // The full cue is fetched once (preferring RTK cache), then all pending fields are merged into one PUT.
  const flushEdits = useCallback(
    async (cueId: number) => {
      const edits = pendingEditsRef.current[cueId]
      if (!edits || Object.keys(edits).length === 0) return
      delete pendingEditsRef.current[cueId]

      try {
        const { data: fullCue } = await fetchCue(
          { projectId: projectIdNum, cueId },
          true, // preferCacheValue
        )
        if (!fullCue) return
        const input: CueInput = {
          name: fullCue.name,
          palette: fullCue.palette,
          updateGlobalPalette: fullCue.updateGlobalPalette,
          presetApplications: fullCue.presetApplications,
          adHocEffects: fullCue.adHocEffects,
          triggers: fullCue.triggers,
          cueStackId: fullCue.cueStackId,
          sortOrder: fullCue.sortOrder,
          autoAdvance: fullCue.autoAdvance,
          autoAdvanceDelayMs: fullCue.autoAdvanceDelayMs,
          fadeDurationMs: fullCue.fadeDurationMs,
          fadeCurve: fullCue.fadeCurve,
          cueNumber: fullCue.cueNumber,
          notes: fullCue.notes,
          ...edits,
        }
        saveCue({ projectId: projectIdNum, cueId, ...input })
      } catch {
        // Silently fail — the WebSocket will reconcile state
      }
    },
    [fetchCue, saveCue, projectIdNum],
  )

  const handleFieldChange = useCallback(
    (cueId: number, field: string, value: unknown) => {
      // Accumulate edits for this cue
      if (!pendingEditsRef.current[cueId]) pendingEditsRef.current[cueId] = {}
      pendingEditsRef.current[cueId][field] = value

      // Debounce the flush
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null
        flushEdits(cueId)
      }, 400)
    },
    [flushEdits],
  )

  // Fix order
  const handleFixOrder = useCallback(() => {
    if (activeStackId == null) return
    sortByCueNumber({ projectId: projectIdNum, stackId: activeStackId })
    setOooDismissed(false)
  }, [activeStackId, projectIdNum, sortByCueNumber])

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

  const editCue = editingCueId != null ? cues.find((c) => c.id === editingCueId) ?? null : null

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2">
        <Breadcrumbs projectName={project.name} currentPage="Show" />
      </div>

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

      {/* Body: runner + editor */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Runner panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Stack tabs + context toggle */}
          <div className="flex h-[38px] shrink-0 items-center border-b bg-card">
            {stacks.map((s) => (
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
            <div className="w-[30px]" />
          </div>

          {/* Cue list */}
          <div className="flex-1 overflow-y-auto py-0.5">
            {cues.map((cue) => {
              if (cue.cueType === 'MARKER') {
                return <MarkerRow key={cue.id} name={cue.name} />
              }
              const isActive = cue.id === runner.activeCueId
              const isStandby = cue.id === runner.standbyCueId
              const isDone = runner.completedCueIds.includes(cue.id)
              const isEditing = cue.id === editingCueId && editorOpen
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
                  isEditing={isEditing}
                  isTheatre={isTheatre}
                  fadeProgress={isActive ? runner.fadeProgress : 0}
                  autoProgress={isActive ? runner.autoProgress : null}
                  onClick={() => handleRowClick(cue.id)}
                />
              )
            })}
          </div>
        </div>

        {/* Editor panel */}
        <EditorPanel
          open={editorOpen}
          cue={editCue}
          isActiveCue={editingCueId === runner.activeCueId}
          onToggle={() => setEditorOpen((o) => !o)}
          onFieldChange={handleFieldChange}
        />
      </div>
    </div>
  )
}
