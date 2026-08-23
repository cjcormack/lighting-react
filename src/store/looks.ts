import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type { AttributeFamily } from '@/lib/attributeFamily'
import type {
  CopyLookRequest,
  CopyLookResponse,
  LookDetails,
  LookInput,
  LookPreviewRequest,
  LookPreviewResponse,
  LookSummary,
  ToggleLookRequest,
  ToggleLookResponse,
} from '../api/looksApi'

/**
 * Bridge `lookListChanged` into cache invalidation.
 *
 * Called from `main.tsx`, **not** on import, and that is load-bearing rather than stylistic: this
 * slice is imported from the earliest render path (the nav registry, and pickers that mount all
 * over), so touching `lightingApi` in the module body would be a runtime import cycle. It throws a
 * TDZ `ReferenceError` that takes every export with it, and `tsc`, `vite build` and the unit tests
 * (which mock the module) all pass anyway — it shows up solely as a broken app in the browser. See
 * `startOAuthIdentityBridge` for the same trap.
 */
export function startLooksBridge() {
  lightingApi.looks.subscribe(function () {
    // `Fixture` and `GroupList` for the same reason the CRUD mutations carry them:
    // `compatibleLookIds` rides on the fixture and group summaries, so a Look created, copied or
    // deleted on **another** client would otherwise exist here and be offered nowhere —
    // `LookTogglePicker` omits it and `LayerPicker` disables every head for it. Affordable
    // precisely because `lookListChanged` is CRUD-only: a contents edit does not fire it (see
    // `looksWsApi`), so this is not on the per-resolution path.
    store.dispatch(restApi.util.invalidateTags(['Look', 'LookList', 'Fixture', 'GroupList']))
  })
}

