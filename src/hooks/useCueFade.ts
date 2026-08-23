import { useSelector } from 'react-redux'
import { runnerSlice, selectStackRunner } from '../store/runnerSlice'

type RunnerRoot = { runner: ReturnType<typeof runnerSlice.getInitialState> }

/**
 * A single cue row's fade state, read straight from the runner rather than passed down.
 *
 * The fade is the only value on a cue row that changes at frame rate, and prop-drilling it would
 * defeat the reason `ProgramView` is memoized in the first place — "so memo keeps the whole editor
 * subtree from reconciling ~60x/sec while a cue fades". A stack is several hundred rows; re-rendering
 * all of them to animate one is the cost that memo was put there to avoid, and threading
 * `fadeProgress` through would reintroduce it with the memo still in place, looking effective.
 *
 * So each row asks for its own. The selector returns `null` for every row that is not fading, and a
 * `null` that stays `null` is reference-equal — so those rows never re-render. Only the row actually
 * fading does.
 *
 * `stackId` is null for a stack that is not the playhead: a stack being merely read has no fade,
 * and the runner state of the stack that *is* running says nothing about its rows.
 */
export function useCueFade(
  stackId: number | null | undefined,
  cueId: number,
  fadeDurationMs: number | null,
) {
  const fadeProgress = useSelector((state: RunnerRoot) => {
    if (stackId == null) return null
    const runner = selectStackRunner(state, stackId)
    // `activeCueId` is the optimistic cursor: set the instant GO is pressed, cleared when the fade
    // completes. That is exactly the window a fade should be drawn in.
    if (runner.activeCueId !== cueId) return null
    return runner.fadeProgress < 1 ? runner.fadeProgress : null
  })

  const fadeRemainMs =
    fadeProgress == null || fadeDurationMs == null || fadeDurationMs <= 0
      ? null
      : Math.max(0, fadeDurationMs * (1 - fadeProgress))

  return { fadeProgress, fadeRemainMs }
}
