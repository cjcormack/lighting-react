import { serializePaletteRef } from '@/lib/programmerValue'
import { PALETTE_TYPE_COLUMNS, PALETTE_TYPE_LABELS } from '@/lib/paletteTypes'
import { resolveCell, resolutionPropertyNames } from '@/components/fixtures-list/columns'
import type { Palette } from '@/api/palettesApi'
import type { WriteTarget } from '@/components/fixtures-list/rowModel'

/** One programmer write: a reference value on one fixture's property. */
export interface PaletteRefWrite {
  targetKey: string
  propertyName: string
  /** Always `ref:{uuid}` — the whole point is that the row keeps tracking the palette. */
  value: string
}

/**
 * Which programmer writes applying this palette to this selection comes to.
 *
 * Goes through `resolveCell` / `resolutionPropertyNames` rather than a fixed property name,
 * because the programmer is keyed by the *fixture's own* property names and those differ by
 * fixture type. Note a fixture with separate pan/tilt sliders yields two names for the single
 * Position column, so one palette can legitimately write two references to one head.
 *
 * A target with nothing in the palette's attribute family (no colour mixing on a plain dimmer)
 * produces no writes at all — which is what lets the caller name it as skipped instead of
 * sending a write the backend would silently drop.
 */
export function planPaletteRefWrites(
  palette: Pick<Palette, 'type' | 'uuid'>,
  targets: readonly WriteTarget[],
): PaletteRefWrite[] {
  const value = serializePaletteRef(palette.uuid)
  const writes: PaletteRefWrite[] = []
  for (const target of targets) {
    for (const col of PALETTE_TYPE_COLUMNS[palette.type]) {
      const resolution = resolveCell(target.properties, col)
      for (const propertyName of resolutionPropertyNames(resolution)) {
        writes.push({ targetKey: target.key, propertyName, value })
      }
    }
  }
  return writes
}

/** How many names to list before "and N more" — enough to recognise, short enough to read. */
const NAMED_SKIP_LIMIT = 3

/**
 * What the apply did *not* reach, as operator-facing warnings.
 *
 * Silence here would read as success, which is the failure mode the whole session exists to
 * remove. Two gaps are reported separately because the fix differs: a fixture with no property
 * in this attribute family was never applicable, while a fixture the palette simply doesn't
 * cover would work if the palette were re-recorded with it selected.
 *
 * Group rows are the honest limit — expanding one needs a per-group member fetch this path
 * doesn't make — so when the palette has any, coverage is reported as *unknown* rather than
 * guessed at. Claiming a fixture is uncovered when a group row covers it would send the operator
 * to re-record a palette that was already correct.
 */
export function paletteCoverageWarnings(
  palette: Pick<Palette, 'name' | 'type' | 'entries'>,
  targets: readonly WriteTarget[],
  writes: readonly PaletteRefWrite[],
): string[] {
  const written = new Set(writes.map((write) => write.targetKey))
  const warnings: string[] = []

  const inapplicable = targets.filter((target) => !written.has(target.key))
  if (inapplicable.length > 0) {
    warnings.push(
      `${describeTargets(inapplicable)} ${inapplicable.length === 1 ? 'has' : 'have'} no ` +
        `${PALETTE_TYPE_LABELS[palette.type].singular.toLowerCase()} properties — skipped.`,
    )
  }

  const applied = targets.filter((target) => written.has(target.key))
  if (applied.length === 0) return warnings

  const coveredKeys = new Set(
    palette.entries.filter((entry) => entry.targetType === 'fixture').map((e) => e.targetKey),
  )
  const uncovered = applied.filter((target) => !coveredKeys.has(target.key))
  if (uncovered.length === 0) return warnings

  if (palette.entries.some((entry) => entry.targetType === 'group')) {
    warnings.push(
      `Applied to ${applied.length}, but “${palette.name}” doesn’t name ` +
        `${describeTargets(uncovered)} directly — ${uncovered.length === 1 ? 'it' : 'they'} will ` +
        'only light if one of its group rows covers them.',
    )
    return warnings
  }
  warnings.push(
    `Applied to ${applied.length - uncovered.length} of ${applied.length} — ` +
      `${describeTargets(uncovered)} ${uncovered.length === 1 ? 'isn’t' : 'aren’t'} in ` +
      `“${palette.name}”.`,
  )
  return warnings
}

function describeTargets(targets: readonly WriteTarget[]): string {
  const names = targets.slice(0, NAMED_SKIP_LIMIT).map((target) => target.key)
  const rest = targets.length - names.length
  return rest > 0 ? `${names.join(', ')} and ${rest} more` : names.join(', ')
}
