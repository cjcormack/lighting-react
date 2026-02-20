import type { PropertyDescriptor } from '@/store/fixtures'

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
  elementFilter: string | null
  stepTiming: boolean | null
  parameters: Record<string, string>
}

// Full preset from API
export interface FxPreset {
  id: number
  name: string
  description: string | null
  fixtureType: string | null
  effects: FxPresetEffect[]
  canEdit: boolean
  canDelete: boolean
  cannotDeleteReason: string | null
  cueUsageCount: number
}

// Input for create/update
export interface FxPresetInput {
  name: string
  description?: string | null
  fixtureType?: string | null
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

// Toggle request/response
export interface TogglePresetTarget {
  type: 'group' | 'fixture'
  key: string
}

export interface TogglePresetRequest {
  targets: TogglePresetTarget[]
  beatDivision?: number
}

export interface TogglePresetResponse {
  action: 'applied' | 'removed'
  effectCount: number
}

// Maps effect category to the fixture capability it requires
const CATEGORY_TO_CAPABILITY: Record<string, string> = {
  dimmer: 'dimmer',
  colour: 'colour',
  position: 'position',
}

/** Infer required capabilities from a preset's effects. */
export function inferPresetCapabilities(effects: FxPresetEffect[]): string[] {
  const caps = new Set<string>()
  for (const e of effects) {
    const cap = CATEGORY_TO_CAPABILITY[e.category]
    if (cap) caps.add(cap)
  }
  return [...caps]
}

/**
 * Detect which extended colour channels (W/A/UV) a preset's effects use.
 *
 * Scans parameter values in colour-category effects for the extended format
 * (`;wNNN`, `;aNNN`, `;uvNNN`). Returns flags for which channels have non-zero
 * values, or undefined if none are used.
 */
export function inferPresetExtendedChannels(effects: FxPresetEffect[]): { white: boolean; amber: boolean; uv: boolean } | undefined {
  let white = false
  let amber = false
  let uv = false

  for (const e of effects) {
    if (e.category !== 'colour') continue
    for (const val of Object.values(e.parameters)) {
      if (!val.includes(';')) continue
      const parts = val.split(';')
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim().toLowerCase()
        if (part.startsWith('uv')) {
          const n = parseInt(part.slice(2), 10)
          if (n > 0) uv = true
        } else if (part.startsWith('w')) {
          const n = parseInt(part.slice(1), 10)
          if (n > 0) white = true
        } else if (part.startsWith('a')) {
          const n = parseInt(part.slice(1), 10)
          if (n > 0) amber = true
        }
      }
    }
  }

  if (!white && !amber && !uv) return undefined
  return { white, amber, uv }
}

// --- Fixture type hierarchy helpers ---

export interface FixtureTypeMode {
  typeKey: string
  modeName: string | null
  channelCount: number | null
  isRegistered: boolean
  capabilities: string[]
  properties: PropertyDescriptor[]
}

export interface FixtureTypeModel {
  model: string
  manufacturer: string | null
  modes: FixtureTypeMode[]
  isRegistered: boolean // true if any mode is registered
}

export interface FixtureTypeHierarchy {
  manufacturers: Map<string, FixtureTypeModel[]> // manufacturer -> models
  models: FixtureTypeModel[] // all models flat
  typeKeyToModel: Map<string, { manufacturer: string | null; model: string; mode: FixtureTypeMode }> // typeKey -> info
}

/** Input shape accepted by the hierarchy builder — works with both fixture list and fixture types API. */
interface FixtureTypeInput {
  typeKey: string
  manufacturer?: string | null
  model?: string | null
  modeName?: string | null
  channelCount?: number | null
  isRegistered?: boolean
  capabilities?: string[]
  properties?: PropertyDescriptor[]
  // Also accept the fixture list shape (mode as nested object)
  mode?: { modeName: string; channelCount: number } | null
}

/** Build a manufacturer > model > mode hierarchy from fixture type data. */
export function buildFixtureTypeHierarchy(
  fixtures: FixtureTypeInput[],
): FixtureTypeHierarchy {
  // Group by model identity (manufacturer + model)
  const modelMap = new Map<string, FixtureTypeModel>()
  const typeKeyToModel = new Map<string, { manufacturer: string | null; model: string; mode: FixtureTypeMode }>()

  for (const f of fixtures) {
    const manufacturer = f.manufacturer || null
    const model = f.model || f.typeKey
    const modelKey = `${manufacturer ?? ''}|||${model}`
    const isRegistered = f.isRegistered ?? true
    const mode: FixtureTypeMode = {
      typeKey: f.typeKey,
      modeName: f.modeName ?? f.mode?.modeName ?? null,
      channelCount: f.channelCount ?? f.mode?.channelCount ?? null,
      isRegistered,
      capabilities: f.capabilities ?? [],
      properties: f.properties ?? [],
    }

    if (!typeKeyToModel.has(f.typeKey)) {
      typeKeyToModel.set(f.typeKey, { manufacturer, model, mode })
    }

    let entry = modelMap.get(modelKey)
    if (!entry) {
      entry = { model, manufacturer, modes: [], isRegistered: false }
      modelMap.set(modelKey, entry)
    }
    // Avoid duplicate modes (same typeKey)
    if (!entry.modes.some((m) => m.typeKey === f.typeKey)) {
      entry.modes.push(mode)
    }
    if (isRegistered) {
      entry.isRegistered = true
    }
  }

  // Group by manufacturer
  const manufacturers = new Map<string, FixtureTypeModel[]>()
  const allModels: FixtureTypeModel[] = []
  for (const entry of modelMap.values()) {
    allModels.push(entry)
    const mfr = entry.manufacturer ?? ''
    let list = manufacturers.get(mfr)
    if (!list) {
      list = []
      manufacturers.set(mfr, list)
    }
    list.push(entry)
  }

  // Sort: registered first, then alphabetical by model
  const sortModels = (a: FixtureTypeModel, b: FixtureTypeModel) => {
    if (a.isRegistered !== b.isRegistered) return a.isRegistered ? -1 : 1
    return a.model.localeCompare(b.model)
  }
  for (const list of manufacturers.values()) {
    list.sort(sortModels)
  }
  allModels.sort(sortModels)

  return { manufacturers, models: allModels, typeKeyToModel }
}

/** Resolve a typeKey to a human-readable label. */
export function resolveFixtureTypeLabel(
  typeKey: string,
  hierarchy: FixtureTypeHierarchy,
): string {
  const info = hierarchy.typeKeyToModel.get(typeKey)
  if (!info) return typeKey
  const parts: string[] = []
  if (info.manufacturer) parts.push(info.manufacturer)
  parts.push(info.model)
  if (info.mode.modeName) parts.push(info.mode.modeName)
  return parts.join(' ')
}
