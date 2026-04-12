import type { Cue, CueInput } from '@/api/cuesApi'

/** Build a CueInput snapshot from a Cue (for inline editing mutations). */
export function buildCueInput(cue: Cue): CueInput {
  return {
    name: cue.name,
    palette: cue.palette,
    updateGlobalPalette: cue.updateGlobalPalette,
    presetApplications: cue.presetApplications.map((pa) => ({
      presetId: pa.presetId,
      targets: pa.targets,
      delayMs: pa.delayMs,
      intervalMs: pa.intervalMs,
      randomWindowMs: pa.randomWindowMs,
      sortOrder: pa.sortOrder,
    })),
    adHocEffects: cue.adHocEffects.map((e) => ({ ...e })),
    triggers: cue.triggers.map((t) => ({
      triggerType: t.triggerType,
      delayMs: t.delayMs,
      intervalMs: t.intervalMs,
      randomWindowMs: t.randomWindowMs,
      scriptId: t.scriptId,
      sortOrder: t.sortOrder,
    })),
    cueStackId: cue.cueStackId,
    sortOrder: cue.sortOrder,
    autoAdvance: cue.autoAdvance,
    autoAdvanceDelayMs: cue.autoAdvanceDelayMs,
    fadeDurationMs: cue.fadeDurationMs,
    fadeCurve: cue.fadeCurve,
    cueNumber: cue.cueNumber,
    notes: cue.notes,
  }
}
