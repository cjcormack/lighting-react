import type { AttributeFamily } from '@/lib/attributeFamily'
import type { AssignmentHealth } from './cuesApi'

/**
 * The `targetType` discriminator marking a row or effect as **deferred**: it names no target of its
 * own and takes its targets from the cue layer referencing the Look.
 *
 * Deliberately a magic string rather than an arm of the fixture/group union, mirroring the
 * backend's `DEFERRED_TARGET_TYPE` — a deferred row reaching code that expects a resolvable target
 * is a bug we want loud rather than silently fanned out over the whole rig.
 */
export const DEFERRED_TARGET_TYPE = 'deferred' as const

export type LookTargetType = 'fixture' | 'group' | typeof DEFERRED_TARGET_TYPE

/**
 * One stored Look row: "for this target, this property is this value".
 *
 * `value` is always a **literal** in the canonical cue-side grammar (hex for colour, `"pan,tilt"`
 * for position, `"0".."255"` for slider/setting). A `ref:` is rejected at the backend's write
 * boundary, which is what keeps Looks from nesting.
 *
 * `targetKey` is the empty string when `targetType` is `deferred`.
 */
export interface LookRow {
  targetType: LookTargetType
  targetKey: string
  propertyName: string
  value: string
  fadeDurationMs?: number | null
  /** Element-local suffix of a multi-element fixture's element key. Null = the whole fixture. */
  elementKey?: string | null
  sortOrder?: number
  /** Resolved server-side on read; ignored on write — the server never trusts client health. */
  health?: AssignmentHealth
}

/**
 * One stored Look effect.
 *
 * The `delayMs` / `intervalMs` / `randomWindowMs` triple is deliberately absent: timing belongs to
 * the layer applying the Look, not to the Look itself.
 */
export interface LookEffect {
  targetType: LookTargetType
  targetKey: string
  effectType: string
  category: string
  propertyName?: string | null
  beatDivision: number
  blendMode: string
  distribution: string
  phaseOffset?: number
  elementMode?: string | null
  elementFilter?: string | null
  stepTiming?: boolean | null
  parameters: Record<string, string>
  /** Speed master this effect subscribes to, as the master's uuid (null → master 1). */
  speedMasterUuid?: string | null
  /** Wall-clock rate master (null → unscaled); only WALL_CLOCK effects read it. */
  rateSpeedMasterUuid?: string | null
  sortOrder?: number
}

/**
 * A Look as the library lists it.
 *
 * Two ids, and they are not interchangeable. `id` is the int PK and addresses REST paths and a cue
 * layer's `lookId`; `uuid` is the portable identity and is what a stored `ref:{uuid}` value names —
 * int PKs never appear in the backend's sync export and are re-minted on import, so a `ref:12`
 * would dangle after any import or clone.
 *
 * Everything a row needs to render is here, so the library never fetches a detail to draw a list.
 */
export interface LookSummary {
  id: number
  uuid: string
  name: string
  notes: string | null
  sortOrder: number
  /**
   * Attribute families this Look touches, **derived server-side** from its rows rather than
   * stored. A Look spanning colour and position reports both — which is the point of there being
   * no type column.
   */
  families: AttributeFamily[]
  rowCount: number
  effectCount: number
  targetCount: number
  /** True when any row or effect is deferred, i.e. takes its targets from the layer. */
  hasDeferredRows: boolean
  /**
   * Which fixture type the *form editor* builds a synthetic fixture for. An editor affordance, not
   * a data constraint, and non-null only for a Look with deferred rows.
   */
  editorFixtureType: string | null
  /** Up to 8 distinct literals, most-frequent first, so a row can preview without a detail fetch. */
  preview: string[]
  /**
   * How many cue layers reference this Look. Gates delete.
   *
   * There was a sibling `refRowCount` beside it — cue rows whose value was `ref:{uuid}`, a second
   * reference mechanism gating the same delete. It retired with the `ref:` grammar in session 4, so
   * a layer's FK is the only dependency a Look can have.
   */
  layerCount: number
}

/**
 * One Look's full contents.
 *
 * Deliberately **not** `extends LookSummary`: the summary's derived counts would then be duplicated
 * state that goes stale the moment a row is edited. Same argument the palette DTOs carried.
 */
export interface LookDetails {
  id: number
  uuid: string
  name: string
  notes: string | null
  sortOrder: number
  families: AttributeFamily[]
  editorFixtureType: string | null
  /**
   * The **positional** colour list (`P1` / `P2` / `P*`) that FX parameters index — a third,
   * unrelated thing historically also called "palette". It parameterises effects rather than
   * describing a look, and survives this merge untouched.
   */
  palette: string[]
  rows: LookRow[]
  effects: LookEffect[]
  layerCount: number
  usedByCueIds: number[]
  usedByCueNames: string[]
}

/**
 * Create / update payload.
 *
 * On PUT, **absent and empty are different**: omitting `rows` leaves the contents alone (a
 * metadata-only edit), while sending `[]` clears them. So build this object with the keys you mean
 * to write and no others.
 */
export interface LookInput {
  name?: string
  notes?: string | null
  sortOrder?: number
  editorFixtureType?: string | null
  palette?: string[]
  rows?: LookRow[]
  effects?: LookEffect[]
}

export interface CopyLookRequest {
  targetProjectId: number
  newName?: string
}

export interface CopyLookResponse {
  lookId: number
  lookName: string
  targetProjectId: number
  targetProjectName: string
  message: string
}

/** 409 body when a Look is still referenced. Rendered inline; the flow offers "delete anyway". */
export interface LookInUseError {
  error: string
  code: 'LOOK_IN_USE'
  layerCount: number
  cueIds: number[]
  cueNames: string[]
}

export interface ToggleLookTarget {
  type: 'group' | 'fixture'
  key: string
}

export interface ToggleLookRequest {
  targets: ToggleLookTarget[]
  beatDivision?: number
}

export interface ToggleLookResponse {
  action: 'applied' | 'removed'
  effectCount: number
}

/**
 * Complete desired state for the project's preview slot — replaces any prior preview. Empty
 * `targets` (or `rows`) collapses to a clear.
 *
 * The wire field is `propertyAssignments`, not `rows`: the backend reuses the preset editor's
 * preview slot verbatim, which is exactly why the route needed no new logic.
 */
export interface LookPreviewRequest {
  propertyAssignments: { propertyName: string; value: string; fadeDurationMs?: number | null; sortOrder?: number; elementKey?: string | null }[]
  palette: string[]
  targets: ToggleLookTarget[]
}

export interface LookPreviewResponse {
  writeCount: number
}

/** True when a row or effect takes its targets from the layer rather than naming one. */
export function isDeferred(row: { targetType: string }): boolean {
  return row.targetType === DEFERRED_TARGET_TYPE
}
