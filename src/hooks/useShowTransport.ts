import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { CueStack } from '../api/cueStacksApi'
import {
  useAdvanceCueStackMutation,
  useActivateCueStackMutation,
  useAdvanceProgramMutation,
  useSetCueStackStandbyMutation,
} from '../store/cueStacks'
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
  /** The project's live stack (the show playhead), or null when the show is not running. */
  activeStackId: number | null
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
 * active stack is the project playhead (`activeStackId`, passed in from `projectProgramState`),
 * GO advances across stack boundaries via `advanceProgram`, and the optimistic runner slice
 * drives the fade animation. This is a hook-ified lift of the block that previously lived inline
 * in PromptBookPage. The Run view deliberately does NOT use this — its manual stack-tab browsing
 * model is different code, not duplication.
 */
export function useShowTransport({
  projectId,
  activeStackId,
  stacks,
  canOperate,
  onBeforeGo,
}: UseShowTransportArgs): ShowTransport {
  const dispatch = useDispatch()

  const [advanceCueStack] = useAdvanceCueStackMutation()
  const [activateCueStack] = useActivateCueStackMutation()
  const [advanceProgram] = useAdvanceProgramMutation()
  const [setCueStackStandby] = useSetCueStackStandbyMutation()

  const isShowActive = activeStackId != null

  const activeStack = useMemo(
    () => (activeStackId != null ? stacks?.find((s) => s.id === activeStackId) : undefined),
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
          serverNextCueId: activeStack.nextCueId,
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
          serverNextCueId: activeStack.nextCueId,
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

  // Server call to move the backend cursor. No standby branch any more: the backend owns the
  // armed cue, so `advance` FORWARD fires whatever is on deck. A stopped stack still needs
  // `activate`, which starts on the armed cue too.
  const fireGoServer = useCallback(() => {
    if (activeStackId == null || !activeStack) return
    if (activeStack.activeCueId == null) {
      activateCueStack({ projectId, stackId: activeStackId })
    } else {
      advanceCueStack({ projectId, stackId: activeStackId, direction: 'FORWARD' })
    }
  }, [activeStackId, activeStack, activateCueStack, advanceCueStack, projectId])

  // The *display* of auto-advance completing. The backend runs its own auto-advance timer and
  // fires the next cue itself, then broadcasts — so calling the server here as well would step
  // the stack once per open session.
  const handleAutoAdvanceComplete = useCallback(() => {}, [])

  const { cancelAnimations } = useRunnerAnimation({
    stackId: activeStackId ?? 0,
    activeCueId: runner.activeCueId,
    fadeDurationMs: animCue?.fadeDurationMs ?? null,
    // The server's view, not the cue's flag: a paused timer (cue-edit Live session, surface
    // Pause) leaves a cue configured for auto-advance that will not advance. Falls back to the
    // cue while no frame has arrived yet.
    autoAdvance: runner.serverAutoAdvance ?? animCue?.autoAdvance ?? false,
    autoAdvanceDelayMs: runner.serverAutoAdvanceDelayMs ?? animCue?.autoAdvanceDelayMs ?? null,
    startElapsedMs: runner.fadeStartElapsedMs,
    transitionSeq: runner.serverTransition,
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
    // Boundary GO: nothing on deck → advance to the next runnable stack in show order.
    if (runner.standbyCueId == null) {
      if (activeStackId == null || !stacks) return
      const runnable = stacks.filter((s) => s.type === 'STACK')
      const curIdx = runnable.findIndex((s) => s.id === activeStackId)
      const nextStack = curIdx >= 0 ? runnable[curIdx + 1] : undefined
      if (nextStack) {
        advanceProgram({ projectId, direction: 'FORWARD' })
        cancelAnimations()
      }
      return
    }
    if (activeStackId == null || !activeStack) return
    // Optimistic go() sets runner.activeCueId → fade animates immediately; the server is told
    // in lock-step via fireGoServer.
    dispatch(goAction({ stackId: activeStackId, cues: activeStack.cues, loop: activeStack.loop }))
    fireGoServer()
  }, [onBeforeGo, runner.standbyCueId, stacks, activeStackId, activeStack, advanceProgram, projectId, cancelAnimations, dispatch, fireGoServer])

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
      // Local dispatch for an instant highlight; the POST is what makes the desk, the tablet and
      // the MIDI surface agree on what GO will fire.
      dispatch(setStandbyAction({ stackId: activeStackId, cueId }))
      setCueStackStandby({ projectId, stackId: activeStackId, cueId })
    },
    [activeStackId, activeCueId, dispatch, setCueStackStandby, projectId],
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
