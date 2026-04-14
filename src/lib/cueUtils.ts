import type { Cue, CueInput } from '@/api/cuesApi'
import { formatMs } from './formatMs'

const CURVE_LABELS: Record<string, string> = {
  LINEAR: 'LIN',
  EASE_IN_OUT: 'SINE',
  SINE_IN_OUT: 'SINE',
  CUBIC_IN_OUT: 'CUB',
  EASE_IN: '\u2191',
  EASE_OUT: '\u2193',
}

/** Format fade duration + curve into a compact label like "2.0s SINE" or "SNAP". */
export function formatFadeText(fadeDurationMs: number | null, fadeCurve: string): string {
  if (fadeDurationMs != null && fadeDurationMs > 0) {
    return `${formatMs(fadeDurationMs)} ${CURVE_LABELS[fadeCurve] ?? ''}`.trim()
  }
  return 'SNAP'
}

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
