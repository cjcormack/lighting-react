import { restApi } from './restApi'
import type { Cue } from '../api/cuesApi'
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
  cueId: number
  mask?: PropertyMaskGroup[]
  includeFx?: boolean
  fadeMs?: number
}

export interface IncludeResponse {
  cueId: number
  cueStackId?: number
  cueName: string
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

export interface UpdateResponse {
  applied: boolean
  mode: 'A' | 'B' | 'CHECKLIST'
  results: UpdateResult[]
  checklist?: UpdateChecklist
  skipped: ProgrammerSkip[]
  warnings: string[]
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

    includeCue: build.mutation<IncludeResponse, IncludeRequest>({
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
        result?.applied ? [{ type: 'CueList', id: projectId }, 'CueList'] : [],
    }),
  }),
  overrideExisting: false,
})

export const {
  useRecordProgrammerMutation,
  useIncludeCueMutation,
  useUpdateProgrammerMutation,
} = programmerOpsApi
