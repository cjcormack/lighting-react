import { useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useActiveEffectsQuery, useRemoveFxMutation } from '../../store/fixtureFx'
import { useFixtureListQuery } from '../../store/fixtures'
import { useRemoveGroupFxMutation } from '../../store/groups'
import { effectsToStop, membersByGroupOf, partialSweepMessage } from './cellEffects'

/**
 * Stop the **local** effects a cell clear covers — the other half of the marquee's Backspace.
 *
 * `cellEffects.ts` holds the rule and the reasoning; this is the wiring. Four things about it:
 *
 *  - **[enabled] gates the subscription, not the sweep.** `activeEffects` is invalidated by every
 *    `fxChanged` frame, so the two plain list routes — which have no cell selection to clear, and
 *    no rail already holding this entry — must not mount it. On the programmer `ProgrammerFxList`
 *    is subscribed to the same cache entry already, so this adds a reader rather than a request.
 *  - **The returned callback is stable for the mount, and that is load-bearing rather than tidy.**
 *    It is a dependency of `clearSelectedCells`, which is a dependency of the grid's window
 *    `keydown` listener — an effect whose own comment accepts a rebind on a marquee, filter or
 *    scope change because each is a *gesture*. `effects` is not: a refetch lands on every FX frame
 *    and `currentPhase` moves each time, so structural sharing cannot dedupe it and a new array
 *    identity would re-bind that document-level listener at frame rate for as long as anything is
 *    running. So the two values the sweep reads are held in refs and read at press time — which is
 *    also when they should be read, since the question is what is running *now*.
 *  - **The stop is the same pair of mutations the rail's own Stop calls**, including the `.catch`:
 *    `errorToastMiddleware` reports the failure, and this only stops the unhandled rejection.
 *  - **Group membership comes from the fixture list**, the entry the grid is built from, through
 *    the same helper `FxSheet` expands a group-targeted effect with.
 */
export function useClearCellEffects(enabled: boolean): (cleared: ReadonlySet<string>) => void {
  const { data: effects } = useActiveEffectsQuery(undefined, { skip: !enabled })
  const { data: fixtures } = useFixtureListQuery()
  const [removeFx] = useRemoveFxMutation()
  const [removeGroupFx] = useRemoveGroupFxMutation()

  const membersByGroup = useMemo(() => membersByGroupOf(fixtures), [fixtures])

  // Assigned during render, the way `commitNowRef` in `FixturesListContainer` is: a press is
  // always a later task than the commit that set these, and an effect would only add a window in
  // which the callback read the frame before last.
  const latest = useRef({ enabled, effects, membersByGroup })
  latest.current = { enabled, effects, membersByGroup }

  return useCallback((cleared) => {
    const { enabled: on, effects: running, membersByGroup: members } = latest.current
    if (!on || running == null || running.length === 0) return
    const { stop, partial } = effectsToStop(running, (name) => members.get(name) ?? [], cleared)
    for (const effect of stop) {
      const request = effect.isGroupTarget
        ? removeGroupFx({ id: effect.id, groupName: effect.targetKey })
        : removeFx({ id: effect.id, fixtureKey: effect.targetKey })
      request.unwrap().catch(() => {})
    }
    // Nothing is said about the ones that went — the rig and the rail both show it. The ones
    // that did not are the half that would otherwise look like the key misfiring.
    if (partial.length > 0) toast.warning(partialSweepMessage(partial))
    // The two mutation triggers are stable for the mount; everything else is read from the ref
    // above, which is what keeps this callback's identity out of the window listener's deps.
  }, [removeFx, removeGroupFx])
}
