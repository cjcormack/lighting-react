import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { CueRunStateEvent, CueStackCueEntry } from '../api/cueStacksApi'

interface StackRunnerState {
  activeCueId: number | null
  standbyCueId: number | null
  completedCueIds: number[]
  fadeProgress: number
  autoProgress: number | null
  /**
   * How far into the live cue's fade the *server* was when it told us, in ms. The animation
   * starts there rather than at 0, so a session that joins mid-fade — or one that hears about
   * another surface's GO a beat late — lands in the right place.
   */
  fadeStartElapsedMs: number
  /**
   * Bumped on every server cue transition. The animation effect keys off it as well as the
   * cue id, so re-firing the same cue restarts the fade.
   */
  serverTransition: number
  /**
   * The live cue as the *server* last reported it. Distinct from `activeCueId`, which is the
   * cue currently animating and goes back to null when the fade finishes. Used to mark the
   * outgoing cue done on a session that never pressed GO.
   */
  serverActiveCueId: number | null
  /**
   * Whether the server will actually roll the stack forward on its own, per the last frame —
   * null until one arrives. Not the same as the cue's `autoAdvance` flag: a cue-edit Live
   * session and the surface's Pause binding both cancel the timer on a cue still configured
   * for it, and a countdown bar completing into nothing is worse than no bar.
   */
  serverAutoAdvance: boolean | null
  serverAutoAdvanceDelayMs: number | null
}

interface RunnerState {
  stacks: Record<number, StackRunnerState>
}

const initialState: RunnerState = {
  stacks: {},
}

function getOrCreate(state: RunnerState, stackId: number): StackRunnerState {
  if (!state.stacks[stackId]) {
    state.stacks[stackId] = {
      activeCueId: null,
      standbyCueId: null,
      completedCueIds: [],
      fadeProgress: 0,
      autoProgress: null,
      fadeStartElapsedMs: 0,
      serverTransition: 0,
      serverActiveCueId: null,
      serverAutoAdvance: null,
      serverAutoAdvanceDelayMs: null,
    }
  }
  return state.stacks[stackId]
}

function nextStandardCue(
  cues: CueStackCueEntry[],
  currentId: number,
  loop: boolean,
): number | null {
  const idx = cues.findIndex((c) => c.id === currentId)
  for (let j = idx + 1; j < cues.length; j++) {
    if (cues[j].cueType === 'STANDARD') return cues[j].id
  }
  if (loop) {
    for (let j = 0; j < idx; j++) {
      if (cues[j].cueType === 'STANDARD') return cues[j].id
    }
    // Only one STANDARD cue in a looping stack: wrap to itself so GO re-fires it,
    // rather than reporting "no next" (which callers treat as end-of-stack).
    if (cues[idx]?.cueType === 'STANDARD') return currentId
  }
  return null
}

function prevStandardCue(cues: CueStackCueEntry[], currentId: number): number | null {
  const idx = cues.findIndex((c) => c.id === currentId)
  for (let j = idx - 1; j >= 0; j--) {
    if (cues[j].cueType === 'STANDARD') return cues[j].id
  }
  return null
}

function firstStandardCue(cues: CueStackCueEntry[]): number | null {
  return cues.find((c) => c.cueType === 'STANDARD')?.id ?? null
}

