import { useState, useCallback, useRef } from 'react'
import { usePersistentState } from './usePersistentState'

/**
 * Visibility for the effects overview panel, with a lock the FX view holds while
 * it's mounted.
 *
 * The lock is deliberately *not* persisted: `isVisible` is the user's stored
 * preference OR-ed with the lock, so forcing the panel open never overwrites
 * what they chose, and releasing the lock restores that choice without needing
 * to save and replay it.
 */
export function useEffectsOverview() {
  const [preferVisible, setPreferVisible] = usePersistentState<boolean>(
    'effects-overview-visible',
    false,
  )
  const [isLocked, setIsLocked] = useState(false)

  // Read the lock through a ref so toggle/hide stay referentially stable.
  const isLockedRef = useRef(false)
  isLockedRef.current = isLocked

  const toggle = useCallback(() => {
    if (isLockedRef.current) return
    setPreferVisible((prev) => !prev)
  }, [setPreferVisible])

  const hide = useCallback(() => {
    if (isLockedRef.current) return
    setPreferVisible(false)
  }, [setPreferVisible])

  /** Lock the overview open (called when entering FX view) */
  const lock = useCallback(() => setIsLocked(true), [])

  /** Unlock, restoring the stored preference (called when leaving FX view) */
  const unlock = useCallback(() => setIsLocked(false), [])

  return { isVisible: preferVisible || isLocked, isLocked, toggle, hide, lock, unlock }
}
