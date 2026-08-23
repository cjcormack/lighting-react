import { useCallback, useEffect, useRef, useState } from 'react'

export interface NarrowContainerOptions {
  /**
   * What to assume for the single commit before the element exists to measure.
   *
   * Defaults to `false` (wide). It used to be `true`, which meant every mount painted the phone
   * layout for one frame — and because `RunPage` swaps *subtrees* rather than hiding with CSS,
   * that frame mounted the whole `RunMobile` tree and threw it away. The synchronous measure
   * below means this guess is never painted either way; it only decides which tree is built and
   * discarded, and wide is the common case on a desk.
   */
  initial?: boolean
}

/**
 * Returns a [callbackRef, isNarrow] tuple. `isNarrow` is `true` while the element's content width
 * is below `threshold` pixels (ResizeObserver-backed).
 *
 * Uses a callback ref so the observer attaches when the element mounts, even if that happens
 * several renders after the hook is first called (e.g. the target div renders conditionally).
 *
 * The ref callback **measures synchronously** before observing. A `setState` from a ref callback
 * is flushed in the layout phase, before paint, so the first observer fire is never what the
 * operator sees — the initial guess is committed but never painted.
 *
 * Deliberately **not** debounced or rAF-throttled. A resize drag does fire the observer per tick,
 * but `setNarrow(sameBoolean)` is a React bail-out: it re-renders on the one tick that crosses the
 * threshold, not on every tick. Adding a delay would only add lag to the crossing.
 */
export function useNarrowContainer(
  threshold: number,
  { initial = false }: NarrowContainerOptions = {},
): [(el: HTMLElement | null) => void, boolean] {
  const [narrow, setNarrow] = useState(initial)
  const observerRef = useRef<ResizeObserver | null>(null)

  // Assigned during render, not in an effect. `CueCardEditor` passes its threshold as a *prop*,
  // and an effect-written ref left a changed threshold inert until the next resize.
  const thresholdRef = useRef(threshold)
  thresholdRef.current = threshold

  // The last width we actually believe. A zero report means the element is display:none (or in a
  // collapsed ancestor), not that it is narrow — treating it as narrow would flip Run to the
  // mobile takeover whenever an ancestor hid it.
  const lastWidthRef = useRef<number | null>(null)

  const applyRef = useRef((width: number) => {
    if (width <= 0) return
    lastWidthRef.current = width
    setNarrow(width < thresholdRef.current)
  })

  const setRef = useCallback((el: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (!el) return
    applyRef.current(el.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      applyRef.current(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(el)
    observerRef.current = observer
    // Deps are provably empty: every value this reads lives in a ref (`applyRef`, `observerRef`),
    // and a changing callback ref would detach and reattach the observer on every render.
  }, [])

  // A changed threshold has to re-decide against the width we already know, because the element
  // has not resized and the observer will not fire again.
  useEffect(() => {
    if (lastWidthRef.current != null) setNarrow(lastWidthRef.current < threshold)
  }, [threshold])

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [])

  return [setRef, narrow]
}
