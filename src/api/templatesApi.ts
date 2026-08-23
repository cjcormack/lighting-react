import type { AttributeFamily } from '@/lib/attributeFamily'

/**
 * A **Template**: a named value for one attribute family, applied to a selection.
 *
 * The other half of the split `looksApi` used to serve alone. A Look *composes cues* — any families,
 * its own fixtures, its own effects, added to a stack as a layer. A Template *composes values* —
 * exactly one family, no effects, no targets of its own, applied to whatever you have selected.
 *
 * Backend contract in `lighting7/models/templates.kt`. Three absences are the design rather than
 * omissions: no fixture type (the values are **intents**, resolved per head at cook), no effects
 * (D7 — effects live in a Look or on a cue), and no stored family (it is derived from the rows and
 * validated to be exactly one at the write boundary).
 */

/** The `targetType` marking a row as **generic** — it takes its targets from whatever applies it. */
export const DEFERRED_TARGET_TYPE = 'deferred' as const

/**
 * One stored template row.
 *
 * `targetType` is `deferred` for a **generic** template (one value, any head) or `fixture` for a
 * **per-fixture** one (a focus position: eight heads aimed at one spot hold eight different
 * pan/tilts). Never `group` — a template names no targets of its own, so the only reason a row names
 * a head is that its value is specific to that head, which a group cannot be.
 */
export interface TemplateRow {
  targetType: typeof DEFERRED_TARGET_TYPE | 'fixture'
  targetKey: string
  /** One of `TEMPLATE_PROPERTIES` — the closed vocabulary; see `templateIntent.ts`. */
  propertyName: string
  /** A serialised intent: `#FF9D4A;policy=extract`, `pct:75`, `deg:45,12.5`, `on`. */
  value: string
  sortOrder?: number
  /** Resolved server-side on read; ignored on write. */
  health?: string
}

/**
 * A template, **rows included** — unlike `LookSummary`, which carries derived counts and a preview
 * instead.
 *
 * One shape for the list and the editor, because a template is small (one row generic, one per head
 * for a focus position) and has no derived counts that could go stale beside its contents. The
 * library row can therefore preview the real value without a second fetch.
 */
export interface TemplateSummary {
  id: number
  uuid: string
  name: string
  notes: string | null
  sortOrder: number
  /** Fade for every row this template writes; null = the caller's default. */
  fadeDurationMs: number | null
  /**
   * The one family this template is in, **derived** from its rows. Null only for a template whose
   * rows have all gone, which the write boundary does not allow.
   */
  family: AttributeFamily | null
  /** True when every row is generic; false for the per-fixture case. */
  isGeneric: boolean
  rows: TemplateRow[]
  /** How many layers apply this template. Gates delete. */
  layerCount: number
}

/**
 * Create / update payload.
 *
 * `notes` and `fadeDurationMs` carry an explicit `*Present` flag, because null is a *value* for both
 * (clear the notes; use the caller's default fade) and a PUT has to tell that from "leave it alone".
 * Omit `rows` for a metadata-only edit — sending them replaces the lot.
 */
export interface TemplateInput {
  name?: string
  notes?: string | null
  notesPresent?: boolean
  sortOrder?: number
  fadeDurationMs?: number | null
  fadeDurationMsPresent?: boolean
  rows?: TemplateRow[]
}

export interface TemplateTarget {
  type: 'fixture' | 'group'
  key: string
}

/** 409 body when a template is still applied by a layer. Rendered inline; offers "delete anyway". */
export interface TemplateInUseError {
  error: string
  code: 'TEMPLATE_IN_USE'
  layerCount: number
  cueIds: number[]
  cueNames: string[]
}

/** What `click` reports: literals written, and the heads it could not reach. */
export interface ApplyTemplateResponse {
  written: number
  skipped: { fixtureKey: string; propertyName: string; reason: string }[]
}

export interface ToggleTemplateResponse {
  action: 'applied' | 'removed'
  /** Always 0 — a template holds no effects. Present because the toggle shape is shared. */
  effectCount: number
  propertyMask: string | null
}

/**
 * The editor's live panel, asked against a **draft**: these rows, optionally narrowed to these
 * heads. Empty `targets` means the whole patch.
 *
 * A draft rather than a saved id because the panel's whole job is to answer "what will this do to my
 * rig?" *before* anything is written.
 */
export interface TemplateResolveRequest {
  rows: TemplateRow[]
  targets?: TemplateTarget[]
}

/** What one head will actually receive. */
export interface TemplateResolution {
  fixtureKey: string
  fixtureName: string
  typeKey: string
  propertyName: string
  /** The property the value landed on — differs from `propertyName` on a colour wheel. */
  resolvedPropertyName: string
  outcome: 'EXACT' | 'CLAMPED' | 'SNAPPED' | 'DEGRADED' | 'UNSUPPORTED'
  /** The clamp, the slot name, or the reason. Null when nothing was lost. */
  detail: string | null
  /** ΔE against the requested colour, on a wheel snap only. */
  deltaE: number | null
  /** The resolved value in the canonical assignment grammar — for a swatch or a number. */
  value: string | null
}

export interface TemplateResolveResponse {
  entries: TemplateResolution[]
}