export const runnerSlice = createSlice({
  name: 'runner',
  initialState,
  reducers: {
    go(
      state,
      action: PayloadAction<{ stackId: number; cues: CueStackCueEntry[]; loop: boolean }>,
    ) {
      const { stackId, cues, loop } = action.payload
      const s = getOrCreate(state, stackId)
      if (s.standbyCueId == null) return

      // Mark previous active as done if mid-fade
      if (s.activeCueId != null) {
        if (!s.completedCueIds.includes(s.activeCueId)) {
          s.completedCueIds.push(s.activeCueId)
        }
      }

      s.activeCueId = s.standbyCueId
      s.fadeProgress = 0
      s.autoProgress = null
      s.standbyCueId = nextStandardCue(cues, s.activeCueId, loop)
    },

    back(state, action: PayloadAction<{ stackId: number; cues: CueStackCueEntry[] }>) {
      const { stackId, cues } = action.payload
      const s = getOrCreate(state, stackId)
      s.fadeProgress = 0
      s.autoProgress = null

      if (s.activeCueId != null) {
        // Mid-fade: return standby to the cue that was fading
        const prev = s.activeCueId
        s.activeCueId = null
        s.standbyCueId = prev
        s.completedCueIds = s.completedCueIds.filter((id) => id !== prev)
      } else if (s.standbyCueId != null) {
        // No active: move standby cursor back
        const prev = prevStandardCue(cues, s.standbyCueId)
        if (prev != null) {
          s.standbyCueId = prev
          s.completedCueIds = s.completedCueIds.filter((id) => id !== prev)
        }
      }
    },

    setFadeProgress(state, action: PayloadAction<{ stackId: number; progress: number }>) {
      const s = getOrCreate(state, action.payload.stackId)
      s.fadeProgress = action.payload.progress
    },

    setAutoProgress(state, action: PayloadAction<{ stackId: number; progress: number | null }>) {
      const s = getOrCreate(state, action.payload.stackId)
      s.autoProgress = action.payload.progress
    },

    markDone(state, action: PayloadAction<{ stackId: number; cueId: number }>) {
      const s = getOrCreate(state, action.payload.stackId)
      if (!s.completedCueIds.includes(action.payload.cueId)) {
        s.completedCueIds.push(action.payload.cueId)
      }
      s.activeCueId = null
      // Keep fadeProgress at its current value (1.0) so the progress bar stays
      // at 100% until the next go() resets it.
      s.autoProgress = null
    },

    resetStack(
      state,
      action: PayloadAction<{
        stackId: number
        cues: CueStackCueEntry[]
        serverActiveCueId?: number | null
        /** The backend's `nextCueId` for this stack — an armed standby, or the positional next. */
        serverNextCueId?: number | null
        loop?: boolean
      }>,
    ) {
      const { stackId, cues, serverActiveCueId, serverNextCueId, loop } = action.payload
      if (serverActiveCueId != null && cues.some((c) => c.id === serverActiveCueId)) {
        // Restore from server state — the cue already ran on the backend,
        // so treat it as completed and queue the next cue as standby.
        const activeIdx = cues.findIndex((c) => c.id === serverActiveCueId)
        const completed = cues
          .slice(0, activeIdx + 1)
          .filter((c) => c.cueType === 'STANDARD')
          .map((c) => c.id)
        state.stacks[stackId] = {
          activeCueId: null,
          // `serverNextCueId` when the caller has it (the backend owns "next"); the local walk
          // is the fallback for a caller that doesn't, e.g. a stack loaded without run state.
          standbyCueId: serverNextCueId ?? nextStandardCue(cues, serverActiveCueId, loop ?? false),
          completedCueIds: completed,
          fadeProgress: 0,
          autoProgress: null,
          fadeStartElapsedMs: 0,
          serverTransition: 0,
          serverActiveCueId,
          serverAutoAdvance: null,
          serverAutoAdvanceDelayMs: null,
        }
      } else {
        state.stacks[stackId] = {
          activeCueId: null,
          standbyCueId: serverNextCueId ?? firstStandardCue(cues),
          completedCueIds: [],
          fadeProgress: 0,
          autoProgress: null,
          fadeStartElapsedMs: 0,
          serverTransition: 0,
          serverActiveCueId: null,
          serverAutoAdvance: null,
          serverAutoAdvanceDelayMs: null,
        }
      }
    },

    setStandby(
      state,
      action: PayloadAction<{ stackId: number; cueId: number }>,
    ) {
      // Re-queue: user clicked a cue to set it as the next GO target.
      // Optimistic only — the caller POSTs `/standby` and the server's `cueRunStateChanged`
      // frame confirms it here (and tells every other session). Clearing the target from
      // completedCueIds so the "done" tick doesn't stick around for a cue we just cued up again.
      const s = getOrCreate(state, action.payload.stackId)
      s.standbyCueId = action.payload.cueId
      s.completedCueIds = s.completedCueIds.filter((id) => id !== action.payload.cueId)
    },

    /**
     * Adopt a `cueRunStateChanged` frame. This is how a session that didn't press GO follows the
     * desk: the armed next, the live cue, and the fade all come from the server.
     *
     * The animation only starts when there is genuinely a fade to draw — `transition` (a GO just
     * happened) or a non-null `fadeElapsedMs` (we joined mid-fade). A settled snapshot moves the
     * state without replaying a fade that finished long ago.
     */
    applyServerRunState(state, action: PayloadAction<CueRunStateEvent>) {
      const { stackId, activeCueId, nextCueId, transition, fadeElapsedMs } = action.payload
      const s = getOrCreate(state, stackId)

      const previous = s.serverActiveCueId
      s.serverActiveCueId = activeCueId
      s.serverAutoAdvance = action.payload.autoAdvance
      s.serverAutoAdvanceDelayMs = action.payload.autoAdvanceDelayMs
      s.standbyCueId = nextCueId
      if (nextCueId != null) {
        s.completedCueIds = s.completedCueIds.filter((id) => id !== nextCueId)
      }
      // Independent of the local animation: a following session never had `activeCueId` set,
      // so without this the outgoing cue would never get its "done" tick.
      if (previous != null && previous !== activeCueId && !s.completedCueIds.includes(previous)) {
        s.completedCueIds.push(previous)
      }

      if (activeCueId == null) {
        // Stack stopped.
        s.activeCueId = null
        s.fadeProgress = 0
        s.autoProgress = null
        return
      }

      if (!transition && fadeElapsedMs == null) {
        // Nothing to animate — a settled snapshot (the cue fired before we connected) or a
        // standby-only change. Stand the animation down only if the live cue actually moved,
        // or an arming frame would kill a fade this session is legitimately drawing.
        if (previous !== activeCueId) {
          s.activeCueId = null
          s.fadeProgress = 0
          s.autoProgress = null
        }
        return
      }

      s.activeCueId = activeCueId
      s.fadeStartElapsedMs = fadeElapsedMs ?? 0
      s.fadeProgress = 0
      s.autoProgress = null
      s.serverTransition += 1
    },
  },
})

export const {
  go,
  back,
  setFadeProgress,
  setAutoProgress,
  markDone,
  resetStack,
  setStandby,
  applyServerRunState,
} = runnerSlice.actions

// Selectors

// Stable reference for stacks with no runner entry yet — returning a fresh object here would
// make useSelector (=== equality) re-render its subscriber on every unrelated dispatch (e.g. the
// WebSocket channel/status stream) while the stack is idle. Never mutated by consumers.
const EMPTY_STACK_RUNNER: StackRunnerState = {
  activeCueId: null,
  standbyCueId: null,
  completedCueIds: [],
  fadeProgress: 0,
  autoProgress: null,
  fadeStartElapsedMs: 0,
  serverTransition: 0,
  serverActiveCueId: null,
  serverAutoAdvance: null,
  serverAutoAdvanceDelayMs: null,
}

export function selectStackRunner(state: { runner: RunnerState }, stackId: number): StackRunnerState {
  return state.runner.stacks[stackId] ?? EMPTY_STACK_RUNNER
}
