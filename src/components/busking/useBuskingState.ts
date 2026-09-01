import { useCallback, useMemo } from 'react'
import type { CueTarget } from '@/api/cuesApi'
import type { LookSummary } from '@/api/looksApi'
import { useCurrentProjectQuery } from '@/store/projects'
import { useToggleLookMutation } from '@/store/looks'
import { useProgrammerLayersQuery } from '@/store/programmer'
import { ignoreReportedError } from '@/store/errorToastMiddleware'
import { lookLayerTarget, type EffectPresence } from './buskingTypes'
import { useBuskingSelection } from './useBuskingSelection'
import { lookLayerPresence } from './lookPresence'

/**
 * The busk view's state: what is selected, what a Look pad does, and whether its ring is lit.
 *
 * It used to assemble four pieces — selection, presence, the four mutation paths, and the "which
 * properties does this target have" question — because the pad grid also minted ad-hoc FX instances
 * and wrote programmer values directly. Those pads are gone (see `BuskPools`), and with them went
 * `useBuskingFxActions`, `useBuskingPresence`, the effect library read, the property-button
 * derivation, the beat-division default and the apply-time speed-master routing. What is left is one
 * mutation and one predicate, so they live here rather than in a hook each.
 *
 * **Everything here addresses a target by `{type, key}`** — `CueTarget`, `ToggleLookTarget` and the
 * layer stack's own target shape are the same three fields, and `lookLayerTarget` is the single
 * place the group-name convention is applied. The ring and the tap have to agree about which layer a
 * pad is talking about; a group answering to its name in one and its key in the other would light a
 * pad that a tap then failed to clear.
 */
export function useBuskingState() {
  const { selectedTargets, selectTarget, toggleTarget, clearSelection } = useBuskingSelection()
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: programmerLayers } = useProgrammerLayersQuery()
  const [toggleLookMutation] = useToggleLookMutation()

  const selectedArray = useMemo(() => [...selectedTargets.values()], [selectedTargets])

  /** The selection in the one target shape the layer stack, the toggle routes and cues all take. */
  const selectedLayerTargets = useMemo<CueTarget[]>(
    () => selectedArray.map(lookLayerTarget),
    [selectedArray],
  )

  /**
   * One tap on a Look pad: add or remove a layer applying it, targeted at the selection.
   *
   * `POST /looks/{id}/toggle` is `programmerLayerStack.toggle` server-side, which matches on the
   * whole `LayerSource` plus the exact targets — matching on an id alone would let a Look and a
   * template sharing an int PK cancel each other.
   */
  const applyLook = useCallback(
    async (look: LookSummary) => {
      const projectId = currentProject?.id
      if (!projectId || selectedLayerTargets.length === 0) return
      await toggleLookMutation({ projectId, lookId: look.id, targets: selectedLayerTargets })
        .unwrap()
        .catch(ignoreReportedError)
    },
    [currentProject?.id, selectedLayerTargets, toggleLookMutation],
  )

  /**
   * Whether a Look is on, from the programmer's **layer stack** rather than the effect list.
   *
   * A tap adds or removes a layer, so the stack is what the ring should read — and it is the only
   * thing that can answer for a Look made purely of static rows, which spawns no effect to find.
   * The rule itself lives in `lookLayerPresence`, unit-tested there.
   */
  const computeLookPresence = useCallback(
    (look: LookSummary): EffectPresence =>
      lookLayerPresence(programmerLayers ?? [], selectedLayerTargets, look.id),
    [programmerLayers, selectedLayerTargets],
  )

  return {
    selectedTargets,
    selectedArray,
    selectedLayerTargets,
    selectTarget,
    toggleTarget,
    clearSelection,
    programmerLayers,
    applyLook,
    computeLookPresence,
  }
}
