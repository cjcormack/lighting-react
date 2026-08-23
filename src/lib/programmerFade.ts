/**
 * The persisted key for the programmer's fade time, in ms, as a string.
 *
 * Shared because two surfaces act on it: the programmer's action bar owns the picker and uses it for
 * Clear, and `useShowBarProps` reads it so Blind fades by the same amount. Blind used to live beside
 * the picker and could read it directly; when it moved into the `ShowBar` the value had to become
 * addressable rather than local, or blinding would have started snapping.
 */
export const PROGRAMMER_FADE_KEY = 'programmer.fadeMs'
