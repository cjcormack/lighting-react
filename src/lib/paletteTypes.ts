import type { PaletteType } from '@/api/palettesApi'
import type { ColumnKey } from '@/components/fixtures-list/columns'

export const PALETTE_TYPES: readonly PaletteType[] = ['INTENSITY', 'POSITION', 'COLOUR', 'BEAM']

/** Operator-facing labels. Plural names the *bank*, which is what the palette pages show. */
export const PALETTE_TYPE_LABELS: Record<PaletteType, { singular: string; plural: string }> = {
  INTENSITY: { singular: 'Intensity', plural: 'Intensities' },
  POSITION: { singular: 'Position', plural: 'Positions' },
  COLOUR: { singular: 'Colour', plural: 'Colours' },
  BEAM: { singular: 'Beam', plural: 'Beams' },
}

/**
 * Which sheet columns each palette type covers.
 *
 * **Derived from the backend's `PropertyCategory.maskGroup()`, not guessed.** The non-obvious one
 * is `strobe`: it sits in INTENSITY rather than BEAM, because it is an intensity modulation (HTP,
 * like dimmer) and operators reach for it alongside level. Getting this wrong would make a column
 * editable from the wrong palette page — or from none.
 *
 * Invariant, asserted in `columns.test.ts`: every `ColumnKey` appears in exactly one type.
 */
export const PALETTE_TYPE_COLUMNS: Record<PaletteType, readonly ColumnKey[]> = {
  INTENSITY: ['dimmer', 'strobe'],
  POSITION: ['position'],
  COLOUR: ['colour'],
  BEAM: ['gobo', 'zoom', 'focus', 'iris', 'prism', 'speed'],
}

/** URL slug for a type, e.g. `COLOUR` → `colour`. */
export function paletteTypeSlug(type: PaletteType): string {
  return type.toLowerCase()
}

/**
 * Parse a URL slug back to a type, or null when it isn't one.
 *
 * Null must make the route redirect rather than render — a hand-edited or stale bookmark should
 * land somewhere, not on a blank page. Deliberately strict: only the exact lowercase slug, so a
 * typo can't be coerced into a plausible-looking type.
 */
export function parsePaletteTypeSlug(raw: string | undefined): PaletteType | null {
  if (!raw) return null
  return PALETTE_TYPES.find((type) => paletteTypeSlug(type) === raw) ?? null
}
