import { useEffect, useReducer } from 'react'
import type { RunnerAnimSpan } from '../store/runnerSlice'

/**
 * Drives one component at frame rate from a write-once animation descriptor.
 *
 * The runner slice stores `(startMs, durationMs)` per animation instead of streaming progress
 * through Redux — dispatching per rAF made every `selectStackRunner` subscriber re-render 60×/s
 * and put four deep-scanned slices in front of the dev invariant middleware per frame. So the
 * frame-rate part lives here: an rAF loop that only forces a local re-render, with progress
 * computed at render time from the descriptor. Only the components that actually draw an
 * animation pay for it.
 *
 * Returns null when there is nothing to animate, else progress clamped to 0..1. The loop stops
 * itself once the span's end has passed; the final render reports exactly 1. Pass a *stable*
 * descriptor (the slice's own object, not a per-render literal) — the effect keys on its
 * identity.
 */
export function useAnimatedProgress(span: RunnerAnimSpan | null): number | null {
  const [, bump] = useReducer((c: number) => c + 1, 0)

  useEffect(() => {
    if (span == null || span.durationMs <= 0) return
    if (performance.now() - span.startMs >= span.durationMs) return
    let frame = requestAnimationFrame(function tick(t) {
      bump()
      if (t - span.startMs < span.durationMs) {
        frame = requestAnimationFrame(tick)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [span])

  if (span == null) return null
  // A zero-length span never gets written today (both drivers guard on duration > 0), but the
  // honest answer for one would be "already finished".
  if (span.durationMs <= 0) return 1
  // Sampling the clock at render time is deliberate, not an oversight: progress is a pure
  // function of the span and the clock, so it can never go stale when the span changes between
  // renders — storing the last tick's value in state could. The double render StrictMode does
  // yields two near-identical clamped samples, and the committed one self-heals next frame.
  return Math.min(Math.max((performance.now() - span.startMs) / span.durationMs, 0), 1)
}
