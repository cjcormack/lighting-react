import { useBlocker } from "react-router-dom"
import { useState, useCallback, useEffect } from "react"

export interface UseUnsavedChangesResult {
  showConfirmDialog: boolean
  confirmLeave: () => void
  cancelLeave: () => void
}

export function useUnsavedChanges(
  hasChanges: boolean,
  allowNavigation: boolean = false
): UseUnsavedChangesResult {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasChanges &&
      !allowNavigation &&
      currentLocation.pathname !== nextLocation.pathname
  )

  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowConfirmDialog(true)
    }
  }, [blocker.state])

  const confirmLeave = useCallback(() => {
    setShowConfirmDialog(false)
    if (blocker.state === "blocked") {
      blocker.proceed()
    }
  }, [blocker])

  const cancelLeave = useCallback(() => {
    setShowConfirmDialog(false)
    if (blocker.state === "blocked") {
      blocker.reset()
    }
  }, [blocker])

  return {
    showConfirmDialog,
    confirmLeave,
    cancelLeave,
  }
}
