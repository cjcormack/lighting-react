import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { CueStack } from '../api/cueStacksApi'
import type { ShowDetails } from '../api/showApi'
import {
  useAdvanceCueStackMutation,
  useActivateCueStackMutation,
  useGoToCueInStackMutation,
} from '../store/cueStacks'
import { useAdvanceShowMutation } from '../store/show'
import {
  go as goAction,
  back as backAction,
  resetStack,
  setStandby as setStandbyAction,
  selectStackRunner,
  runnerSlice,
} from '../store/runnerSlice'
import { useRunnerAnimation } from './useRunnerAnimation'

interface UseShowTransportArgs {
  projectId: number
  show: ShowDetails | undefined
  stacks: CueStack[] | undefined
  /** Extra gate ANDed into `goDisabled`. Prompt Book passes `canEdit`. Default true. */
  canOperate?: boolean
  /** Runs at the top of `go()` before any dispatch. Prompt Book passes `noteGo` (relock-on-GO). */
  onBeforeGo?: () => void
}

export interface ShowTransport {
  activeStackId: number | null
  activeStack: CueStack | undefined
  /** Effective active cue: the optimistic runner cursor during a fade, else the server's active cue. */
  activeCueId: number | null
  standbyCueId: number | null
  /** 0..1 while the live cue fades in, else null. */
  fadeProgress: number | null
  fadeRemainMs: number | null
  /** `!isShowActive || !canOperate` — disables the transport. */
  goDisabled: boolean
  go: () => void
  back: () => void
  setStandby: (cueId: number) => void
  cancelAnimations: () => void
}

/**
 * The "follow-server" show transport shared by the Program (Edit) and Prompt Book views: the
 * active stack is derived purely from `show.activeEntryId` (no local entry tracking, no stack
 * tabs), GO advances across stack boundaries via `advanceShow`, and the optimistic runner slice
 * drives the fade animation. This is a hook-ified lift of the block that previously lived inline
 * in PromptBookPage. The Run view deliberately does NOT use this — its manual stack-tab browsing
 * model is different code, not duplication.
 */
