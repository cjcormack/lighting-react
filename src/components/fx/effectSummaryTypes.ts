/**
 * Normalised effect data and adapter functions for the unified EffectSummary component.
 */
import type { FxPresetEffect } from '@/api/fxPresetsApi'
import type { CueAdHocEffect } from '@/api/cuesApi'
import type {
  FixtureDirectEffect,
  FixtureIndirectEffect,
  EffectLibraryEntry,
  EffectParameterDef,
} from '@/store/fixtureFx'
import type { GroupActiveEffect } from '@/api/groupsApi'
import { EFFECT_DESCRIPTIONS } from './fxConstants'

/** Normalised effect data consumed by EffectSummary. */
export interface EffectSummaryData {
  effectType: string
  category: string
  propertyName: string | null
  beatDivision: number
  blendMode: string
  distribution: string | null
  phaseOffset: number | null
  stepTiming: boolean | null
  elementMode: string | null
  elementFilter: string | null
  parameters: Record<string, string>
  /** Parameter definitions from effect library — used to determine param types for colour swatch rendering. */
  parameterDefs?: EffectParameterDef[]
}

// ─── Category inference ────────────────────────────────────────────────────

/** Map effectType names to categories (derived from EFFECT_DESCRIPTIONS). */
const EFFECT_CATEGORY_MAP: Record<string, string> = {}

// Build the map from known effect names
const DIMMER_EFFECTS = ['sinewave', 'rampup', 'rampdown', 'triangle', 'pulse', 'squarewave', 'strobe', 'flicker', 'breathe', 'staticvalue']
const COLOUR_EFFECTS = ['colourcycle', 'rainbowcycle', 'colourstrobe', 'colourpulse', 'colourfade', 'colourflicker', 'staticcolour']
const POSITION_EFFECTS = ['circle', 'figure8', 'sweep', 'pansweep', 'tiltsweep', 'randomposition', 'staticposition']
const CONTROLS_EFFECTS = ['staticsetting']

for (const name of DIMMER_EFFECTS) EFFECT_CATEGORY_MAP[name] = 'dimmer'
for (const name of COLOUR_EFFECTS) EFFECT_CATEGORY_MAP[name] = 'colour'
for (const name of POSITION_EFFECTS) EFFECT_CATEGORY_MAP[name] = 'position'
for (const name of CONTROLS_EFFECTS) EFFECT_CATEGORY_MAP[name] = 'controls'

/** Look up category from the effect library, falling back to a static map. */
export function lookupCategory(
  effectType: string,
  library?: EffectLibraryEntry[],
): string {
  if (library) {
    const entry = library.find((e) => e.name === effectType)
    if (entry) return entry.category
  }
  return EFFECT_CATEGORY_MAP[effectType.toLowerCase()] ?? 'dimmer'
}

/** Look up parameter defs from the effect library. */
function lookupParameterDefs(
  effectType: string,
  library?: EffectLibraryEntry[],
): EffectParameterDef[] | undefined {
  if (!library) return undefined
  const entry = library.find((e) => e.name === effectType)
  return entry?.parameters
}

// ─── Adapter functions ─────────────────────────────────────────────────────

export function fromPresetEffect(
  e: FxPresetEffect,
  library?: EffectLibraryEntry[],
): EffectSummaryData {
  return {
    effectType: e.effectType,
    category: e.category,
    propertyName: e.propertyName,
    beatDivision: e.beatDivision,
    blendMode: e.blendMode,
    distribution: e.distribution,
    phaseOffset: e.phaseOffset,
    stepTiming: e.stepTiming,
    elementMode: e.elementMode,
    elementFilter: e.elementFilter,
    parameters: e.parameters,
    parameterDefs: lookupParameterDefs(e.effectType, library),
  }
}

export function fromCueAdHocEffect(
  e: CueAdHocEffect,
  library?: EffectLibraryEntry[],
): EffectSummaryData {
  return {
    effectType: e.effectType,
    category: e.category,
    propertyName: e.propertyName,
    beatDivision: e.beatDivision,
    blendMode: e.blendMode,
    distribution: e.distribution,
    phaseOffset: e.phaseOffset,
    stepTiming: e.stepTiming,
    elementMode: e.elementMode,
    elementFilter: e.elementFilter,
    parameters: e.parameters,
    parameterDefs: lookupParameterDefs(e.effectType, library),
  }
}

export function fromFixtureDirectEffect(
  e: FixtureDirectEffect,
  library?: EffectLibraryEntry[],
): EffectSummaryData {
  return {
    effectType: e.effectType,
    category: lookupCategory(e.effectType, library),
    propertyName: e.propertyName,
    beatDivision: e.beatDivision,
    blendMode: e.blendMode,
    distribution: e.distributionStrategy,
    phaseOffset: e.phaseOffset,
    stepTiming: e.stepTiming,
    elementMode: null,
    elementFilter: e.elementFilter,
    parameters: e.parameters,
    parameterDefs: lookupParameterDefs(e.effectType, library),
  }
}

export function fromFixtureIndirectEffect(
  e: FixtureIndirectEffect,
  library?: EffectLibraryEntry[],
): EffectSummaryData {
  return {
    effectType: e.effectType,
    category: lookupCategory(e.effectType, library),
    propertyName: e.propertyName,
    beatDivision: e.beatDivision,
    blendMode: e.blendMode,
    distribution: e.distributionStrategy,
    phaseOffset: e.phaseOffset,
    stepTiming: e.stepTiming,
    elementMode: null,
    elementFilter: null,
    parameters: e.parameters,
    parameterDefs: lookupParameterDefs(e.effectType, library),
  }
}

export function fromGroupActiveEffect(
  e: GroupActiveEffect,
  library?: EffectLibraryEntry[],
): EffectSummaryData {
  return {
    effectType: e.effectType,
    category: lookupCategory(e.effectType, library),
    propertyName: e.propertyName,
    beatDivision: e.beatDivision,
    blendMode: e.blendMode,
    distribution: e.distribution,
    phaseOffset: e.phaseOffset,
    stepTiming: e.stepTiming,
    elementMode: e.elementMode,
    elementFilter: e.elementFilter,
    parameters: e.parameters,
    parameterDefs: lookupParameterDefs(e.effectType, library),
  }
}
