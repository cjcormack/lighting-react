import { useState, useCallback } from 'react'

const STORAGE_KEY = 'stage-overview-visible'

function getInitialState(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export function useStageOverview() {
  const [isVisible, setIsVisible] = useState<boolean>(getInitialState)

  const toggle = useCallback(() => {
    setIsVisible((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  const hide = useCallback(() => {
    setIsVisible(false)
    localStorage.setItem(STORAGE_KEY, 'false')
  }, [])

  return { isVisible, toggle, hide }
}
