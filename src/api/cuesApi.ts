// Cue target (fixture or group)
export interface CueTarget {
  type: 'group' | 'fixture'
  key: string
}

// Preset application within a cue (with optional timing)
export interface CuePresetApplication {
  presetId: number
  targets: CueTarget[]
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
  sortOrder?: number
}

// Resolved preset application with name (from API response)
export interface CuePresetApplicationDetail {
  presetId: number
  presetName: string | null
  targets: CueTarget[]
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
  sortOrder?: number
}

// Ad-hoc effect stored inline in a cue (with optional timing)
export interface CueAdHocEffect {
  targetType: 'group' | 'fixture'
  targetKey: string
  effectType: string
  category: string
  propertyName: string | null
  beatDivision: number
  blendMode: string
  distribution: string
  phaseOffset: number
  elementMode: string | null
  elementFilter: string | null
  stepTiming: boolean | null
  parameters: Record<string, string>
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
  sortOrder?: number
}

// ─── Script trigger types ──────────────────────────────────────────

export type TriggerType = 'ACTIVATION' | 'DEACTIVATION'

/** Script trigger definition for create/update */
export interface CueTrigger {
  triggerType: TriggerType
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
  scriptId: number
  sortOrder?: number
}

/** Script trigger with resolved name (from API response) */
export interface CueTriggerDetail {
  triggerType: TriggerType
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
  scriptId: number
  scriptName?: string | null
  sortOrder?: number
}

// Full cue from API
export interface Cue {
  id: number
  name: string
  palette: string[]
  updateGlobalPalette: boolean
  presetApplications: CuePresetApplicationDetail[]
  adHocEffects: CueAdHocEffect[]
  triggers: CueTriggerDetail[]
  cueStackId: number | null
  cueStackName: string | null
  sortOrder: number
  autoAdvance: boolean
  autoAdvanceDelayMs: number | null
  fadeDurationMs: number | null
  fadeCurve: string
  cueNumber: string | null
  notes: string | null
  canEdit: boolean
  canDelete: boolean
}

// Input for create/update
export interface CueInput {
  name: string
  palette: string[]
  updateGlobalPalette: boolean
  presetApplications: CuePresetApplication[]
  adHocEffects: CueAdHocEffect[]
  triggers?: CueTrigger[]
  cueStackId?: number | null
  sortOrder?: number
  autoAdvance?: boolean
  autoAdvanceDelayMs?: number | null
  fadeDurationMs?: number | null
  fadeCurve?: string
  cueNumber?: string | null
  notes?: string | null
}

// Copy request/response
export interface CopyCueRequest {
  targetProjectId: number
  newName?: string
}

export interface CopyCueResponse {
  cueId: number
  cueName: string
  targetProjectId: number
  targetProjectName: string
  message: string
}

// Apply response
export interface ApplyCueResponse {
  effectCount: number
  cueName: string
}

// Stop response
export interface StopCueResponse {
  removedCount: number
  cueId: number
}

// Current lighting state snapshot (palette + active effects)
export interface CueCurrentState {
  palette: string[]
  presetApplications: CuePresetApplicationDetail[]
  adHocEffects: CueAdHocEffect[]
}
