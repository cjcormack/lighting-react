import type { ColumnKey } from '@/components/fixtures-list/columns'
import type { PropertyCategory } from '@/store/fixtures'

/**
 * An attribute family — the backend's `PropertyMaskGroup`, and what a Look's `families` are drawn
 * from. It is derived, never declared: a Look spanning colour and position reports both.
 *
 * Called "family" rather than "palette type" because a Look has no type, and because "palette" now
 * means exactly one thing in this codebase — the positional colour list that FX parameters index
 * as `P1`/`P2`.
 */
export type AttributeFamily = 'INTENSITY' | 'POSITION' | 'COLOUR' | 'BEAM'

export const ATTRIBUTE_FAMILIES: readonly AttributeFamily[] = ['INTENSITY', 'POSITION', 'COLOUR', 'BEAM']

/** Operator-facing labels. Plural names the *bank*, which is what the library's filter shows. */
export const FAMILY_LABELS: Record<AttributeFamily, { singular: string; plural: string }> = {
  INTENSITY: { singular: 'Intensity', plural: 'Intensities' },
  POSITION: { singular: 'Position', plural: 'Positions' },
  COLOUR: { singular: 'Colour', plural: 'Colours' },
  BEAM: { singular: 'Beam', plural: 'Beams' },
}

/**
 * Which sheet columns each attribute family covers.
 *
 * **Derived from the backend's `PropertyCategory.maskGroup()`, not guessed.** The non-obvious one
 * is `strobe`: it sits in INTENSITY rather than BEAM, because it is an intensity modulation (HTP,
 * like dimmer) and operators reach for it alongside level. Getting this wrong would make a column
 * editable from the wrong family filter — or from none.
 *
 * Invariant, asserted in `attributeFamily.test.ts`: every `ColumnKey` appears in exactly one
 * family.
 *
 * **No production caller today.** Its two — `applyPalette.ts` and the cue-assignment sheet's
 * reference picker — went with the value-level reference surfaces they belonged to. Kept, rather
 * than deleted with them, because the mapping mirrors the backend and the programmer rewrite wants
 * exactly this question answered; but do not read its existence as evidence that something depends
 * on it.
 */
export const FAMILY_COLUMNS: Record<AttributeFamily, readonly ColumnKey[]> = {
  INTENSITY: ['dimmer', 'strobe'],
  POSITION: ['position'],
  COLOUR: ['colour'],
  BEAM: ['gobo', 'zoom', 'focus', 'iris', 'prism', 'speed'],
}

/**
 * Which attribute family a property belongs to, from its category.
 *
 * A direct mirror of the backend's `PropertyCategory.maskGroup()` (`fx/PropertyMask.kt`), which
 * is the only definition that matters — a family *is* a mask group, so a client that classified a
 * property differently would file a Look under an attribute it cannot cover.
 *
 * Keep in step with that function. The two non-obvious arms: `strobe` is INTENSITY (an intensity
 * modulation, HTP like dimmer), and the extra emitters — amber, white, UV — are COLOUR, because
 * they are emitters of the same mixed colour and splitting them out would record half a look.
 *
 * `position` is the synthetic pan/tilt pair, which has no category of its own; it is handled by
 * the `pan`/`tilt` arms via the descriptors it was built from.
 */
const FAMILY_BY_CATEGORY: Record<PropertyCategory, AttributeFamily> = {
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

/** Also has **no production caller today** — see the note on [FAMILY_COLUMNS]. */
export function familyForCategory(category: string): AttributeFamily {
  // `position` is the synthetic pan/tilt pair. It has no entry in `PropertyCategory` — the
  // backend answers it before its own category lookup for the same reason — but it does appear
  // as a descriptor's category, so it is answered here rather than falling into BEAM.
  if (category === 'position') return 'POSITION'
  // Loose `string` rather than `PropertyCategory`, because group property descriptors carry an
  // untyped category off the wire. The Record above still forces every known category to be
  // classified; an unrecognised one lands in BEAM, which is where the backend's own catch-all
  // categories (`SETTING`, `OTHER`) go.
  return FAMILY_BY_CATEGORY[category as PropertyCategory] ?? 'BEAM'
}

/** URL slug for a family, e.g. `COLOUR` → `colour`. */
export function familySlug(type: AttributeFamily): string {
  return type.toLowerCase()
}

/**
 * Parse a URL slug back to a family, or null when it isn't one.
 *
 * Null means "no family filter", which the library renders as All rather than as a blank page — a
 * hand-edited or stale `?family=` should land somewhere. Deliberately strict: only the exact
 * lowercase slug, so a typo can't be coerced into a plausible-looking family.
 */
export function parseFamilySlug(raw: string | undefined): AttributeFamily | null {
  if (!raw) return null
  return ATTRIBUTE_FAMILIES.find((type) => familySlug(type) === raw) ?? null
}
