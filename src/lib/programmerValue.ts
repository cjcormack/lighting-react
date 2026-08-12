import {
  NAMED_COLOURS,
  hexToRgb,
  parseExtendedColour,
  rgbToHex,
  serializeExtendedColour,
} from '../components/fx/colourUtils'

/**
 * The canonical assignment-value string form shared by cue assignments and the programmer
 * (`Layer3Resolver.PropertyValue.serialize()` / `parseAssignmentValue()` in lighting7):
 *
 * - sliders and settings — `"0".."255"`
 * - colours — `"#rrggbb"` with optional `;wNNN` / `;aNNN` / `;uvNNN` tags, emitted only for
 *   non-zero components
 * - position — `"pan,tilt"`, each `0..255`
 *
 * We need to read it (not just write it) because of **blind**: while the programmer's
 * contribution is gated out of the merge, the staged value exists only in `programmer.state`
 * — the wire values the sheet normally displays still show the layers underneath.
 *
 * Palette refs (`"P1"`) are deliberately not handled: the store keeps `Hard(resolved)` values
 * and serializes the *resolved* colour, so a ref never reaches this parser today. Session 4
 * (palettes as first-class references) is where that changes.
 */
export type ProgrammerParsedValue =
  | { kind: 'level'; value: number }
  | { kind: 'colour'; r: number; g: number; b: number; w: number; a: number; uv: number }
  | { kind: 'position'; pan: number; tilt: number }

const LEVEL_RE = /^\d{1,3}$/
const POSITION_RE = /^(\d{1,3}),(\d{1,3})$/

/**
 * Parse a programmer/assignment value. Returns null for anything that doesn't match the
 * canonical grammar (an unresolved palette ref, a future value form, or junk) — callers
 * fall back to the live DMX value rather than rendering a guess.
 */
export function parseProgrammerValue(value: string): ProgrammerParsedValue | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (LEVEL_RE.test(trimmed)) {
    const level = Number(trimmed)
    return level <= 255 ? { kind: 'level', value: level } : null
  }

  const position = POSITION_RE.exec(trimmed)
  if (position) {
    const pan = Number(position[1])
    const tilt = Number(position[2])
    if (pan > 255 || tilt > 255) return null
    return { kind: 'position', pan, tilt }
  }

  // Everything else must be colour-shaped: `#rrggbb` / `#rgb`, or one of the backend's named
  // colours, either optionally followed by `;wNNN` etc.
  //
  // The check is deliberately against the *known* names rather than "is it alphabetic":
  // `resolveColourToHex` treats any three letters in a-f as hex shorthand and silently
  // returns black for everything else, so a looser gate turns junk into a confident-looking
  // swatch — "bad" becomes lilac, "gobo" becomes black — instead of falling back to the live
  // DMX value the way an unparseable value is supposed to.
  const head = trimmed.split(';')[0].trim()
  const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(head)
  const isNamed = Object.hasOwn(NAMED_COLOURS, head.toLowerCase())
  if (!isHex && !isNamed) return null

  const extended = parseExtendedColour(trimmed)
  const { r, g, b } = hexToRgb(extended.hex)
  return { kind: 'colour', r, g, b, w: extended.white, a: extended.amber, uv: extended.uv }
}

/** Serialize a slider or setting level. */
export function serializeLevel(level: number): string {
  return String(Math.max(0, Math.min(255, Math.round(level))))
}

/** Serialize a position pair. */
export function serializePosition(pan: number, tilt: number): string {
  return `${serializeLevel(pan)},${serializeLevel(tilt)}`
}

/** Serialize a colour, emitting `w`/`a`/`uv` tags only for non-zero components. */
export function serializeColour(
  r: number,
  g: number,
  b: number,
  w = 0,
  a = 0,
  uv = 0,
): string {
  return serializeExtendedColour({ hex: rgbToHex(r, g, b), white: w, amber: a, uv })
}
