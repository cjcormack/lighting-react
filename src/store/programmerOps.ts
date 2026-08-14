import { restApi } from './restApi'
import type { Cue } from '../api/cuesApi'
import type { PaletteType } from '../api/palettesApi'
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
     * Outside the request's fixture scope. Only the palette routes pass a scope — a palette
     * recorded from the *whole* programmer would capture every head it happens to hold.
     */
    | 'OUT_OF_SCOPE'
}

/** What a write deliberately left alone. */
export interface ProgrammerPreservedCounts {
  triggers: number
  timedPresetApplications: number
  timedAdHocEffects: number
  outOfMaskAssignments: number
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
  /** Record anyway when a cue-edit session is open on the target cue. */
  force?: boolean
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

export interface IncludeRequest {
  projectId: number
  /** Exactly one of `cueId` / `paletteId`. The backend 400s on both or neither. */
  cueId?: number
  paletteId?: number
  mask?: PropertyMaskGroup[]
  includeFx?: boolean
  fadeMs?: number
}

export interface IncludeResponse {
  kind: 'CUE' | 'PALETTE'
  /** Null when a palette was included. */
  cueId?: number
  cueStackId?: number
  paletteId?: number
  /**
   * The cue's *or* the palette's name — `name` rather than `cueName` because it is now either,
   * and a field called `cueName` holding a palette name is a lie. Renamed on the wire too.
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
  force?: boolean
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
 */
export interface PaletteUpdateResult {
  paletteId: number
  paletteName: string
  paletteType: PaletteType
  entriesWritten: number
  /** What the re-resolve moved — the live consumers of the palette. */
  programmerKeysRefreshed: number
  cuesRepublished: number[]
}

export interface UpdateResponse {
  applied: boolean
  mode: 'A' | 'B' | 'CHECKLIST'
  results: UpdateResult[]
  /** Set when Mode A's include target was a palette. Mode B is cue-only, by design. */
  paletteResult?: PaletteUpdateResult
  checklist?: UpdateChecklist
  skipped: ProgrammerSkip[]
  warnings: string[]
}

/** `POST /programmer/make-hard` — stop the programmer's references tracking their palettes. */
export interface MakeProgrammerHardRequest {
  /** Restrict to these programmer targets. Omitted = every reference the programmer holds. */
  targetKeys?: string[]
  mask?: PropertyMaskGroup[]
}

export interface MakeProgrammerHardResponse {
  /** References replaced by the literal they currently resolve to. */
  converted: number
  /** References left alone because they fell outside the scope or mask. */
  skipped: number
}

/** `POST /project/{projectId}/cues/{cueId}/make-hard`. */
export interface MakeCueHardRequest {
  projectId: number
  cueId: number
  /** Restrict to rows referencing these palettes. Omitted = every reference in the cue. */
  paletteUuids?: string[]
  mask?: PropertyMaskGroup[]
  /** Harden anyway when a cue-edit session is open on the cue. */
  force?: boolean
}

export interface MakeCueHardResponse {
  cue: Cue
  converted: number
  /**
   * Group rows replaced by one row per member, because the members resolved to different
   * literals. The cue's row count grows, and the operator is told rather than surprised.
   */
  groupRowsExpanded: number
  /** Rows left as references because they don't currently resolve. */
  unresolved: number
  republishedLive: boolean
}

/** The 409 body both Record and Update use, so the caller can offer "do it anyway". */
export interface ProgrammerConflict {
  error: string
  code: 'CUE_EDIT_SESSION_OPEN' | 'INCLUDE_TARGET_GONE'
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
      // Nothing was written on a failure — and Record's 409 "a cue-edit session is open"
      // path is an ordinary part of the flow, so refetching the whole cue list behind the
      // sheet each time the operator hits it would be pure churn.
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
     * Named `includeIntoProgrammer`, not `includeCue`: the same route now loads a palette's
     * contents as well, and `ProgrammerStore.lastIncludedTarget` is single-valued so the two
     * could not have been separate endpoints anyway.
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
              // referencing row resolves to.
              ...(result.paletteResult ? (['Palette', 'PaletteList'] as const) : []),
            ]
          : [],
    }),

    /**
     * Stop the programmer's references tracking their palettes.
     *
     * Nothing on stage moves — a hardened slot keeps the value it already resolved to — so this
     * invalidates nothing. The refreshed entries arrive over the programmer WS channel, which the
     * backend pokes with a provenance push precisely so a second tab's badges don't go stale.
     */
    makeProgrammerHard: build.mutation<MakeProgrammerHardResponse, MakeProgrammerHardRequest>({
      query: (body) => ({ url: 'programmer/make-hard', method: 'POST', body }),
    }),

    makeCueHard: build.mutation<MakeCueHardResponse, MakeCueHardRequest>({
      query: ({ projectId, cueId, force, ...body }) => ({
        url: `project/${projectId}/cues/${cueId}/make-hard${force ? '?force=true' : ''}`,
        method: 'POST',
        body,
      }),
      // Palette tags too: hardening drops references, so the palette's "used by" count moves and
      // a delete that was blocked a moment ago may now be allowed.
      invalidatesTags: (result, _error, { projectId, cueId }) =>
        result == null
          ? []
          : [
              { type: 'Cue', id: cueId },
              { type: 'CueList', id: projectId },
              'CueList',
              'Palette',
              'PaletteList',
            ],
    }),
  }),
  overrideExisting: false,
})

export const {
  useRecordProgrammerMutation,
  useIncludeIntoProgrammerMutation,
  useUpdateProgrammerMutation,
  useMakeProgrammerHardMutation,
  useMakeCueHardMutation,
} = programmerOpsApi
