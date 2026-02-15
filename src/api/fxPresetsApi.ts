// A single effect within a preset
export interface FxPresetEffect {
  effectType: string
  category: string
  propertyName: string | null
  beatDivision: number
  blendMode: string
  distribution: string
  phaseOffset: number
  elementMode: string | null
  parameters: Record<string, string>
}

// Full preset from API
export interface FxPreset {
  id: number
  name: string
  description: string | null
  effects: FxPresetEffect[]
  canEdit: boolean
  canDelete: boolean
}

// Input for create/update
export interface FxPresetInput {
  name: string
  description?: string | null
  effects: FxPresetEffect[]
}

// Copy request/response
export interface CopyPresetRequest {
  targetProjectId: number
  newName?: string
}

export interface CopyPresetResponse {
  presetId: number
  presetName: string
  targetProjectId: number
  targetProjectName: string
  message: string
}
