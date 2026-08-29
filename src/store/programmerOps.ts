import { restApi } from './restApi'
import type { Cue, CueTarget } from '../api/cuesApi'
import type { LookDetails } from '../api/looksApi'
import type { IncludedTarget } from '../api/programmerWsApi'

/**
 * Record / Include / Update — the programmer's authoring loop.
 *
 * These are REST mutations rather than `programmer.*` WS ops (which is what everything else in
 * `store/programmer.ts` is) for one reason: they all need a *structured reply* — the created
 * cue, the fixtures to select, the Mode B checklist — and the programmer WS channel is
 * fire-and-forget with no request/response correlation. Going through RTK Query also gets us
 * cue-tag invalidation and per-call error state, both of which the dialogs need.
 *
 * All three are silent in `errorToastMiddleware`/`saveStatusSlice`: their sheets render their
 * own errors, so a global toast would double up.
 */

/** Which attribute families an operation touches. Omitted or all four means "everything". */
export type PropertyMaskGroup = 'INTENSITY' | 'POSITION' | 'COLOUR' | 'BEAM'

export type RecordMode = 'CREATE' | 'MERGE' | 'REMOVE' | 'UPDATE_EXISTING'

export type RecordSource = 'TOUCHED' | 'ALL' | 'STAGE_SNAPSHOT'

/** An entry that couldn't be written, and why. Rendered so a partial record isn't silent. */
export interface ProgrammerSkip {
  targetKey?: string
  propertyName?: string
  universe?: number
  channel?: number
  reason:
    | 'ELEMENT_TARGET'
    | 'MISSING_FIXTURE'
    | 'MISSING_PROPERTY'
    | 'NO_BACKING_PROPERTY'
    | 'MASKED_OUT'
    /**
     * Outside the request's fixture scope — the `targets` it sent, when it sent any.
     *
     * The **Look** record routes always pass the operator's selection, because a Look recorded
     * from the *whole* programmer would capture every head it happens to hold and "Warm Amber"
     * would mean the rig. A cue Record scoped to targets passes one too, and gets the same
     * reason back for everything it left out.
     */
    | 'OUT_OF_SCOPE'
}

/**
 * What a write deliberately left alone. Every count is optional: the server defaults all five to
 * zero and does not encode defaults, so a wholly uneventful Record omits the lot.
 */
export interface ProgrammerPreservedCounts {
  triggers?: number
  /** Timed layers left untouched. Named `timedPresetApplications` before a preset became a layer. */
  timedLayers?: number
  timedAdHocEffects?: number
  outOfMaskAssignments?: number
  /** Rows left alone because they name a fixture outside the request's `targets`. */
  outOfScopeAssignments?: number
}

export interface RecordRequest {
  projectId: number
  mode: RecordMode
  source?: RecordSource
  /** Required for CREATE. */
  cueStackId?: number
  /** Required for MERGE / REMOVE / UPDATE_EXISTING. */
  cueId?: number
  mask?: PropertyMaskGroup[]
  includeFx?: boolean
  name?: string
  cueNumber?: string
  /**
   * Restrict the record to these fixtures — "put just these heads into this cue". Groups are
   * expanded server-side.
   *
   * Omitted records the whole programmer, which is the right default for a cue: capturing
   * everything the operator busked is usually what was meant. A Look is the opposite case — see
   * the Look record's own `targets`, and `OUT_OF_SCOPE`.
   */
  targets?: CueTarget[]
}

export interface RecordResponse {
  cue: Cue
  created: boolean
  assignmentsWritten: number
  assignmentsRemoved: number
  groupRowsEmitted: number
  fxWritten: number
  preserved: ProgrammerPreservedCounts
  republishedLive: boolean
  skipped: ProgrammerSkip[]
  warnings: string[]
}

// ── Record into a Look ──────────────────────────────────────────────────────

export interface RecordLookRequest {
  projectId: number
  /** CREATE mints a new Look; the other three need [lookId]. */
  mode: RecordMode
  lookId?: number
  name?: string
  notes?: string
  source?: RecordSource
  /**
   * Which attribute families to record. Explicit because a Look has **no type to imply it**:
   * nothing about the destination says "this is a colour record", so the operator's mask is the
   * only statement of intent there is.
   */
  mask?: PropertyMaskGroup[]
  /**
   * The operator's selection. Groups are expanded server-side.
   *
   * Strongly recommended rather than optional in practice: a Look recorded from the whole
   * programmer captures every head the programmer happens to hold, which is almost never what
   * "Warm Amber" is meant to mean.
   */
  targets?: CueTarget[]
  /**
   * Running programmer-band effects to fold into the Look, by `ActiveEffect.id`.
   *
   * **Explicit ids, not an `includeFx` flag** — unlike `RecordRequest`. Which effects belong in a
   * Look is a per-effect judgement ("the colour chase is the look; the tilt sine was me looking at
   * it"), and a boolean cannot say that.
   *
   * A ticked effect is **moved**: the server removes it from the programmer band, because the layer
   * this Look is applied through starts running it immediately and two copies would beat against
   * each other. An unticked effect **keeps running** — leaving one out of a Look is not the same as
   * stopping it, which is exactly why these are checkboxes.
   *
   * Timing does not travel: `LookEffect` has no delay/interval fields, so a busked "fire after 3s"
   * becomes the *layer's* delay rather than something baked into the Look.
   */
  effectIds?: number[]
}

