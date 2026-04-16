import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { CueStackCueEntry } from '../api/cueStacksApi'

interface StackRunnerState {
  activeCueId: number | null
  standbyCueId: number | null
  completedCueIds: number[]
  fadeProgress: number
  autoProgress: number | null
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
      s.fadeProgress = 0
      s.autoProgress = null
    },

    resetStack(
      state,
      action: PayloadAction<{
        stackId: number
        cues: CueStackCueEntry[]
        serverActiveCueId?: number | null
        loop?: boolean
      }>,
    ) {
      const { stackId, cues, serverActiveCueId, loop } = action.payload
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
          standbyCueId: nextStandardCue(cues, serverActiveCueId, loop ?? false),
          completedCueIds: completed,
          fadeProgress: 0,
          autoProgress: null,
        }
      } else {
        state.stacks[stackId] = {
          activeCueId: null,
          standbyCueId: firstStandardCue(cues),
          completedCueIds: [],
          fadeProgress: 0,
          autoProgress: null,
        }
      }
    },

    reconcileActiveCue(
      state,
      action: PayloadAction<{ stackId: number; cueId: number | null }>,
    ) {
      const s = getOrCreate(state, action.payload.stackId)
      // Only reconcile if the server-reported active cue differs from our optimistic state
      if (action.payload.cueId != null && s.activeCueId !== action.payload.cueId) {
        s.activeCueId = action.payload.cueId
      }
    },

    setStandby(
      state,
      action: PayloadAction<{ stackId: number; cueId: number }>,
    ) {
      // Re-queue: user clicked a cue to set it as the next GO target.
      // Purely local — the backend is told on the next GO (handleGo calls
      // goToCueInStack with this id). Clearing the target from completedCueIds
      // so the "done" tick doesn't stick around for a cue we just cued up again.
      const s = getOrCreate(state, action.payload.stackId)
      s.standbyCueId = action.payload.cueId
      s.completedCueIds = s.completedCueIds.filter((id) => id !== action.payload.cueId)
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
  reconcileActiveCue,
  setStandby,
} = runnerSlice.actions

// Selectors
export function selectStackRunner(state: { runner: RunnerState }, stackId: number): StackRunnerState {
  return (
    state.runner.stacks[stackId] ?? {
      activeCueId: null,
      standbyCueId: null,
      completedCueIds: [],
      fadeProgress: 0,
      autoProgress: null,
    }
  )
}
