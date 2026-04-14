import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Returns a [callbackRef, isNarrow] tuple. `isNarrow` is `true` while the
 * element's content width is below `threshold` pixels (ResizeObserver-backed).
 *
 * Uses a callback ref so the observer attaches when the element mounts, even
 * if that happens several renders after the hook is first called (e.g. the
 * target div renders conditionally). Defaults to `true` (narrow) before the
 * first observer fire.
 */
export function useNarrowContainer(
  threshold: number,
): [(el: HTMLElement | null) => void, boolean] {
  const [narrow, setNarrow] = useState(true)
  const observerRef = useRef<ResizeObserver | null>(null)
  const thresholdRef = useRef(threshold)

  useEffect(() => {
    thresholdRef.current = threshold
  }, [threshold])

  const setRef = useCallback((el: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (el) {
      const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 0
        setNarrow(width < thresholdRef.current)
      })
      observer.observe(el)
      observerRef.current = observer
    }
  }, [])

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [])

  return [setRef, narrow]
}
