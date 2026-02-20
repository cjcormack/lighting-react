// Cue target (fixture or group)
export interface CueTarget {
  type: 'group' | 'fixture'
  key: string
}

// Preset application within a cue
export interface CuePresetApplication {
  presetId: number
  targets: CueTarget[]
}

// Resolved preset application with name (from API response)
export interface CuePresetApplicationDetail {
  presetId: number
  presetName: string | null
  targets: CueTarget[]
}

// Ad-hoc effect stored inline in a cue
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
}

// Full cue from API
export interface Cue {
  id: number
  name: string
  palette: string[]
  presetApplications: CuePresetApplicationDetail[]
  adHocEffects: CueAdHocEffect[]
  canEdit: boolean
  canDelete: boolean
}

// Input for create/update
export interface CueInput {
  name: string
  palette: string[]
  presetApplications: CuePresetApplication[]
  adHocEffects: CueAdHocEffect[]
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

// Create from state request
export interface CreateCueFromStateRequest {
  name: string
}
