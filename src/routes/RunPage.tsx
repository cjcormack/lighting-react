import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  useSaveProjectCueMutation,
  useLazyProjectCueQuery,
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
  setStandby,
  selectStackRunner,
} from '../store/runnerSlice'
import { useRunnerAnimation } from '../hooks/useRunnerAnimation'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { ShowBar } from '../components/runner/ShowBar'
import { CueRow } from '../components/runner/CueRow'
import { MarkerRow } from '../components/runner/MarkerRow'
import {
  OutOfOrderBanner,
  detectOutOfOrder,
} from '../components/runner/OutOfOrderBanner'
import { CueEditor } from '../components/cues/editor/CueEditor'
import { CueDetailSheet } from '../components/cues/CueDetailSheet'
import { CueDetailContent } from '../components/cues/CueDetailContent'
import {
  ShowRunnerMobile,
  type RunnerDisplayState,
} from '../components/runner/ShowRunnerMobile'
import { useNarrowContainer } from '../hooks/useNarrowContainer'
import { useMediaQuery, XL_BREAKPOINT } from '../hooks/useMediaQuery'
import type { CueStack, CueStackCueEntry } from '../api/cueStacksApi'

const EMPTY_CUES: CueStackCueEntry[] = []

// Below this container width, the runner swaps to the remote-control layout.
// Threshold reacts to the runner body's own width, so side panels squeezing the
// runner on desktop flip to the compact layout too.
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

  // Active entry drives which stack is shown. When the show isn't active, default
  // to the first STACK so the stack tabs still have a useful selection.
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null)

  const activeEntry: ShowEntryDto | undefined = useMemo(
    () => show?.entries.find((e) => e.id === activeEntryId),
    [show, activeEntryId],
  )
  const activeStackId = activeEntry?.cueStackId ?? null

  const [dbo, setDbo] = useState(false)
  const [oooDismissed, setOooDismissed] = useState(false)
  const [ctxOverride, setCtxOverride] = useState<Record<number, 'theatre' | 'band'>>({})
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)

  // CueEditor sheet state — used only for mobile cue-list edits
  const [cueEditorOpen, setCueEditorOpen] = useState(false)
  const [cueEditorCueId, setCueEditorCueId] = useState<number | null>(null)
  const [cueEditorCue, setCueEditorCue] = useState<Cue | null>(null)

  // Read-only cue detail panel. 'active' = follow active cue (default),
  // 'standby' = follow next cue, number = pinned to a specific cue.
  const [detailCue, setDetailCue] = useState<Cue | null>(null)
  const [detailMode, setDetailMode] = useState<'active' | 'standby' | number>('active')

  // Scroll save/restore around the CueEditor sheet
  const listScrollRef = useRef<HTMLDivElement>(null)
  const savedScrollPos = useRef(0)

  // When the user manually switches stacks via the tab strip, we want the
  // first cue to appear as standby (blue) — not activate it. This ref tells
  // the resetStack effect to ignore the server's activeCueId on the next
  // stack change so it starts fresh with standby = first cue.
  const manualSwitchRef = useRef(false)

  const [runnerContainerRef, isNarrowRunner] = useNarrowContainer(MOBILE_RUNNER_THRESHOLD)
  const isWideViewport = useMediaQuery(XL_BREAKPOINT)
  const showInlineDetail = isWideViewport && !isNarrowRunner

  const [advanceCueStack] = useAdvanceCueStackMutation()
  const [activateCueStack] = useActivateCueStackMutation()
  const [deactivateCueStack] = useDeactivateCueStackMutation()
  const [goToCueInStack] = useGoToCueInStackMutation()
  const [sortByCueNumber] = useSortCueStackByCueNumberMutation()
  const [saveCue] = useSaveProjectCueMutation()
  const [fetchCue] = useLazyProjectCueQuery()

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
  // On a manual tab switch (manualSwitchRef), skip serverActiveCueId so the
  // first cue lands as standby rather than being treated as already-active.
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
  // When another browser presses GO, the WS-triggered cue stack refetch
  // updates stack.activeCueId in the RTK Query cache. This effect syncs
  // the runner slice to match. Skips reconciliation while mid-fade
  // (runner.activeCueId is set) to avoid killing local animations.
  const prevServerActiveCueRef = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    prevServerActiveCueRef.current = undefined
  }, [activeStackId])

  useEffect(() => {
    if (activeStackId == null || !stack) return

    const serverActive = stack.activeCueId
    const prev = prevServerActiveCueRef.current
    prevServerActiveCueRef.current = serverActive

    // First render after mount or stack switch — initial resetStack handles it
    if (prev === undefined) return

    // No change
    if (serverActive === prev) return

    // Don't reset while mid-fade — we're the browser driving the change
    if (runner.activeCueId != null) return

    // Server active cue changed while we're idle — another browser pressed GO
    if (cues.length > 0) {
      dispatch(resetStack({
        stackId: activeStackId,
        cues,
        serverActiveCueId: serverActive,
        loop: stack.loop,
      }))
    }
  }, [activeStackId, stack?.activeCueId, runner.activeCueId, cues, dispatch, stack?.loop])

  // The "active" cue comes from two sources:
  // 1. runner.activeCueId — the transient fade cursor (set during GO, cleared by markDone)
  // 2. stack.activeCueId — the server-tracked cue currently on stage
  // For SNAP cues (no fade), (1) clears within a single frame, so (2) is the
  // only reliable indicator of what's on stage. Combining both ensures the
  // green active highlight persists after a SNAP completes.
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
      // Use go-to with the explicit standby cue id so a re-queued cue (set by
      // clicking a cue row) fires the right target. When standby is the
      // "natural next", this still works the same — it's just more explicit
      // than advance().
      goToCueInStack({
        projectId: projectIdNum,
        stackId: activeStackId,
        cueId: runner.standbyCueId,
      })
    } else {
      // Fallback: no standby (shouldn't happen when an active cue exists in a
      // non-empty stack) — defer to backend advance.
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

  const runnerDisplay: RunnerDisplayState = {
    activeCue,
    standbyCue,
    nextStackEntry,
    fadeProgress: runner.fadeProgress,
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

  // Keyboard handler — Space/ArrowLeft. Only mounted on Run so no mode guard needed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShowActive) return
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
  }, [handleGo, handleBack, isShowActive])

  const handleSwitchToEntry = useCallback(
    (entry: ShowEntryDto) => {
      if (entry.entryType !== 'STACK' || entry.cueStackId == null) return
      if (entry.id === activeEntryId) return // already on this tab
      manualSwitchRef.current = true
      if (activeStackId != null && stack?.activeCueId != null) {
        deactivateCueStack({ projectId: projectIdNum, stackId: activeStackId })
      }
      // go-to updates activeEntryId on the server (cross-browser sync) but also
      // activates the new stack's first cue. Deactivate the new stack afterward
      // so the cue isn't fired until the operator presses GO.
      goToEntry({
        projectId: projectIdNum,
        entryId: entry.id,
      })
        .unwrap()
        .then(() => {
          deactivateCueStack({ projectId: projectIdNum, stackId: entry.cueStackId! })
        })
        .catch(() => {
          // Silently fail — clear the ref so a stale flag can't leak
          manualSwitchRef.current = false
        })
      setActiveEntryId(entry.id)
      setOooDismissed(false)
      cancelAnimations()
    },
    [activeEntryId, activeStackId, stack, projectIdNum, deactivateCueStack, goToEntry, cancelAnimations],
  )

  const isTheatre = ctxOverride[activeStackId ?? 0] !== 'band'
  const toggleCtx = (val: 'theatre' | 'band') => {
    if (activeStackId != null) {
      setCtxOverride((p) => ({ ...p, [activeStackId]: val }))
    }
  }

  const ooo = isTheatre && !oooDismissed && detectOutOfOrder(cues)

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
      .catch(() => {
        // Silently fail
      })
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

  // Jump into Program with the live cue pre-loaded for editing. Used by the
  // header "Edit Cue" button — operator hits a problem mid-show and wants to
  // tweak the running cue without re-navigating to find it.
  const handleEditActiveCueInProgram = useCallback(() => {
    if (activeStackId == null) return
    const cueId = stack?.activeCueId ?? runner.activeCueId
    const params = new URLSearchParams({ stack: String(activeStackId) })
    if (cueId != null) params.set('cue', String(cueId))
    navigate(`/projects/${projectIdNum}/program?${params.toString()}`)
  }, [activeStackId, stack, runner.activeCueId, navigate, projectIdNum])

  // ── Cue detail panel helpers ──

  // The detail cue ID to display, derived from detailMode.
  const detailTargetCueId =
    detailMode === 'active' ? (effectiveActiveCueId ?? null) :
    detailMode === 'standby' ? (runner.standbyCueId ?? null) :
    detailMode // numeric pinned ID
  const lastDetailFetchRef = useRef<number | null>(null)

  // Auto-fetch the detail cue when the inline panel is visible and the target changes.
  useEffect(() => {
    if (!showInlineDetail) return
    if (detailTargetCueId == null || detailTargetCueId === lastDetailFetchRef.current) return
    lastDetailFetchRef.current = detailTargetCueId
    fetchCue({ projectId: projectIdNum, cueId: detailTargetCueId }, true)
      .then(({ data }) => {
        if (data && lastDetailFetchRef.current === detailTargetCueId) setDetailCue(data)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInlineDetail, detailTargetCueId])

  /** Eye-icon click: switch detail mode based on which cue was clicked. */
  const openCueDetail = useCallback(
    (cueId: number) => {
      if (cueId === effectiveActiveCueId) {
        setDetailMode('active')
      } else if (cueId === runner.standbyCueId) {
        setDetailMode('standby')
      } else {
        setDetailMode(cueId)
      }
    },
    [effectiveActiveCueId, runner.standbyCueId],
  )

  // Reset to follow-active when the stack changes.
  useEffect(() => {
    setDetailMode('active')
  }, [activeStackId])

  // ── Cue row interaction handlers ──

  /** From the detail sheet/panel's Edit button — route to the cue editor in Program view. */
  const handleDetailEdit = useCallback(() => {
    if (detailCue == null || activeStackId == null) return
    const params = new URLSearchParams({
      stack: String(activeStackId),
      cue: String(detailCue.id),
    })
    navigate(`/projects/${projectIdNum}/program?${params.toString()}`)
  }, [detailCue, activeStackId, navigate, projectIdNum])

  /** Click on a cue row: re-queue it as the next GO target. */
  const handleCueClick = useCallback(
    (cueId: number) => {
      if (activeStackId == null) return
      if (cueId === effectiveActiveCueId) return // active — use eye icon for detail
      if (cueId === runner.standbyCueId) return // already queued
      dispatch(setStandby({ stackId: activeStackId, cueId }))
    },
    [activeStackId, effectiveActiveCueId, runner.standbyCueId, dispatch],
  )

  /** Mobile cue-list tap: re-queue the cue without opening a detail sheet. */
  const handleRequeueCue = useCallback(
    (cueId: number) => {
      if (activeStackId == null) return
      if (cueId === effectiveActiveCueId || cueId === runner.standbyCueId) return
      dispatch(setStandby({ stackId: activeStackId, cueId }))
    },
    [activeStackId, effectiveActiveCueId, runner.standbyCueId, dispatch],
  )

  // ── CueEditor handlers (mobile cue-list) ──

  const openCueEditor = useCallback(
    async (_stackId: number, cueId: number) => {
      if (listScrollRef.current) {
        savedScrollPos.current = listScrollRef.current.scrollTop
      }
      try {
        const { data: fullCue } = await fetchCue({ projectId: projectIdNum, cueId }, true)
        if (fullCue) {
          setCueEditorCue(fullCue)
          setCueEditorCueId(cueId)
          setCueEditorOpen(true)
        }
      } catch {
        // Silently fail
      }
    },
    [fetchCue, projectIdNum],
  )

  const handleCueEditorSave = useCallback(
    async (input: CueInput) => {
      if (cueEditorCueId == null) return
      await saveCue({ projectId: projectIdNum, cueId: cueEditorCueId, ...input }).unwrap()
    },
    [cueEditorCueId, saveCue, projectIdNum],
  )

  const handleCueEditorClose = useCallback((open: boolean) => {
    setCueEditorOpen(open)
    if (!open) {
      requestAnimationFrame(() => {
        if (listScrollRef.current) {
          listScrollRef.current.scrollTop = savedScrollPos.current
        }
      })
    }
  }, [])

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
      {/* Header row — always one line; button labels hide at narrow widths
          so the row never has to wrap. Tooltip provides the affordance when
          the label is hidden. */}
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
            <ShowRunnerMobile
              show={show!}
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
              onRequeueCue={handleRequeueCue}
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

                {/* Cue list + optional inline detail panel */}
                <div className="flex-1 flex min-h-0">
                  {/* Cue list column */}
                  <div className="flex-1 flex flex-col min-w-0">
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

                    {/* Scrollable cue rows */}
                    <div className="flex-1 overflow-y-auto py-0.5" ref={listScrollRef}>
                      {cues.map((cue) => {
                        if (cue.cueType === 'MARKER') {
                          return <MarkerRow key={cue.id} name={cue.name} />
                        }
                        const isActive = cue.id === effectiveActiveCueId
                        const isStandby = cue.id === runner.standbyCueId
                        const isDone = completedSet.has(cue.id)
                        const isFading = cue.id === runner.activeCueId ||
                          (cue.id === effectiveActiveCueId && runner.fadeProgress > 0)
                        return (
                          <CueRow
                            key={cue.id}
                            cueId={cue.id}
                            cueNumber={cue.cueNumber}
                            name={cue.name}
                            fadeDurationMs={cue.fadeDurationMs}
                            fadeCurve={cue.fadeCurve}
                            autoAdvance={cue.autoAdvance}
                            notes={cue.notes}
                            isActive={isActive}
                            isStandby={isStandby}
                            isDone={isDone}
                            isTheatre={isTheatre}
                            fadeProgress={isFading ? runner.fadeProgress : 0}
                            autoProgress={isFading ? runner.autoProgress : null}
                            onClick={() => handleCueClick(cue.id)}
                            onView={() => openCueDetail(cue.id)}
                            isViewing={detailCue?.id === cue.id}
                          />
                        )
                      })}
                    </div>
                  </div>

                  {/* Inline detail panel (wide viewports only, always visible) */}
                  {showInlineDetail && (
                    <div className="w-80 shrink-0 border-l flex flex-col overflow-hidden bg-background">
                      {detailCue ? (
                        <>
                          <div className="flex items-center justify-between px-3 py-2 border-b shrink-0 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium truncate">{detailCue.name}</span>
                              {detailCue.cueNumber && (
                                <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                                  Q{detailCue.cueNumber}
                                </Badge>
                              )}
                              {detailMode === 'active' && (
                                <Badge variant="secondary" className="text-[10px] shrink-0">
                                  Active
                                </Badge>
                              )}
                              {detailMode === 'standby' && (
                                <Badge variant="secondary" className="text-[10px] shrink-0 border-blue-500/30 text-blue-400 bg-blue-500/10">
                                  Next
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 shrink-0"
                              onClick={handleDetailEdit}
                              title="Edit in Program"
                            >
                              <Pencil className="size-3" />
                            </Button>
                          </div>
                          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                            <CueDetailContent
                              cue={detailCue}
                              projectId={projectIdNum}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center p-4">
                          <p className="text-sm text-muted-foreground">No cue selected</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* CueEditor sheet (opened from MobileCueListSheet) */}
      <CueEditor
        open={cueEditorOpen}
        onOpenChange={handleCueEditorClose}
        cue={cueEditorCue}
        projectId={projectIdNum}
        onSave={handleCueEditorSave}
        isInStack
        mode="sheet"
        defaultEditMode="live"
      />

      {/* Read-only cue detail sheet (narrow viewports only — inline panel used on wide) */}
      <CueDetailSheet
        open={detailCue != null && !showInlineDetail}
        onOpenChange={(open) => { if (!open) { setDetailCue(null); setDetailMode('active') } }}
        cue={detailCue}
        projectId={projectIdNum}
        onEdit={handleDetailEdit}
      />

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
