import type {
  SettingOption,
  SettingPropertyDescriptor,
  SliderPropertyDescriptor,
} from '../../store/fixtures'

/**
 * Pure decoding of the beam-shaping DMX channels into renderer inputs.
 *
 * Everything here is a total function of (descriptor, raw DMX value) — and of an
 * elapsed time where motion is involved, always passed in, never read from a
 * clock. That keeps the frame loop allocation-free, keeps the profile harness
 * reproducible, and makes the whole module unit-testable without a renderer.
 */

/** Layers in the gobo array texture. Layer 0 is "open" (no pattern). */
export const GOBO_SLOT_COUNT = 8

const TAU = Math.PI * 2

/** Raw DMX value of a slider- or setting-backed single-byte channel. */
export type ByteDescriptor = SliderPropertyDescriptor | SettingPropertyDescriptor

/**
 * The band containing `level`, as [start, end] inclusive.
 *
 * Setting options carry only a *start* level; a band runs until the next option
 * begins, and the last runs to 255. Deriving it here rather than adding an end
 * to every fixture enum keeps 28 Kotlin files untouched, and the derivation is
 * exactly the kind of off-by-one that deserves a test rather than being inlined.
 *
 * Options are assumed level-ascending, which is how the backend sorts them.
 */
export function settingBand(
  options: readonly SettingOption[],
  level: number,
): { start: number; end: number; index: number } {
  if (options.length === 0) return { start: 0, end: 255, index: -1 }
  let index = 0
  for (let i = options.length - 1; i >= 0; i--) {
    if (level >= options[i].level) {
      index = i
      break
    }
  }
  const start = options[index].level
  const end = index + 1 < options.length ? options[index + 1].level - 1 : 255
  return { start, end, index }
}

/** Fraction (0..1) of the way through the band containing `level`. */
function bandFraction(options: readonly SettingOption[], level: number): number {
  const { start, end } = settingBand(options, level)
  if (end <= start) return 0
  return Math.max(0, Math.min(1, (level - start) / (end - start)))
}

// Option names meaning "this position does nothing" — open gate, no gobo, no
// prism, rotation stopped. Matched case-insensitively after stripping digits so
// OPEN_WHITE_2 and ROTATION_STOP_2 fall in with their unsuffixed siblings.
const NO_OP_NAMES = new Set([
  'OPEN',
  'OPENWHITE',
  'WHITE',
  'NOFUNCTION',
  'NONE',
  'OFF',
  'ROTATIONSTOP',
  'STOP',
  'NOROT',
  'NOROTATION',
  'PRISMOFF',
])

function normaliseOptionName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, '')
}

function isNoOpOption(name: string | undefined): boolean {
  if (!name) return true
  return NO_OP_NAMES.has(normaliseOptionName(name))
}

function optionsOf(prop: ByteDescriptor): readonly SettingOption[] {
  return prop.type === 'setting' ? prop.options : []
}

/**
 * Gobo slot for the current wheel position: 0 = open, 1..GOBO_SLOT_COUNT-1 = a
 * pattern layer.
 *
 * Prefers a `goboSlot` declared on the option; otherwise falls back to the
 * option's index on the wheel. Index rather than a name regex because fixture
 * enums are wildly inconsistent — the Fusion names them GOBO_1..GOBO_5 but the
 * Martin MAC 250 uses descriptive names (FIBROID, DEC_BEAM, CONE_SHAKE) with no
 * numbers at all. Index works for both, and the exact pattern a slot maps to is
 * arbitrary anyway: this is a visual approximation, not a gobo library.
 */
export function resolveGoboSlot(prop: ByteDescriptor | undefined, level: number): number {
  if (!prop) return 0
  const options = optionsOf(prop)
  if (options.length === 0) {
    // Slider-backed wheel: spread the range over the available slots.
    if (level <= 0) return 0
    return 1 + Math.floor((level / 256) * (GOBO_SLOT_COUNT - 1))
  }
  const { index } = settingBand(options, level)
  if (index < 0) return 0
  const option = options[index]
  if (option.goboSlot != null) {
    return Math.max(0, Math.min(GOBO_SLOT_COUNT - 1, option.goboSlot))
  }
  if (isNoOpOption(option.name)) return 0
  return ((index - 1 + GOBO_SLOT_COUNT - 1) % (GOBO_SLOT_COUNT - 1)) + 1
}

// A slider-backed spin channel almost universally means: 0 stop, 1..127 forward
// slow→fast, 128..255 reverse slow→fast. Documented verbatim on the Varytec
// (`Gobo spin (0 stop, 1–127 forward, 128–255 reverse)`). The Martin is really a
// three-band CCW/stop/CW and the Robe's meaning depends on the wheel mode, so
// this is an approximation for those two — acceptable for a visualiser.
const MAX_SPIN_REV_PER_SEC = 1.5

function spinFromSlider(level: number): number {
  if (level <= 0) return 0
  if (level < 128) return (level / 127) * MAX_SPIN_REV_PER_SEC
  return -((level - 128) / 127) * MAX_SPIN_REV_PER_SEC
}

/**
 * Signed gobo rotation speed in revolutions per second. Positive is forward.
 *
 * For a setting-backed channel the *band* names the direction and speed class
 * and the position within the band interpolates. Note the Fusion orders its
 * bands fast-before-slow (FORWARD_ROTATION_FAST at 10, FORWARD_ROTATION_SLOW at
 * 129), so band identity has to come from the name, not from its position.
 */
