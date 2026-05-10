import { useEffect, useRef, useState } from 'react'

/**
 * Tracks whether the Shift key is currently held. Returns both a state value
 * (for components that need to re-render when Shift toggles, e.g. to pass to
 * TransformControls' snap props) and a ref (for drag handlers that need to
 * read the latest value mid-gesture without forcing a re-render every frame).
 */
export function useShiftHeld(): { held: boolean; ref: React.RefObject<boolean> } {
  const [held, setHeld] = useState(false)
  const ref = useRef(false)
  useEffect(() => {
    // Listen on both keydown and keyup: every key event carries the current
    // modifier state (e.shiftKey), so we don't need to specifically watch for
    // the Shift key itself. Bail early when the value hasn't changed so
    // typing/autorepeat doesn't trigger React re-renders.
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey === ref.current) return
      ref.current = e.shiftKey
      setHeld(e.shiftKey)
    }
    const onBlur = () => {
      if (!ref.current) return
      ref.current = false
      setHeld(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  return { held, ref }
}

export const SNAP_DISTANCE_M = 0.25
export const SNAP_ANGLE_DEG = 15
export const SNAP_ANGLE_RAD = (SNAP_ANGLE_DEG * Math.PI) / 180

export function snap(value: number, step: number): number {
  return Math.round(value / step) * step
}
