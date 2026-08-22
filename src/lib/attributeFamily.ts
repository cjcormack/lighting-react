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

/**
 * Its caller is `RecordLookSheet`'s per-family counts: a Look has no declared type, so an unmasked
 * record captures whatever the programmer holds, and this is what lets the mask picker say what
 * that is before the operator finds out afterwards.
 *
 * There was a sibling constant here, `FAMILY_COLUMNS`, mapping a family to the sheet columns it
 * covers. It was deleted rather than kept a third time: its two callers went with the value-level
 * reference surfaces they belonged to, and the programmer rewrite that was supposed to want it
 * needed the question the other way round — from an entry's category to a family, which is this.
 */
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