export function resolveGoboSpin(prop: ByteDescriptor | undefined, level: number): number {
  if (!prop) return 0
  const options = optionsOf(prop)
  if (options.length === 0) return spinFromSlider(level)

  const { index } = settingBand(options, level)
  if (index < 0) return 0
  const name = normaliseOptionName(options[index].name ?? '')
  if (isNoOpOption(options[index].name)) return 0

  const reverse = name.includes('REVERSE') || name.includes('CCW')
  const slow = name.includes('SLOW')
  const fast = name.includes('FAST')
  // Within-band position gives a continuous ramp; a band that names neither
  // speed spans the whole range.
  const t = bandFraction(options, level)
  const base = slow ? 0.15 + 0.25 * t : fast ? 0.5 + 0.5 * t : 0.2 + 0.8 * t
  return (reverse ? -1 : 1) * base * MAX_SPIN_REV_PER_SEC
}

/** Prism facet count: 0 = prism out. Only 3-facet prisms exist in the library. */
export const PRISM_FACETS = 3

export function resolvePrismFacets(prop: ByteDescriptor | undefined, level: number): number {
  if (!prop) return 0
  const options = optionsOf(prop)
  if (options.length === 0) return level >= 8 ? PRISM_FACETS : 0
  const { index } = settingBand(options, level)
  if (index < 0 || isNoOpOption(options[index].name)) return 0
  return PRISM_FACETS
}

/**
 * Focus as a 0..1 parameter, or `null` when the fixture has no focus channel
 * (the caller then keeps the fixture type's static beam edge).
 */
export function resolveFocusParam(
  prop: SliderPropertyDescriptor | undefined,
  level: number,
): number | null {
  if (!prop) return null
  const span = prop.max - prop.min
  if (span <= 0) return null
  return Math.max(0, Math.min(1, (level - prop.min) / span))
}

/** Macro program index; 0 = no macro running. */
export function resolveMacroIndex(prop: ByteDescriptor | undefined, level: number): number {
  if (!prop) return 0
  const options = optionsOf(prop)
  if (options.length === 0) return level >= 8 ? 1 : 0
  const { index } = settingBand(options, level)
  if (index < 0 || isNoOpOption(options[index].name)) return 0
  return index
}

/**
 * Pan/tilt offset in degrees for a movement macro, as a pure function of the
 * program index and elapsed seconds. Amplitudes are deliberately modest — this
 * is "the channel is visibly doing something", not a claim to match the
 * fixture's real built-in program.
 */
export interface MacroMovement {
  panDeg: number
  tiltDeg: number
}

const MACRO_PERIOD_S = 6

export function evalMovementMacro(index: number, t: number, out: MacroMovement): MacroMovement {
  if (index <= 0) {
    out.panDeg = 0
    out.tiltDeg = 0
    return out
  }
  const phase = (TAU * t) / MACRO_PERIOD_S
  switch (index % 4) {
    case 1: // circle
      out.panDeg = 25 * Math.cos(phase)
      out.tiltDeg = 18 * Math.sin(phase)
      break
    case 2: // figure eight
      out.panDeg = 30 * Math.sin(phase)
      out.tiltDeg = 15 * Math.sin(2 * phase)
      break
    case 3: // horizontal sweep
      out.panDeg = 40 * Math.sin(phase)
      out.tiltDeg = 0
      break
    default: // slow nod
      out.panDeg = 0
      out.tiltDeg = 22 * Math.sin(phase)
      break
  }
  return out
}

/**
 * Hue rotation (0..1) and intensity scale for an LED macro program. Applied on
 * top of the fixture's base colour rather than replacing it, so a macro that
 * stops leaves the underlying colour intact.
 */
export interface MacroColour {
  hueShift: number
  intensityScale: number
}

export function evalLedMacro(index: number, t: number, out: MacroColour): MacroColour {
  if (index <= 0) {
    out.hueShift = 0
    out.intensityScale = 1
    return out
  }
  const phase = (TAU * t) / MACRO_PERIOD_S
  switch (index % 3) {
    case 1: // slow colour cycle
      out.hueShift = (t / MACRO_PERIOD_S) % 1
      out.intensityScale = 1
      break
    case 2: // pulse, colour held
      out.hueShift = 0
      out.intensityScale = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(phase))
      break
    default: // cycle plus pulse
      out.hueShift = (t / (MACRO_PERIOD_S * 2)) % 1
      out.intensityScale = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(phase * 2))
      break
  }
  return out
}

/**
 * Beam cone trig, recomputed whenever the effective beam angle changes. Zoom
 * makes the angle a per-frame value, so this can no longer be a React memo;
 * it's a mutable struct the director owns and refreshes behind a dirty check.
 *
 * `cullSlackRad` widens the cull half-angle so cookies fade in before the
 * shader's own cosAngle test would clip them.
 */
export interface BeamGeom {
  beamDeg: number
  beamRadius: number
  cosHalfBeam: number
  cosCull: number
  sinCull: number
  floorSide: number
}

export function makeBeamGeom(): BeamGeom {
  return {
    beamDeg: Number.NaN,
    beamRadius: 0,
    cosHalfBeam: 1,
    cosCull: 1,
    sinCull: 0,
    floorSide: 0,
  }
}

export function computeBeamGeom(
  beamDeg: number,
  beamLength: number,
  cullSlackRad: number,
  out: BeamGeom,
): BeamGeom {
  const half = (beamDeg * Math.PI) / 360
  const cull = half + cullSlackRad
  out.beamDeg = beamDeg
  out.beamRadius = beamLength * Math.tan(half)
  out.cosHalfBeam = Math.cos(half)
  out.cosCull = Math.cos(cull)
  out.sinCull = Math.sin(cull)
  out.floorSide = 2 * beamLength * Math.sin(cull)
  return out
}
