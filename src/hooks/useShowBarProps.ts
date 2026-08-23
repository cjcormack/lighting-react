import { useCallback, useState } from 'react'
import {
  useActivateProgramMutation,
  useDeactivateProgramMutation,
  useProjectCueStackListQuery,
  useProjectProgramStateQuery,
} from '../store/cueStacks'
import { useShowTransport } from './useShowTransport'

/**
 * Everything `ShowBar` needs, derived from a project id.
 *
 * Two surfaces mount the bar with identical wiring — Show and the Programmer — and a third and
 * fourth (Run, the Prompt Book) do their own because they already hold the transport for their own
 * reasons. Extracted the moment there were two: the bar takes a dozen props, half of them derived
 * by the same three lines of cue lookup, and a second hand-rolled copy is a copy that drifts.
 *
 * `isShowActive` is returned rather than applied here because the *caller* decides what an inactive
 * show looks like — both current hosts hide the bar entirely, but that is their call, not the
 * hook's.
 *
 * `showHeaderProps` comes along because Start/Stop is the same derivation from the same state, and
 * the two hosts that need the bar need that too. Run and the Prompt Book keep their own; they hold
 * the transport already for reasons of their own.
 */
export function useShowBarProps(projectId: number) {
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const { data: programState } = useProjectProgramStateQuery(projectId)
  const activeStackId = programState?.activeStackId ?? null

  const transport = useShowTransport({ projectId, activeStackId, stacks })
  const [dbo, setDbo] = useState(false)

  const activeCue = transport.activeStack?.cues.find((c) => c.id === transport.activeCueId) ?? null
  const standbyCue =
    transport.activeStack?.cues.find((c) => c.id === transport.standbyCueId) ?? null

  const [activateShow] = useActivateProgramMutation()
  const [deactivateShow] = useDeactivateProgramMutation()
  const runnableStackCount = stacks?.filter((s) => s.type === 'STACK').length ?? 0

  // Both `.catch()` blocks swallow deliberately: `errorToastMiddleware` reports the failure, and
  // this is only here to stop the unhandled rejection.
  const onStart = useCallback(() => {
    activateShow({ projectId }).unwrap().catch(() => {})
  }, [activateShow, projectId])
  const onStop = useCallback(async () => {
    await deactivateShow({ projectId }).unwrap().catch(() => {})
  }, [deactivateShow, projectId])

  return {
    isShowActive: activeStackId != null,
    showHeaderProps: {
      isShowActive: activeStackId != null,
      canStart: activeStackId == null && runnableStackCount > 0,
      onStart,
      onStop,
    },
    transport,
    showBarProps: {
      stackName: transport.activeStack?.name ?? null,
      dbo,
      onDbo: () => setDbo((d) => !d),
      activeNumber: activeCue?.cueNumber ? `Q${activeCue.cueNumber}` : null,
      activeName: activeCue?.name ?? null,
      standbyNumber: standbyCue?.cueNumber ? `Q${standbyCue.cueNumber}` : null,
      standbyName: standbyCue?.name ?? null,
      fadeRemainMs: transport.fadeRemainMs,
      onGo: transport.go,
      onBack: transport.back,
      goDisabled: transport.goDisabled,
    },
  }
}
