import type { Cue, CueInput, CueLayer } from '@/api/cuesApi'
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

/** The curve half of `formatFadeText` on its own — for layouts that make the duration editable. */
export function formatFadeCurve(fadeCurve: string): string {
  return CURVE_LABELS[fadeCurve] ?? ''
}

/** The duration half of `formatFadeText`: "2.0s", "500ms", or '' for a snap. */
export function formatFadeDuration(fadeDurationMs: number | null): string {
  if (fadeDurationMs != null && fadeDurationMs > 0) return formatMs(fadeDurationMs)
  return ''
}

/**
 * Parse a fade duration typed by an operator into milliseconds.
 *
 * Accepts an explicit unit ("500ms", "2s", "1.5m") or a bare number, which is read
 * as **seconds** — the console convention, and the unit the table shows fades in.
 * Empty / "0" / "snap" mean no fade.
 *
 * Returns `null` for a snap and `undefined` when the text can't be parsed, so
 * callers can distinguish "clear the fade" from "reject this input".
 */
export function parseFadeDuration(raw: string): number | null | undefined {
  const text = raw.trim()
  if (text === '' || /^snap$/i.test(text)) return null
  const match = /^(\d*\.?\d+)\s*(ms|msec|s|sec|secs|m|min)?$/i.exec(text)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value) || value < 0) return undefined
  const unit = (match[2] ?? 's').toLowerCase()
  const ms =
    unit === 'ms' || unit === 'msec'
      ? value
      : unit === 'm' || unit === 'min'
        ? value * 60_000
        : value * 1000
  const rounded = Math.round(ms)
  return rounded > 0 ? rounded : null
}

/** Find the next available name of the form "{base}", "{base} 2", "{base} 3"… */
export function nextAvailableName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base} ${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base} ${Date.now()}`
}

/** Build a CueInput snapshot from a Cue (for inline editing mutations). */
export function buildCueInput(cue: Cue): CueInput {
  return {
    name: cue.name,
    palette: cue.palette,
    updateGlobalPalette: cue.updateGlobalPalette,
    layers: cue.layers.map((layer) => ({
      lookId: layer.lookId,
      sortOrder: layer.sortOrder,
      enabled: layer.enabled,
      targets: layer.targets,
      propertyMask: layer.propertyMask,
      blendMode: layer.blendMode,
      amount: layer.amount,
      stomp: layer.stomp,
      // Rebuilt field-by-field (unlike adHocEffects' spread) because the detail row carries
      // lookName, which the input type must not. The cost of that shape is that every new field
      // must be added HERE too, or every inline cue edit silently strips it — which is what a
      // regression test in cueUtils.test.ts pins, field by field.
      speedMasterUuid: layer.speedMasterUuid,
      rateSpeedMasterUuid: layer.rateSpeedMasterUuid,
      delayMs: layer.delayMs,
      intervalMs: layer.intervalMs,
      randomWindowMs: layer.randomWindowMs,
    })),
    adHocEffects: cue.adHocEffects.map((e) => ({ ...e })),
    propertyAssignments: cue.propertyAssignments.map((a) => ({ ...a })),
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
    // Round-tripped so a PUT can't reinterpret a MARKER as a STANDARD cue. (The server ignores
    // cueType on PUT, but sending the truth keeps the payload honest if that ever changes.)
    cueType: cue.cueType,
  }
}

/**
 * Move a layer within a cue's ordered composition and restate every `sortOrder` from its position.
 *
 * Rewriting the whole list rather than the two moved entries is what keeps the order dense and
 * gap-free, and `sortOrder` is the authoritative playback order — the array position is only how
 * this client happens to hold it. A stale gap would resolve fine, but two layers sharing a
 * `sortOrder` would leave the tie to insertion order in the cook step, which is exactly the
 * accident the layer model exists to remove.
 *
 * Pure, and separate from the component, because dnd-kit's pointer sequence is not drivable with
 * `fireEvent` — this is the half that can be tested directly.
 */
export function reorderCueLayers<T extends CueLayer>(
  layers: readonly T[],
  oldIndex: number,
  newIndex: number,
): T[] {
  const next = [...layers]
  if (
    oldIndex < 0 ||
    newIndex < 0 ||
    oldIndex >= next.length ||
    newIndex >= next.length ||
    oldIndex === newIndex
  ) {
    // Still restate sortOrder: a no-op drag on a list that arrived with gaps should not leave them.
    return next.map((layer, index) => ({ ...layer, sortOrder: index }))
  }
  const [moved] = next.splice(oldIndex, 1)
  next.splice(newIndex, 0, moved)
  return next.map((layer, index) => ({ ...layer, sortOrder: index }))
}

/**
 * Restate every `sortOrder` from array position without moving anything.
 *
 * The insert and remove paths need exactly this — a list that arrived with gaps (a migrated cue, an
 * older client's edit) must not hand the appended layer a `sortOrder` another layer already holds,
 * and removing the middle of three must not leave 0 and 2 for a later insert to land in. Named,
 * because expressing it as `reorderCueLayers(layers, 0, 0)` reads as a move and relies on that
 * function's guard clause to mean "renumber".
 */
export function densifyCueLayerOrder<T extends CueLayer>(layers: readonly T[]): T[] {
  return layers.map((layer, index) => ({ ...layer, sortOrder: index }))
}