export function useShowTransport({
  projectId,
  show,
  stacks,
  canOperate,
  onBeforeGo,
}: UseShowTransportArgs): ShowTransport {
  const dispatch = useDispatch()

  const [advanceCueStack] = useAdvanceCueStackMutation()
  const [activateCueStack] = useActivateCueStackMutation()
  const [goToCueInStack] = useGoToCueInStackMutation()
  const [advanceShow] = useAdvanceShowMutation()

  const isShowActive = show?.activeEntryId != null

  const activeEntry = useMemo(
    () => show?.entries.find((e) => e.id === show.activeEntryId),
    [show],
  )
  const activeStackId = activeEntry?.cueStackId ?? null
  const activeStack = useMemo(
    () => stacks?.find((s) => s.id === activeStackId),
    [stacks, activeStackId],
  )

  // Consult the shared runner slice so a standby cue armed here (or on the Run page) is treated
  // as the "next" cue — the same source fireGo advances to.
  const runner = useSelector((state: { runner: ReturnType<typeof runnerSlice.getInitialState> }) =>
    selectStackRunner(state, activeStackId ?? 0),
  )

  // Live cue: the optimistic runner cursor while a fade animates, else the server's active cue.
  const activeCueId = runner.activeCueId ?? activeStack?.activeCueId ?? null

  // ── Runner ↔ server reconciliation. Init when the stack (or its cues) first load and on stack
  // switch, AND on a cue reorder/add/remove (sig changes) — but NOT on an unrelated refetch or
  // mid-fade re-render, so a user-armed standby and an in-flight fade are preserved. ──
  const stackCueSig = activeStack ? activeStack.cues.map((c) => c.id).join(',') : ''
  useEffect(() => {
    if (activeStackId != null && activeStack && activeStack.cues.length > 0) {
      dispatch(
        resetStack({
          stackId: activeStackId,
          cues: activeStack.cues,
          serverActiveCueId: activeStack.activeCueId,
          loop: activeStack.loop,
        }),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStackId, stackCueSig, dispatch])

  const prevServerActiveCueRef = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    prevServerActiveCueRef.current = undefined
  }, [activeStackId])
  useEffect(() => {
    if (activeStackId == null || !activeStack) return
    const serverActive = activeStack.activeCueId
    const prev = prevServerActiveCueRef.current
    prevServerActiveCueRef.current = serverActive
    if (prev === undefined || serverActive === prev) return
    if (runner.activeCueId != null) return
    if (activeStack.cues.length > 0) {
      dispatch(
        resetStack({
          stackId: activeStackId,
          cues: activeStack.cues,
          serverActiveCueId: serverActive,
          loop: activeStack.loop,
        }),
      )
    }
  }, [activeStackId, activeStack, runner.activeCueId, dispatch])

  // ── Fade / auto-advance animation. Keyed on runner.activeCueId, which the optimistic go()
  // below sets the instant GO is pressed. ──
  const animCue =
    runner.activeCueId != null
      ? activeStack?.cues.find((c) => c.id === runner.activeCueId)
      : undefined

  // Server call to move the backend cursor.
  const fireGoServer = useCallback(() => {
    if (activeStackId == null || !activeStack) return
    if (activeStack.activeCueId == null) {
      activateCueStack({
        projectId,
        stackId: activeStackId,
        cueId: runner.standbyCueId ?? undefined,
      })
    } else if (runner.standbyCueId != null) {
      goToCueInStack({ projectId, stackId: activeStackId, cueId: runner.standbyCueId })
    } else {
      advanceCueStack({ projectId, stackId: activeStackId, direction: 'FORWARD' })
    }
  }, [activeStackId, activeStack, activateCueStack, goToCueInStack, advanceCueStack, runner.standbyCueId, projectId])

  const handleAutoAdvanceComplete = useCallback(() => {
    if (activeStackId == null || !activeStack) return
    dispatch(goAction({ stackId: activeStackId, cues: activeStack.cues, loop: activeStack.loop }))
    fireGoServer()
  }, [activeStackId, activeStack, dispatch, fireGoServer])

  const { cancelAnimations } = useRunnerAnimation({
    stackId: activeStackId ?? 0,
    activeCueId: runner.activeCueId,
    fadeDurationMs: animCue?.fadeDurationMs ?? null,
    autoAdvance: animCue?.autoAdvance ?? false,
    autoAdvanceDelayMs: animCue?.autoAdvanceDelayMs ?? null,
    onAutoAdvanceComplete: handleAutoAdvanceComplete,
  })

  const isFadingActive = runner.activeCueId != null && runner.fadeProgress < 1
  const fadeProgress = isFadingActive ? runner.fadeProgress : null
  const fadeRemainMs = useMemo(() => {
    if (!isFadingActive || !animCue) return null
    const dur = animCue.fadeDurationMs ?? 0
    if (dur <= 0) return null
    return Math.max(0, dur * (1 - runner.fadeProgress))
  }, [isFadingActive, animCue, runner.fadeProgress])

  const go = useCallback(() => {
    onBeforeGo?.()
    // Boundary GO: nothing on deck → advance to the next STACK entry in the show.
    if (runner.standbyCueId == null) {
      if (!show || activeStackId == null) return
      const entries = show.entries ?? []
      const curIdx = entries.findIndex((e) => e.id === show.activeEntryId)
      const nextStack = entries.slice(curIdx + 1).find((e) => e.entryType === 'STACK')
      if (nextStack) {
        advanceShow({ projectId, direction: 'FORWARD' })
        cancelAnimations()
      }
      return
    }
    if (activeStackId == null || !activeStack) return
    // Optimistic go() sets runner.activeCueId → fade animates immediately; the server is told
    // in lock-step via fireGoServer.
    dispatch(goAction({ stackId: activeStackId, cues: activeStack.cues, loop: activeStack.loop }))
    fireGoServer()
  }, [onBeforeGo, runner.standbyCueId, show, activeStackId, activeStack, advanceShow, projectId, cancelAnimations, dispatch, fireGoServer])

  const back = useCallback(() => {
    if (activeStackId == null || !activeStack) return
    cancelAnimations()
    dispatch(backAction({ stackId: activeStackId, cues: activeStack.cues }))
    if (activeStack.activeCueId != null) {
      advanceCueStack({ projectId, stackId: activeStackId, direction: 'BACKWARD' })
    }
  }, [activeStackId, activeStack, cancelAnimations, dispatch, advanceCueStack, projectId])

  const setStandby = useCallback(
    (cueId: number) => {
      if (activeStackId == null || cueId === activeCueId) return
      dispatch(setStandbyAction({ stackId: activeStackId, cueId }))
    },
    [activeStackId, activeCueId, dispatch],
  )

  const goDisabled = !isShowActive || !(canOperate ?? true)

  return {
    activeStackId,
    activeStack,
    activeCueId,
    standbyCueId: runner.standbyCueId,
    fadeProgress,
    fadeRemainMs,
    goDisabled,
    go,
    back,
    setStandby,
    cancelAnimations,
  }
}
