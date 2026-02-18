/**
 * Colour utilities for FX parameter handling.
 *
 * Named colours match the backend's parseColor() exactly (java.awt.Color constants).
 * Extended colour format: #rrggbb[;wNNN][;aNNN][;uvNNN]
 */

/** Named colours matching the backend's parseColor() */
export const NAMED_COLOURS: Record<string, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  orange: '#ffc800',
  pink: '#ffafaf',
  white: '#ffffff',
  black: '#000000',
}

/** Quick-select presets for the colour picker UI */
export const COLOUR_PRESETS = [
  { name: 'Red', hex: '#ff0000' },
  { name: 'Green', hex: '#00ff00' },
  { name: 'Blue', hex: '#0000ff' },
  { name: 'Yellow', hex: '#ffff00' },
  { name: 'Cyan', hex: '#00ffff' },
  { name: 'Magenta', hex: '#ff00ff' },
  { name: 'Orange', hex: '#ffc800' },
  { name: 'White', hex: '#ffffff' },
]

export interface ExtendedColour {
  hex: string
  white: number
  amber: number
  uv: number
}

/**
 * Resolve a colour string (named, hex, or extended) to a plain #rrggbb hex string.
 * Returns only the RGB component, stripping any extended channels.
 */
export function resolveColourToHex(colour: string): string {
  if (!colour) return '#000000'

  const trimmed = colour.trim().toLowerCase()

  // Check named colours first
  if (NAMED_COLOURS[trimmed]) {
    return NAMED_COLOURS[trimmed]
  }

  // Handle extended format: split on semicolons, take first part
  const rgbPart = trimmed.split(';')[0].trim()

  // Check if the rgb part is a named colour
  if (NAMED_COLOURS[rgbPart]) {
    return NAMED_COLOURS[rgbPart]
  }

  // Handle hex format
  const hex = rgbPart.replace(/^#/, '')
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return `#${hex}`
  }
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  }

  return '#000000'
}

/**
 * Parse an extended colour string into its components.
 * Format: #rrggbb[;wNNN][;aNNN][;uvNNN]
 */
export function parseExtendedColour(colour: string): ExtendedColour {
  const hex = resolveColourToHex(colour)
  let white = 0
  let amber = 0
  let uv = 0

  const parts = colour.split(';')
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim().toLowerCase()
    if (part.startsWith('uv')) {
      uv = Math.min(255, Math.max(0, parseInt(part.slice(2), 10) || 0))
    } else if (part.startsWith('w')) {
      white = Math.min(255, Math.max(0, parseInt(part.slice(1), 10) || 0))
    } else if (part.startsWith('a')) {
      amber = Math.min(255, Math.max(0, parseInt(part.slice(1), 10) || 0))
    }
  }

  return { hex, white, amber, uv }
}

/**
 * Serialize an extended colour back to the wire format.
 * Only includes non-zero extended channels.
 */
export function serializeExtendedColour(colour: ExtendedColour): string {
  const parts = [colour.hex]
  if (colour.white > 0) parts.push(`w${colour.white}`)
  if (colour.amber > 0) parts.push(`a${colour.amber}`)
  if (colour.uv > 0) parts.push(`uv${colour.uv}`)
  return parts.join(';')
}

/** Check if a string is a valid hex colour (#rrggbb or #rgb) */
export function isValidHexColour(hex: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)
}

/** Check if an extended colour has any non-zero extended channels */
export function hasExtendedChannels(colour: ExtendedColour): boolean {
  return colour.white > 0 || colour.amber > 0 || colour.uv > 0
}

export type ExtendedChannelFlags = {
  white: boolean
  amber: boolean
  uv: boolean
}

/**
 * Detect which extended colour channels (W/A/UV) are available from an array
 * of property descriptor arrays (one per fixture or fixture type).
 *
 * Works with both Fixture.properties and FixtureTypeInfo.properties since both
 * use the same PropertyDescriptor union.
 *
 * Returns undefined if no extended channels are available.
 */
export function detectExtendedChannels(
  propertySets: ReadonlyArray<ReadonlyArray<{ type: string; category?: string; whiteChannel?: unknown; amberChannel?: unknown; uvChannel?: unknown }>>,
): ExtendedChannelFlags | undefined {
  const hasChannel = (channelKey: 'whiteChannel' | 'amberChannel' | 'uvChannel', category: string) => {
    return propertySets.some((props) =>
      props.some(
        (p) =>
          (p.type === 'colour' && p[channelKey]) ||
          (p.type === 'slider' && p.category === category),
      ),
    )
  }

  if (propertySets.length === 0) return undefined

  const white = hasChannel('whiteChannel', 'white')
  const amber = hasChannel('amberChannel', 'amber')
  const uv = hasChannel('uvChannel', 'uv')

  if (!white && !amber && !uv) return undefined

  return { white, amber, uv }
}
