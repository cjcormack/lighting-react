import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Comparator for entities ordered by `sortOrder` with `id` as a stable tiebreaker. */
export function bySortOrder<T extends { sortOrder: number; id: number }>(a: T, b: T): number {
  return a.sortOrder - b.sortOrder || a.id - b.id
}

/** Parse a number input value where empty string means "leave unset" (null). */
export function parseNullableNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/** Format a 3-tuple of nullable numbers (e.g. metres on X/Y/Z). Nulls render as `—`. */
export function formatTriple(
  a: number | null,
  b: number | null,
  c: number | null,
  sep = ", ",
): string {
  const fmt = (v: number | null) => (v == null ? "—" : v.toFixed(1))
  return `${fmt(a)}${sep}${fmt(b)}${sep}${fmt(c)}`
}

/** Format a yaw/pitch/roll triple in degrees as `0°/0°/0°`. Nulls render as `—`. */
export function formatRotation(
  yaw: number | null,
  pitch: number | null,
  roll: number | null,
): string {
  const fmt = (v: number | null) => (v == null ? "—" : `${v.toFixed(0)}°`)
  return `${fmt(yaw)}/${fmt(pitch)}/${fmt(roll)}`
}
