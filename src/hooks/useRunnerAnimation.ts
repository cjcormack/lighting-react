import { useRef, useCallback, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { setFadeProgress, setAutoProgress, markDone } from '../store/runnerSlice'

interface UseRunnerAnimationOptions {
  stackId: number
  activeCueId: number | null
  fadeDurationMs: number | null
  autoAdvance: boolean
  autoAdvanceDelayMs: number | null
  /**
   * How far into the fade to start, in ms. Non-zero when the server told us about a fade
   * already in progress — another surface's GO that reached us a moment late, or a session
   * that connected mid-fade. Defaults to 0, which is the local-GO case.
   */
  startElapsedMs?: number
  /**
   * Changes on every server-reported transition. Part of the effect key alongside
   * `activeCueId`, so re-firing the cue that is already live restarts its fade.
   */
  transitionSeq?: number
  onAutoAdvanceComplete: () => void
}

export function useRunnerAnimation({
  stackId,
  activeCueId,
  fadeDurationMs,
  autoAdvance,
  autoAdvanceDelayMs,
  startElapsedMs = 0,
  transitionSeq = 0,
  onAutoAdvanceComplete,
}: UseRunnerAnimationOptions) {
  const dispatch = useDispatch()
  const fadeFrameRef = useRef<number | null>(null)
  const autoFrameRef = useRef<number | null>(null)

  // Capture latest values in refs so the rAF callbacks always read current props
  // without needing to restart the animation effect on every prop change.
  const onAutoCompleteRef = useRef(onAutoAdvanceComplete)
  onAutoCompleteRef.current = onAutoAdvanceComplete
  const fadeDurationRef = useRef(fadeDurationMs)
  fadeDurationRef.current = fadeDurationMs
  const autoAdvanceRef = useRef(autoAdvance)
  autoAdvanceRef.current = autoAdvance
  const autoAdvanceDelayRef = useRef(autoAdvanceDelayMs)
  autoAdvanceDelayRef.current = autoAdvanceDelayMs
  const stackIdRef = useRef(stackId)
  stackIdRef.current = stackId
  const startElapsedRef = useRef(startElapsedMs)
  startElapsedRef.current = startElapsedMs

  const cancelAnimations = useCallback(() => {
    if (fadeFrameRef.current != null) {
      cancelAnimationFrame(fadeFrameRef.current)
      fadeFrameRef.current = null
    }
    if (autoFrameRef.current != null) {
      cancelAnimationFrame(autoFrameRef.current)
      autoFrameRef.current = null
    }
    dispatch(setFadeProgress({ stackId: stackIdRef.current, progress: 0 }))
    dispatch(setAutoProgress({ stackId: stackIdRef.current, progress: null }))
  }, [dispatch])

  // Start fade animation when activeCueId changes (or the same cue is re-fired, which
  // `transitionSeq` catches) — the only real trigger. All other values (duration, autoAdvance,
  // etc.) are read from refs.
  useEffect(() => {
    if (activeCueId == null) return

    const sid = stackIdRef.current
    const cueId = activeCueId

    const startAutoAdvance = () => {
      const delay = autoAdvanceDelayRef.current ?? 0

      const finish = () => {
        dispatch(setAutoProgress({ stackId: sid, progress: null }))
        dispatch(markDone({ stackId: sid, cueId }))
        onAutoCompleteRef.current()
      }

      if (delay <= 0) {
        autoFrameRef.current = requestAnimationFrame(() => {
          autoFrameRef.current = null
          finish()
        })
        return
      }

      const t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min((t - t0) / delay, 1)
        dispatch(setAutoProgress({ stackId: sid, progress: p }))
        if (p < 1) {
          autoFrameRef.current = requestAnimationFrame(tick)
        } else {
          autoFrameRef.current = null
          finish()
        }
      }
      autoFrameRef.current = requestAnimationFrame(tick)
    }

    const dur = fadeDurationRef.current ?? 0

    if (dur > 0) {
      // Rewind the clock by however much of the fade already happened server-side, so a late
      // frame animates the remainder rather than the whole thing.
      const t0 = performance.now() - Math.min(startElapsedRef.current, dur)
      const tick = (t: number) => {
        const p = Math.min((t - t0) / dur, 1)
        dispatch(setFadeProgress({ stackId: sid, progress: p }))
        if (p < 1) {
          fadeFrameRef.current = requestAnimationFrame(tick)
        } else {
          fadeFrameRef.current = null
          if (autoAdvanceRef.current) {
            startAutoAdvance()
          } else {
            dispatch(markDone({ stackId: sid, cueId }))
          }
        }
      }
      fadeFrameRef.current = requestAnimationFrame(tick)
    } else {
      // Snap cut
      if (autoAdvanceRef.current) {
        startAutoAdvance()
      } else {
        dispatch(markDone({ stackId: sid, cueId }))
      }
    }

    return () => {
      if (fadeFrameRef.current != null) {
        cancelAnimationFrame(fadeFrameRef.current)
        fadeFrameRef.current = null
      }
      if (autoFrameRef.current != null) {
        cancelAnimationFrame(autoFrameRef.current)
        autoFrameRef.current = null
      }
    }
  }, [activeCueId, transitionSeq, dispatch])

  return { cancelAnimations }
}
