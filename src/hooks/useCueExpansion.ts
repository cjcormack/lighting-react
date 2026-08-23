import { useCallback, useEffect, useState } from 'react'

/**
 * Which cue cards in a stack are open.
 *
 * Two things are expanded at most: the cue the operator opened, and the one that is on stage. That
 * pairing is the whole design, and it is what neither predecessor managed:
 *
 *  - **Run kept a `Set` and added every live cue to it**, never removing any, so after five GOs the
 *    operator was scrolling five open cards. It also needed two effects whose *declaration order*
 *    was load-bearing — a reset followed by a re-add — to reconstruct something computable.
 *  - **Show kept a single scalar in `?cue=`**, so a GO that auto-expanded the new live cue would
 *    replace the card being read.
 *
 * Deriving the live card instead means exactly one is ever open, it is always the current one, and a
 * GO cannot take away the card the operator opened, because it does not write to `openCueId` at all.
 *
 * `openCueId` is owned by the caller because its *storage* differs: the merged Show view keeps it in
 * `?cue=`, which is an external contract (the Prompt Book mints those links), while a surface with
 * no URL of its own can keep it in local state.
 *
 * `collapsedLiveCueId` is the one piece of state that is neither derived nor addressable, and it
 * exists for a single reason: closing the live card can no longer be a deletion from a set. It
 * self-clears — when the show moves on, `liveCueId` changes and the stale id stops matching — so a
 * later GO re-opens the new live card without anything having to reset it.
 */
export function useCueExpansion({
  openCueId,
  setOpenCueId,
  liveCueId,
  resetKey,
}: {
  /** The cue the operator opened, however the caller stores it. */
  openCueId: number | null
  setOpenCueId: (cueId: number | null) => void
  /** The cue on stage in the stack being shown, or null when there is none. */
  liveCueId: number | null
  /** Changing this forgets a dismissed live card — the stack being read, in practice. */
  resetKey: number | null
}) {
  const [collapsedLiveCueId, setCollapsedLiveCueId] = useState<number | null>(null)

  useEffect(() => {
    setCollapsedLiveCueId(null)
  }, [resetKey])

  const isExpanded = useCallback(
    (cueId: number) =>
      cueId === openCueId || (cueId === liveCueId && collapsedLiveCueId !== cueId),
    [openCueId, liveCueId, collapsedLiveCueId],
  )

  const toggleExpanded = useCallback(
    (cueId: number) => {
      // Closing has to silence both reasons a card can be open, or a card expanded for both would
      // need two presses to shut.
      if (isExpanded(cueId)) {
        if (cueId === openCueId) setOpenCueId(null)
        if (cueId === liveCueId) setCollapsedLiveCueId(cueId)
        return
      }
      setOpenCueId(cueId)
      if (cueId === liveCueId) setCollapsedLiveCueId(null)
    },
    [isExpanded, openCueId, liveCueId, setOpenCueId],
  )

  return { isExpanded, toggleExpanded }
}
