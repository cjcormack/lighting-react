import {
  Braces,
  Sparkles,
  AudioWaveform,
  Calculator,
  Database,
  Layers,
  LayoutGrid,
  Play,
  Repeat,
  Spotlight,
  IterationCw,
  type LucideIcon,
} from 'lucide-react'
import type { ScriptType } from '@/store/scripts'
import type { ProjectScriptDetail } from '@/api/projectApi'

export const SCRIPT_TYPE_LABELS: Record<ScriptType, string> = {
  GENERAL: 'General',
  FX_DEFINITION: 'FX Definition',
  FX_APPLICATION: 'FX Application',
  FX_CALC: 'FX Calc',
  FX_CALC_STATEFUL: 'FX Calc Stateful',
  FX_CALC_COMPOSITE: 'FX Calc Composite',
}

export const SCRIPT_TYPE_DESCRIPTIONS: Record<ScriptType, string> = {
  GENERAL: 'General-purpose scripts for lighting automation, scenes, and chases. Has access to fixtures, the show, FX engine, and coroutines.',
  FX_DEFINITION: 'Defines a reusable effect type that appears in the FX Library. Specifies parameters, properties, and the calculation logic.',
  FX_APPLICATION: 'Applies effects to fixtures. Used by cue triggers and scenes to set up and run effect instances on the FX engine.',
  FX_CALC: 'Stateless effect calculation. Receives a phase value (0-1) and parameters, returns output values. Runs every tick.',
  FX_CALC_STATEFUL: 'Stateful effect calculation with a persistent state map. Receives clock ticks and delta time for time-based effects.',
  FX_CALC_COMPOSITE: 'Composite effect calculation that can combine or layer multiple sub-effects. Receives phase and parameters.',
}

export const ALL_SCRIPT_TYPES: ScriptType[] = [
  'GENERAL',
  'FX_DEFINITION',
  'FX_APPLICATION',
  'FX_CALC',
  'FX_CALC_STATEFUL',
  'FX_CALC_COMPOSITE',
]

export const SCRIPT_TYPE_ICONS: Record<ScriptType, LucideIcon> = {
  GENERAL: Braces,
  FX_DEFINITION: Sparkles,
  FX_APPLICATION: AudioWaveform,
  FX_CALC: Calculator,
  FX_CALC_STATEFUL: Database,
  FX_CALC_COMPOSITE: Layers,
}

export type ScriptUsage = {
  icon: LucideIcon
  tooltip: string
}

export function getScriptUsage(script: ProjectScriptDetail): ScriptUsage {
  // Priority: Project properties > Scenes > Chases > Unmapped
  if (script.usedByProperties && script.usedByProperties.length > 0) {
    if (script.usedByProperties.includes('loadFixturesScript')) {
      return { icon: LayoutGrid, tooltip: 'Load Fixtures Script' }
    }
    if (script.usedByProperties.includes('trackChangedScript')) {
      return { icon: Play, tooltip: 'Track Changed Script' }
    }
    if (script.usedByProperties.includes('runLoopScript')) {
      return { icon: Repeat, tooltip: 'Run Loop Script' }
    }
  }

  if (script.sceneNames && script.sceneNames.length > 0) {
    const count = script.sceneNames.length
    return {
      icon: Spotlight,
      tooltip: count === 1 ? `Used by scene: ${script.sceneNames[0]}` : `Used by ${count} scenes`,
    }
  }

  if (script.chaseNames && script.chaseNames.length > 0) {
    const count = script.chaseNames.length
    return {
      icon: IterationCw,
      tooltip: count === 1 ? `Used by chase: ${script.chaseNames[0]}` : `Used by ${count} chases`,
    }
  }

  return { icon: Braces, tooltip: 'Not used' }
}

export function getScriptTypeUsage(scriptType: ScriptType): ScriptUsage | null {
  switch (scriptType) {
    case 'FX_DEFINITION':
      return { icon: Sparkles, tooltip: 'FX Definition Script' }
    case 'FX_APPLICATION':
      return { icon: AudioWaveform, tooltip: 'FX Application Script' }
    default:
      return null // GENERAL and FX_CALC types use the regular usage-based icon
  }
}

export const SCRIPT_TYPE_TEMPLATES: Record<ScriptType, string> = {
  GENERAL: `// Available: show, fixtures, fxEngine, settings, coroutineScope, currentTrack
// sceneName, sceneIsActive, step, scriptName

// Set all fixtures to a colour
for (fixture in fixtures) {
    fixture.setDimmer()
    if (fixture is FixtureWithColor) {
        fixture.setColor(Color.BLUE)
    }
}
`,
  FX_DEFINITION: `// Define an effect type for the FX Library
// Available: show, settings, scriptId

// Register parameters that users can configure
val dimParam = registerFloatParam("dim", "Dimmer", 0.0, 1.0, 1.0)

// Register the effect properties
registerProperty("intensity", FixturePropertyType.INTENSITY)

// Set the calculation script (by name or ID)
// setCalcScript("MyCalcScript")

`,
  FX_APPLICATION: `// Apply effects to fixtures
// Available: show, fxEngine, settings, currentTrack, step

// Look up fixtures
// val group = show.fixtureGroups["My Group"]

// Apply an effect from the library
// fxEngine.applyEffect("MyEffect", fixtures, mapOf())

`,
  FX_CALC: `// Stateless effect calculation — runs every tick
// Available: phase (0.0–1.0), context, params

// Read parameters
// val dim = params.getFloat("dim")

// Calculate output based on phase
val value = sin(phase * 2 * PI)

// Set output properties
context.setIntensity(((value + 1) / 2).toFloat())

`,
  FX_CALC_STATEFUL: `// Stateful effect calculation with persistent state
// Available: tick, deltaMs, context, params, state

// Initialise state on first tick
if ("pos" !in state) {
    state["pos"] = 0.0
}

// Update state based on time
val speed = params.getFloat("speed")
val pos = (state["pos"] as Double) + speed * deltaMs / 1000.0
state["pos"] = pos % 1.0

// Set output
context.setIntensity(pos.toFloat())

`,
  FX_CALC_COMPOSITE: `// Composite effect calculation — combine or layer sub-effects
// Available: phase, context, params

// Layer multiple wave shapes together
val sine = sin(phase * 2 * PI)
val triangle = 1 - 4 * abs(phase - 0.5)

// Mix the two shapes using a parameter
val mix = params.getFloat("mix")
val combined = sine * (1 - mix) + triangle * mix

context.setIntensity(((combined + 1) / 2).toFloat())

`,
}

/** Get the display icon/tooltip for a script, preferring type-based for FX scripts. */
export function getScriptDisplayUsage(script: ProjectScriptDetail): ScriptUsage {
  const typeUsage = getScriptTypeUsage(script.scriptType)
  if (typeUsage) return typeUsage
  return getScriptUsage(script)
}
