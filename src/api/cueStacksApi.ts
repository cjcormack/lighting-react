// Type definitions for cue stacks API

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
}

export interface CueStack {
  id: number
  name: string
  palette: string[]
  loop: boolean
  cues: CueStackCueEntry[]
  activeCueId: number | null
  canEdit: boolean
  canDelete: boolean
}

export interface CueStackInput {
  name: string
  palette: string[]
  loop: boolean
}

export interface ReorderCuesRequest {
  cueIds: number[]
}

export interface AddCueToStackRequest {
  cueId: number
  sortOrder?: number
}

export interface RemoveCueFromStackRequest {
  cueId: number
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
