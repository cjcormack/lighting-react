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
    store.dispatch(restApi.util.invalidateTags(['Look', 'LookList']))
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
      invalidatesTags: (result) => (result == null ? [] : ['LookList']),
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
      // Cues are invalidated because a contents edit republishes every cue layering this Look.
      invalidatesTags: (result, _error, { lookId }) =>
        result == null
          ? []
          : [{ type: 'Look', id: lookId }, 'LookList', 'Cue', 'CueList'],
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
          : ['LookList', { type: 'Look', id: lookId }, 'CueList', 'Cue'],
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
      // The copy lands in the *target* project's library, which may not be the one on screen.
      invalidatesTags: (result) =>
        result == null ? [] : [{ type: 'LookList', id: result.targetProjectId }],
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
  useToggleLookMutation,
  usePreviewLookMutation,
  useClearLookPreviewMutation,
} = looksApi
