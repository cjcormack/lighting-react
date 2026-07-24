// Type definitions for cue stacks API

export type CueType = 'STANDARD' | 'MARKER'

/**
 * A row in the project's ordered stack list. `STACK` is a runnable cue stack; `SEPARATOR` is a
 * label-only divider between stacks (no cues, not activatable) — it replaces the old show-level
 * marker entries now that the show is simply the project's ordered stacks.
 */
export type StackType = 'STACK' | 'SEPARATOR'

export interface CueStackCueEntry {
  id: number
  name: string
  sortOrder: number
  paletteSize: number
  presetCount: number
  adHocEffectCount: number
  autoAdvance: boolean
  autoAdvanceDelayMs: number | null
  fadeDurationMs: number | null
  fadeCurve: string
  cueNumber: string | null
  notes: string | null
  cueType: CueType
}

export interface CueStack {
  id: number
  name: string
  palette: string[]
  loop: boolean
  /** Position within the project's ordered stack list (the show order). */
  sortOrder: number
  type: StackType
  /** Display text for a `SEPARATOR`; null for a runnable `STACK`. */
  label: string | null
  cues: CueStackCueEntry[]
  activeCueId: number | null
  canEdit: boolean
  canDelete: boolean
}

export interface CueStackInput {
  name: string
  palette: string[]
  loop: boolean
  /** `SEPARATOR` to create a divider row; omit/`STACK` for a runnable stack. */
  type?: StackType
  label?: string | null
  /** Explicit position; when omitted the row is appended to the end of the project's order. */
  sortOrder?: number
}

export interface ReorderCuesRequest {
  cueIds: number[]
}

export interface AddCueToStackRequest {
  cueId: number
  sortOrder?: number
  insertByNumber?: boolean
}

export interface ReorderCueStacksRequest {
  stackIds: number[]
}

export interface ActivateCueStackRequest {
  cueId?: number
}

export interface AdvanceCueStackRequest {
  direction: 'FORWARD' | 'BACKWARD'
}

export interface GoToCueRequest {
  cueId: number
}

export interface CueStackActivateResponse {
  stackId: number
  cueId: number
  cueName: string
  effectCount: number
}

export interface CueStackDeactivateResponse {
  stackId: number
  removedCount: number
}

// ─── Program transport (project-level playhead over the ordered stacks) ──────
// The "show" is just the project's ordered stacks; these types drive which stack is live.

export interface ProgramState {
  projectId: number
  /** The currently-active (live) stack, or null when the show is not running. */
  activeStackId: number | null
  canEdit: boolean
}

export interface AdvanceProgramRequest {
  direction: 'FORWARD' | 'BACKWARD'
  deactivatePrevious?: boolean
}

export interface GoToStackRequest {
  stackId: number
}

export interface ProgramActivateResponse {
  projectId: number
  activeStackId: number | null
  activatedStackName: string | null
}

/** WebSocket `showChanged` payload — the project playhead moved (activate/deactivate/advance/go-to). */
export interface ProgramStateChangedEvent {
  projectId: number
  activeStackId: number | null
  activeStackName: string | null
}