export const looksApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * The library's list.
     *
     * `family` is served by filtering *derived* families server-side (there is no column to query),
     * so an unknown value is a 400. The library itself asks for the unfiltered list and filters in
     * the browser, because a Look can sit in several families at once and "All" needs them all
     * anyway; the parameter is here for callers that genuinely want one bank.
     */
    lookList: build.query<LookSummary[], { projectId: number; family?: AttributeFamily }>({
      query: ({ projectId, family }) =>
        family
          ? `project/${projectId}/looks?family=${family}`
          : `project/${projectId}/looks`,
      providesTags: (_result, _error, { projectId }) => [
        { type: 'LookList', id: projectId },
        'LookList',
      ],
      // No `upsertQueryData` fan-out into the detail cache, unlike the preset list this replaces:
      // that list returned whole presets, so seeding the detail query from it was free. A
      // `LookSummary` is deliberately *not* a `LookDetails` — it carries derived counts and a
      // preview instead of rows and effects (see the DTO comment for why they are separate types)
      // — so there is nothing here to seed a detail entry with.
    }),

    look: build.query<LookDetails, { projectId: number; lookId: number }>({
      query: ({ projectId, lookId }) => `project/${projectId}/looks/${lookId}`,
      providesTags: (_result, _error, { lookId }) => [{ type: 'Look', id: lookId }],
    }),

    createLook: build.mutation<LookDetails, { projectId: number } & LookInput>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/looks`,
        method: 'POST',
        body,
      }),
      // Guarded on the result: a create can fail on a blank name (400) or a duplicate name (409),
      // and invalidating then refetches the library to learn nothing changed.
      //
      // `Fixture` and `GroupList` too, and they are not incidental: `compatibleLookIds` is computed
      // server-side and rides on the fixture and group summaries, so without these a Look created
      // here is missing from every compatibility list — `LookTogglePicker` doesn't offer it and
      // `LayerPicker` disables every head for it — until something else refetches those lists.
      invalidatesTags: (result) => (result == null ? [] : ['LookList', 'Fixture', 'GroupList']),
    }),

    /**
     * PUT a Look.
     *
     * Send only the keys you mean to write: the backend receives a raw JSON object so **absent and
     * empty are different** — omitting `rows` leaves the contents alone, sending `[]` clears them.
     * That is what makes a rename cheap and, more importantly, what stops a metadata edit from
     * wiping the rows every live consumer is resolving through.
     */
    saveLook: build.mutation<LookDetails, { projectId: number; lookId: number } & LookInput>({
      query: ({ projectId, lookId, ...body }) => ({
        url: `project/${projectId}/looks/${lookId}`,
        method: 'PUT',
        body,
      }),
      // A rename can collide (409) and a bad row can 400; nothing moved when either happens.
      // Cues are invalidated because a contents edit republishes every cue layering this Look, and
      // `Fixture`/`GroupList` because an edit can move `compatibleLookIds` — changing the editor
      // fixture type, or adding the first effect of a family, changes which heads the Look fits.
      invalidatesTags: (result, _error, { lookId }) =>
        result == null
          ? []
          : [{ type: 'Look', id: lookId }, 'LookList', 'Cue', 'CueList', 'Fixture', 'GroupList'],
    }),

    deleteLook: build.mutation<void, { projectId: number; lookId: number; force?: boolean }>({
      query: ({ projectId, lookId, force }) => ({
        url: `project/${projectId}/looks/${lookId}${force ? '?force=true' : ''}`,
        method: 'DELETE',
      }),
      // Guarded on the *error*, not the result: a 204 carries no body. A LOOK_IN_USE 409 is an
      // ordinary step in the flow (it opens "delete anyway"), and nothing was deleted, so
      // refetching the library would only churn. A forced delete does remove cue layers, hence
      // the cue tags.
      invalidatesTags: (_result, error, { lookId }) =>
        error != null
          ? []
          : [
              'LookList',
              { type: 'Look', id: lookId },
              'CueList',
              'Cue',
              // Same reason as create: the deleted Look has to leave every `compatibleLookIds`.
              'Fixture',
              'GroupList',
            ],
    }),

    copyLook: build.mutation<
      CopyLookResponse,
      { projectId: number; lookId: number } & CopyLookRequest
    >({
      query: ({ projectId, lookId, ...body }) => ({
        url: `project/${projectId}/looks/${lookId}/copy`,
        method: 'POST',
        body,
      }),
      // The copy lands in the *target* project's library, which may not be the one on screen — so
      // the list tag is scoped to that project. `Fixture`/`GroupList` are **not** conditional on
      // the target, though, and comparing it against the *source* project would be the wrong test:
      // those two lists belong to the **active** project (`fixture/list` and `groups` take no
      // project), which this mutation cannot see. Copying from another project's library *into* the
      // active one — the main "Copy to Project" flow — is exactly the case a source==target check
      // skips, and it is the case that most needs the refresh: the new Look would exist and be
      // offered nowhere. Always invalidating costs one refetch of two lists, as a create does.
      invalidatesTags: (result) =>
        result == null
          ? []
          : [{ type: 'LookList', id: result.targetProjectId }, 'Fixture', 'GroupList'],
    }),

    /**
     * Move running programmer-band effects into a Look — what `+ Effect` does with a layer focused.
     *
     * MERGE on the server: the Look keeps the effects it has and gains these, because the operator
     * asked to add one. Invalidates the effect tags as well as the Look, since the instances leave
     * the programmer band and come back through the layer.
     */
    absorbLookEffects: build.mutation<
      { look: LookDetails; absorbed: number },
      { projectId: number; lookId: number; effectIds: number[] }
    >({
      query: ({ projectId, lookId, effectIds }) => ({
        url: `project/${projectId}/looks/${lookId}/absorb-effects`,
        method: 'POST',
        body: { effectIds },
      }),
      invalidatesTags: (_result, _error, { lookId }) => [
        { type: 'Look' as const, id: lookId },
        'LookList' as const,
        'FixtureEffects' as const,
      ],
    }),

    /**
     * Put a Look on these targets, or take it off again — the busking pad's path.
     *
     * Only the Look's **deferred** rows and effects are applied: the pad supplies the targets, so a
     * bound row would land on fixtures the operator never selected.
     */
    toggleLook: build.mutation<
      ToggleLookResponse,
      { projectId: number; lookId: number } & ToggleLookRequest
    >({
      query: ({ projectId, lookId, ...body }) => ({
        url: `project/${projectId}/looks/${lookId}/toggle`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { targets }) => {
        const tags: Array<
          | { type: 'FixtureEffects'; id: string }
          | { type: 'GroupActiveEffects'; id: string }
        > = []
        for (const t of targets) {
          if (t.type === 'fixture') {
            tags.push({ type: 'FixtureEffects', id: t.key })
          } else {
            tags.push({ type: 'GroupActiveEffects', id: t.key })
          }
        }
        return tags
      },
    }),

    // No cache invalidation — preview lands on Layer 4 and surfaces through the existing
    // channel-state WS stream that other consumers already subscribe to.
    previewLook: build.mutation<LookPreviewResponse, { projectId: number } & LookPreviewRequest>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/looks/preview`,
        method: 'POST',
        body,
      }),
    }),

    clearLookPreview: build.mutation<void, { projectId: number }>({
      query: ({ projectId }) => ({
        url: `project/${projectId}/looks/preview`,
        method: 'DELETE',
      }),
    }),
  }),
  overrideExisting: false,
})

export const {
  useLookListQuery,
  useLookQuery,
  useCreateLookMutation,
  useSaveLookMutation,
  useDeleteLookMutation,
  useCopyLookMutation,
  useAbsorbLookEffectsMutation,
  useToggleLookMutation,
  usePreviewLookMutation,
  useClearLookPreviewMutation,
} = looksApi