export interface RecordLookResponse {
  look: LookDetails
  created: boolean
  rowsWritten: number
  rowsRemoved: number
  groupRowsEmitted: number
  /** Programmer-band effects folded in, and so removed from the band. */
  effectsWritten?: number
  skipped: ProgrammerSkip[]
  /** Set when the Look was already live: what the re-resolve moved. */
  programmerKeysRefreshed: number
  cuesRepublished: number[]
}

export interface IncludeRequest {
  projectId: number
  /** Exactly one of `cueId` / `lookId`. The backend 400s on both or neither. */
  cueId?: number
  lookId?: number
  mask?: PropertyMaskGroup[]
  includeFx?: boolean
  fadeMs?: number
}

export interface IncludeResponse {
  /**
   * `PALETTE` is still in the union because the backend arm still exists, but nothing here sends
   * a `paletteId` any more — the palette route reads tables no consumer resolves through.
   */
  kind: 'CUE' | 'PALETTE' | 'LOOK'
  /** Null unless a cue was included. */
  cueId?: number
  cueStackId?: number
  lookId?: number
  /**
   * The cue's *or* the Look's name — `name` rather than `cueName` because it is now either, and a
   * field called `cueName` holding a Look name is a lie. Named the same on the wire.
   */
  name: string
  entriesWritten: number
  /** MagicQ's "Select Heads on Include" — the sheet selects these. */
  fixtureKeys: string[]
  groupKeys: string[]
  fxSpawned: number
  fxAlreadyRunning: number
  fxTimedSkipped: number
  lastIncluded?: IncludedTarget | null
  skipped: ProgrammerSkip[]
  warnings: string[]
}

/** One (fixture, property) the programmer is currently overriding. */
export interface ChecklistKey {
  targetKey: string
  propertyName: string
  currentValue: string
  cueValue?: string
  /** The cue drives this through an effect, so a written assignment would be masked on GO. */
  viaEffect: boolean
}

export interface ChecklistCue {
  cueId: number
  cueNumber?: string
  /** True when `cueNumber` was derived from position rather than typed — rendered dimmed. */
  cueNumberAuto: boolean
  cueName: string
  isActive: boolean
  keyCount: number
  viaEffectKeyCount: number
  sample: ChecklistKey[]
}

export interface ChecklistStack {
  cueStackId?: number
  cueStackName?: string
  isActive: boolean
  cues: ChecklistCue[]
}

export interface UpdateChecklist {
  stacks: ChecklistStack[]
  /** Keys with no cue underneath — programmer over baseline. Offer "record a new cue". */
  unattributed: ChecklistKey[]
  totalKeys: number
}

export interface UpdateRequest {
  projectId: number
  /** Cue ids to write (Mode B). Omit for Mode A, or for the checklist when nothing is included. */
  targets?: number[]
  mask?: PropertyMaskGroup[]
  /** Fetch the checklist without writing, even when an include target exists. */
  preview?: boolean
  includeFx?: boolean
}

export interface UpdateResult {
  cueId: number
  cueStackId?: number
  cueName: string
  assignmentsWritten: number
  fxWritten: number
  republishedLive: boolean
}

/**
 * Mode A written back into a palette rather than a cue.
 *
 * A separate field from `results` rather than a nullable `cueId` on `UpdateResult`, matching the
 * backend: everything that already reads `results` for cue counts keeps working untouched.
 *
 * Unreachable from this client — nothing includes a palette any more, and a Look include disables
 * Update — but the field is still on the wire, so the shape stays until the record rewrite retires
 * the route. It no longer carries an attribute type: a Look declares none.
 */
export interface PaletteUpdateResult {
  paletteId: number
  paletteName: string
  entriesWritten: number
  /** What the re-resolve moved — the live consumers of the palette. */
  programmerKeysRefreshed: number
  cuesRepublished: number[]
}

/**
 * Mode A written back into a **Look** rather than a cue.
 *
 * Separate from [PaletteUpdateResult] rather than replacing it, matching the backend: the palette
 * arm is still mounted and retires with its tables, and the two write through different code into
 * different tables. Collapsing them would make one field mean two destinations.
 */
export interface LookUpdateResult {
  lookId: number
  lookName: string
  rowsWritten: number
  /** What the re-resolve moved: the live consumers of the Look. */
  programmerKeysRefreshed: number
  cuesRepublished: number[]
}

