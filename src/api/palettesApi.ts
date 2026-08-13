import type { AssignmentHealth } from './cuesApi'

/**
 * The four attribute families a palette can be typed by — the same I/P/C/B vocabulary the
 * Record / Include / Update mask uses, because on the backend `PaletteType` literally *is*
 * `PropertyMaskGroup`. A COLOUR palette therefore records exactly what a COLOUR mask records.
 *
 * See `PALETTE_TYPE_COLUMNS` in `@/lib/paletteTypes` for which sheet columns each type covers.
 */
export type PaletteType = 'INTENSITY' | 'POSITION' | 'COLOUR' | 'BEAM'

/** One stored palette row: "for this target, this property is this value". */
export interface PaletteEntry {
  targetType: 'fixture' | 'group'
  targetKey: string
  propertyName: string
  /**
   * A canonical literal, never a `ref:`. Palettes hold literals only — an entry holding a
   * reference would make resolution recursive, and the backend rejects it at the write boundary.
   */
  value: string
  sortOrder: number
  /** Populated server-side on read; reuses the cue-assignment health ADT. */
  health?: AssignmentHealth
}

export interface PaletteSummary {
  id: number
  /**
   * The palette's portable identity, and what a reference actually stores (`ref:{uuid}`).
   *
   * Not the int `id`: int primary keys never appear in the backend's sync export and are
   * re-minted on import, so an int-keyed reference would dangle after any import or clone.
   * Use `id` for REST paths and `uuid` for anything that names the palette in a stored value.
   */
  uuid: string
  name: string
  type: PaletteType
  notes?: string | null
  sortOrder: number
  /** Stored `(target, property)` rows. */
  entryCount: number
  /** Distinct target keys — drives "covers 12 fixtures". */
  targetCount: number
  /**
   * Up to 8 distinct literals, most-frequent first, so a tile renders without a detail fetch.
   * Shape depends on `type`: `#rrggbb[;wN;aN;uvN]`, `pan,tilt`, or `0..255`.
   */
  preview: string[]
  /** Persisted rows referencing this palette. Non-zero blocks an unforced delete. */
  referenceCount: number
}

export interface Palette extends PaletteSummary {
  entries: PaletteEntry[]
  /** Cues holding at least one row that references this palette. */
  referencedByCueIds: number[]
}

export interface CreatePaletteRequest {
  name: string
  type: PaletteType
  notes?: string | null
  sortOrder?: number
  entries?: PaletteEntry[]
}

export interface UpdatePaletteRequest {
  name?: string
  notes?: string | null
  sortOrder?: number
}

/** 409 body when a delete is refused because persisted rows still reference the palette. */
export interface PaletteInUseError {
  error: string
  code: 'PALETTE_IN_USE'
  referenceCount: number
  cueAssignmentCount: number
  presetAssignmentCount: number
  cueIds: number[]
}

/** `POST /programmer/record-palette`. The palette's type is the mask — there is no mask field. */
export interface RecordPaletteRequest {
  projectId: number
  mode: 'CREATE' | 'MERGE' | 'REMOVE' | 'UPDATE_EXISTING'
  /** Required on CREATE; must match the existing palette otherwise. */
  type?: PaletteType
  paletteId?: number
  name?: string
  notes?: string | null
  source?: 'TOUCHED' | 'ALL' | 'STAGE_SNAPSHOT'
  /**
   * The operator's selection, groups expanded server-side.
   *
   * Strongly recommended: without it a palette captures every head the programmer happens to
   * hold, which is almost never what a named look is meant to mean.
   */
  targets?: { type: 'fixture' | 'group'; key: string }[]
}

export interface RecordPaletteResponse {
  palette: Palette
  created: boolean
  entriesWritten: number
  entriesRemoved: number
  groupRowsEmitted: number
  /** Programmer entries that were themselves references — stored as their current literal. */
  refsFlattened: number
  skipped: { targetKey?: string; propertyName?: string; reason: string }[]
  programmerKeysRefreshed: number
  cuesRepublished: number[]
}

/** `POST /project/{id}/cues/{cueId}/make-hard`. */
export interface CueMakeHardRequest {
  paletteUuids?: string[]
  mask?: PaletteType[]
}
