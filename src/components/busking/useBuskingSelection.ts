import { useCallback, useState } from 'react'
import { buskingTargetKey, type BuskingTarget } from './buskingTypes'

/**
 * Which targets the pad is aimed at.
 *
 * A Map keyed by `buskingTargetKey` rather than an array, because every other part of the pad asks
 * "is this one selected" far more often than it iterates, and a group and a fixture can share a
 * name.
 */
export function useBuskingSelection() {
  const [selectedTargets, setSelectedTargets] = useState<Map<string, BuskingTarget>>(new Map())

  /** Replace the selection with exactly this target. */
  const selectTarget = useCallback((target: BuskingTarget) => {
    setSelectedTargets(new Map([[buskingTargetKey(target), target]]))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedTargets(new Map())
  }, [])

  /** Add or remove one target, leaving the rest of the selection alone. */
  const toggleTarget = useCallback((target: BuskingTarget) => {
    setSelectedTargets((prev) => {
      const next = new Map(prev)
      const key = buskingTargetKey(target)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, target)
      }
      return next
    })
  }, [])

  return { selectedTargets, selectTarget, toggleTarget, clearSelection }
}