export interface UpdateResponse {
  applied: boolean
  mode: 'A' | 'B' | 'CHECKLIST'
  results: UpdateResult[]
  /** Set when Mode A's include target was a palette. Mode B is cue-only, by design. */
  paletteResult?: PaletteUpdateResult
  /** Set when Mode A's include target was a Look. */
  lookResult?: LookUpdateResult
  checklist?: UpdateChecklist
  skipped: ProgrammerSkip[]
  warnings: string[]
}

// `POST /programmer/make-hard` and its request/response pair stood here. The route replaced the
// programmer's `ref:` slots with the literals they resolved to; the grammar retired in session 4, so
// there is no longer such a slot to harden. Detaching a *cue* from the library is
// `POST /{projectId}/cues/{cueId}/flatten`.

/**
 * Update's 409 body: the cue or Look Include staged has been deleted since.
 *
 * A one-arm union rather than a bare string, because it is the *narrowed* remains of three. There
 * was `INCLUDE_TARGET_READ_ONLY`, for a Look target Update could not write back to — both halves
 * of that guard went when the write-back path stopped leading into the retired palette tables, and
 * it was never handled here, only declared. And there was `CUE_EDIT_SESSION_OPEN`, the one
 * recoverable arm, which both Record and Update offered a "do it anyway" for: backend sweep item
 * D1 retired the `cueEdit.*` sessions, so nothing can hold one and no request can be refused for
 * it. Record now has no conflict path at all.
 */
export interface ProgrammerConflict {
  error: string
  code: 'INCLUDE_TARGET_GONE'
  cueId?: number
}

export const programmerOpsApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    recordProgrammer: build.mutation<RecordResponse, RecordRequest>({
      query: ({ projectId, ...body }) => ({
        url: 'programmer/record',
        method: 'POST',
        body: { ...body, projectId: String(projectId) },
      }),
      // Guarded on the result: nothing was written on a failure, so refetching the whole cue
      // list behind the sheet would be pure churn.
      invalidatesTags: (result, _error, { projectId, cueId }) =>
        result == null
          ? []
          : [
              { type: 'CueList', id: projectId },
              ...(cueId ? [{ type: 'Cue' as const, id: cueId }] : []),
              'CueList',
              // Only a CREATE changes stack membership.
              ...(result.created ? (['CueStackList'] as const) : []),
            ],
    }),

    /**
     * `POST /programmer/record-look` — the gesture that creates a **bound** Look, which nothing
     * could do while the only record destination was the retired palette tables.
     *
     * Invalidating the cue tags is not defensive: writing a Look's contents ends in a republish, so
     * re-recording one that cues already layer moves them immediately, and their read is stale.
     */
    recordLook: build.mutation<RecordLookResponse, RecordLookRequest>({
      query: ({ projectId, ...body }) => ({
        url: 'programmer/record-look',
        method: 'POST',
        body: { ...body, projectId: String(projectId) },
      }),
      invalidatesTags: (result) =>
        result == null
          ? []
          : [
              'LookList',
              { type: 'Look' as const, id: result.look.id },
              // A Look's rows resolve per fixture, so the fixture and group reads carry them.
              'Fixture',
              'GroupList',
              ...(result.cuesRepublished.length > 0
                ? ([
                    'CueList' as const,
                    ...result.cuesRepublished.map((id) => ({ type: 'Cue' as const, id })),
                  ])
                : []),
            ],
    }),

    /**
     * Named `includeIntoProgrammer`, not `includeCue`: the same route also loads a Look's bound
     * rows, and `ProgrammerStore.lastIncludedTarget` is single-valued so the two could not have
     * been separate endpoints anyway.
     */
    includeIntoProgrammer: build.mutation<IncludeResponse, IncludeRequest>({
      query: ({ projectId, ...body }) => ({
        url: 'programmer/include',
        method: 'POST',
        body: { ...body, projectId: String(projectId) },
      }),
      // Include spawns programmer-band FX, which the FX sheet and the Clear button count.
      invalidatesTags: ['FixtureEffects'],
    }),

    updateProgrammer: build.mutation<UpdateResponse, UpdateRequest>({
      query: ({ projectId, ...body }) => ({
        url: 'programmer/update',
        method: 'POST',
        body: { ...body, projectId: String(projectId) },
      }),
      // A checklist fetch writes nothing, so it must not invalidate — the dialog opens with
      // one, and a refetch storm behind an open dialog is pure churn.
      invalidatesTags: (result, _error, { projectId }) =>
        result?.applied
          ? [
              { type: 'CueList', id: projectId },
              'CueList',
              // Mode A can write a palette instead of a cue, which changes what every
              // referencing row resolves to. Unreachable from this client today (see
              // PaletteUpdateResult) but the tag stays with the field.
              ...(result.paletteResult ? (['Look', 'LookList'] as const) : []),
            ]
          : [],
    }),


  }),
  overrideExisting: false,
})

export const {
  useRecordProgrammerMutation,
  useRecordLookMutation,
  useIncludeIntoProgrammerMutation,
  useUpdateProgrammerMutation,
} = programmerOpsApi
