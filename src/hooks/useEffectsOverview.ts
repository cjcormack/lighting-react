import { useState, useCallback, useRef } from 'react'

const STORAGE_KEY = 'effects-overview-visible'

function getInitialState(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export function useEffectsOverview() {
  const [isVisible, setIsVisible] = useState<boolean>(getInitialState)
  const [isLocked, setIsLocked] = useState(false)

  // Refs to keep callbacks stable while reading latest values
  const isLockedRef = useRef(false)
  const isVisibleRef = useRef(isVisible)
  const wasVisibleBeforeLock = useRef(false)
  isLockedRef.current = isLocked
  isVisibleRef.current = isVisible

  const toggle = useCallback(() => {
    if (isLockedRef.current) return
    setIsVisible((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  const hide = useCallback(() => {
    if (isLockedRef.current) return
    setIsVisible(false)
    localStorage.setItem(STORAGE_KEY, 'false')
  }, [])

  /** Lock the overview open (called when entering FX view) */
  const lock = useCallback(() => {
    wasVisibleBeforeLock.current = isVisibleRef.current
    setIsLocked(true)
    setIsVisible(true)
  }, [])

  /** Unlock and restore prior state (called when leaving FX view) */
  const unlock = useCallback(() => {
    setIsLocked(false)
    if (!wasVisibleBeforeLock.current) {
      setIsVisible(false)
    }
  }, [])

  return { isVisible, isLocked, toggle, hide, lock, unlock }
}
