import type { PaletteType } from '@/api/palettesApi'
import type { ColumnKey } from '@/components/fixtures-list/columns'
import type { PropertyCategory } from '@/store/fixtures'

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

/**
 * Which palette type covers a property, from its category.
 *
 * A direct mirror of the backend's `PropertyCategory.maskGroup()` (`fx/PropertyMask.kt`), which
 * is the only definition that matters — the palette type *is* the mask, so a client that
 * classified a property differently would offer a palette that could never resolve on it.
 *
 * Keep in step with that function. The two non-obvious arms: `strobe` is INTENSITY (an intensity
 * modulation, HTP like dimmer), and the extra emitters — amber, white, UV — are COLOUR, because
 * they are emitters of the same mixed colour and splitting them out would record half a look.
 *
 * `position` is the synthetic pan/tilt pair, which has no category of its own; it is handled by
 * the `pan`/`tilt` arms via the descriptors it was built from.
 */
const PALETTE_TYPE_BY_CATEGORY: Record<PropertyCategory, PaletteType> = {
  dimmer: 'INTENSITY',
  strobe: 'INTENSITY',
  pan: 'POSITION',
  tilt: 'POSITION',
  pan_fine: 'POSITION',
  tilt_fine: 'POSITION',
  colour: 'COLOUR',
  amber: 'COLOUR',
  white: 'COLOUR',
  uv: 'COLOUR',
  gobo: 'BEAM',
  gobo_rotation: 'BEAM',
  prism: 'BEAM',
  prism_rotation: 'BEAM',
  focus: 'BEAM',
  zoom: 'BEAM',
  iris: 'BEAM',
  frost: 'BEAM',
  led_macro: 'BEAM',
  movement_macro: 'BEAM',
  speed: 'BEAM',
  setting: 'BEAM',
  other: 'BEAM',
}

export function paletteTypeForCategory(category: string): PaletteType {
  // `position` is the synthetic pan/tilt pair. It has no entry in `PropertyCategory` — the
  // backend answers it before its own category lookup for the same reason — but it does appear
  // as a descriptor's category, so it is answered here rather than falling into BEAM.
  if (category === 'position') return 'POSITION'
  // Loose `string` rather than `PropertyCategory`, because group property descriptors carry an
  // untyped category off the wire. The Record above still forces every known category to be
  // classified; an unrecognised one lands in BEAM, which is where the backend's own catch-all
  // categories (`SETTING`, `OTHER`) go.
  return PALETTE_TYPE_BY_CATEGORY[category as PropertyCategory] ?? 'BEAM'
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
