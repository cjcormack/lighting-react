import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type { AttributeFamily } from '@/lib/attributeFamily'
import type {
  ApplyTemplateResponse,
  ReorderTemplatesRequest,
  TemplateGroup,
  TemplateGroupInput,
  TemplateInput,
  TemplateResolveRequest,
  TemplateResolveResponse,
  TemplateSummary,
  TemplateTarget,
  ToggleTemplateResponse,
} from '../api/templatesApi'

/**
 * Bridge `templateListChanged` into cache invalidation.
 *
 * Called from `main.tsx`, **not** on import — the same trap `startLooksBridge` documents: this slice
 * is imported from the earliest render path (the nav registry, and the programmer's template strip),
 * so touching `lightingApi` in the module body is a runtime import cycle that throws a TDZ
 * `ReferenceError` and takes every export with it, while `tsc`, `vite build` and the unit tests all
 * pass.
 *
 * Note what is **absent** compared to the looks bridge: no `Fixture` / `GroupList`. Those two are
 * invalidated there because `compatibleLookIds` rides on the fixture and group summaries — and a
 * template has no compatibility list at all. Compatibility is capability-only now (D6), and a
 * client can answer it from a fixture's own `capabilities`, so creating a template moves nothing on
 * those two lists.
 */
export function startTemplatesBridge() {
  lightingApi.templates.subscribe(function () {
    // `Cue` rides along for the reason the looks bridge gives: a template created, copied or
    // deleted elsewhere changes what the cues layering it compose to, and this signal is the only
    // announcement of a delete. A template *retune* rides `cuesRecomposed` instead. `CueList` is
    // the same pairing the looks bridge and every cue-affecting mutation here use — the list's
    // entries carry `layers[].source.name`, so a rename shows through it.
    store.dispatch(restApi.util.invalidateTags(['TemplateList', 'Cue', 'CueList']))
  })
}

export const templatesApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * The library's list.
     *
     * `family` really is an **exact partition** here, unlike `/looks` — a template is in exactly one
     * family by construction — so the filter can be served either side. It is passed through to the
     * server so a deep link lands filtered without the client having to hold the whole list.
     */
    templateList: build.query<TemplateSummary[], { projectId: number; family?: AttributeFamily }>({
      query: ({ projectId, family }) =>
        family
          ? `projects/${projectId}/templates?family=${family}`
          : `projects/${projectId}/templates`,
      providesTags: (_result, _error, { projectId }) => [
        { type: 'TemplateList', id: projectId },
        'TemplateList',
      ],
    }),

    // A single-template read stood here. The editor opens from a `templateList` row and the
    // list carries the whole summary, so nothing fetched one on its own.

    /**
     * The project's template groups — the other half of the library's shape, beside `templateList`.
     *
     * Rides the **same** `'TemplateList'` tag rather than one of its own: the server announces a
     * group create, rename, delete and every reorder as `templateListChanged`, one fact ("the
     * library changed shape") that the bridge above maps to one invalidation. A second tag would
     * only ever be invalidated in lockstep with this one.
     */
    templateGroupList: build.query<TemplateGroup[], { projectId: number }>({
      query: ({ projectId }) => `projects/${projectId}/template-groups`,
      providesTags: (_result, _error, { projectId }) => [
        { type: 'TemplateList', id: projectId },
        'TemplateList',
      ],
    }),

    createTemplateGroup: build.mutation<TemplateGroup, { projectId: number } & TemplateGroupInput>({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/template-groups`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result) => (result == null ? [] : ['TemplateList']),
    }),

    renameTemplateGroup: build.mutation<
      TemplateGroup,
      { projectId: number; groupId: number } & TemplateGroupInput
    >({
      query: ({ projectId, groupId, ...body }) => ({
        url: `projects/${projectId}/template-groups/${groupId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (result) => (result == null ? [] : ['TemplateList']),
    }),

    /**
     * Dissolve a group. Its members go back to the top level in the group's place — nothing is
     * deleted but the cluster — so only the list tag moves; no cue composes differently.
     */
    deleteTemplateGroup: build.mutation<void, { projectId: number; groupId: number }>({
      query: ({ projectId, groupId }) => ({
        url: `projects/${projectId}/template-groups/${groupId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, error) => (error != null ? [] : ['TemplateList']),
    }),

    /**
     * Write the whole layout — order and membership for every template and group at once.
     *
     * Optimistic on **both** caches, the `reorderCueStacks` pattern twice over: a drop that snapped
     * back until the refetch landed would read as a refused drag. The `templateList` patch targets
     * the `{ projectId }` key with no `family`, which is the key every live consumer uses — the
     * busk view and `/templates` both fetch unfiltered and filter client-side — so a filtered entry,
     * if one ever exists, is left to the tag invalidation.
     *
     * A 409 `TEMPLATE_GROUP_FAMILY` undoes both patches and reaches the caller as an ordinary
     * rejection; the page shows the server's own sentence.
     */
    reorderTemplates: build.mutation<void, { projectId: number } & ReorderTemplatesRequest>({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/templates/reorder`,
        method: 'POST',
        body,
      }),
      async onQueryStarted({ projectId, entries }, { dispatch, queryFulfilled }) {
        const templatePatch = dispatch(
          templatesApi.util.updateQueryData('templateList', { projectId }, (draft) => {
            const byId = new Map(draft.map((t) => [t.id, t]))
            entries.forEach((entry, index) => {
              if (entry.templateId != null) {
                const t = byId.get(entry.templateId)
                if (t) {
                  t.groupId = null
                  t.sortOrder = index
                }
              } else if (entry.groupId != null) {
                const groupId = entry.groupId
                ;(entry.templateIds ?? []).forEach((id, memberIndex) => {
                  const t = byId.get(id)
                  if (t) {
                    t.groupId = groupId
                    t.sortOrder = memberIndex
                  }
                })
              }
            })
          }),
        )
        const groupPatch = dispatch(
          templatesApi.util.updateQueryData('templateGroupList', { projectId }, (draft) => {
            entries.forEach((entry, index) => {
              if (entry.groupId == null) return
              const g = draft.find((group) => group.id === entry.groupId)
              if (g) g.sortOrder = index
            })
            draft.sort((a, b) => a.sortOrder - b.sortOrder)
          }),
        )
        try {
          await queryFulfilled
        } catch {
          templatePatch.undo()
          groupPatch.undo()
        }
      },
      invalidatesTags: (_result, error) => (error != null ? [] : ['TemplateList']),
    }),

    createTemplate: build.mutation<TemplateSummary, { projectId: number } & TemplateInput>({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/templates`,
        method: 'POST',
        body,
      }),
      // Guarded on the result: a create can fail on a blank name (400), a duplicate (409) or any of
      // the four write-boundary rules (400), and invalidating then refetches to learn nothing moved.
      invalidatesTags: (result) => (result == null ? [] : ['TemplateList']),
    }),

    /**
     * PUT a template.
     *
     * Omit `rows` (or `effect`) for a metadata-only edit; sending either replaces that half. Send
     * **at most one of the two** — which half a template holds is fixed at creation, and a PUT
     * naming the other is a 400. A contents edit is a **live write** — the server republishes every
     * cue layering this template and the programmer's own stack — so `Cue` / `CueList` go with it.
     */
    saveTemplate: build.mutation<
      TemplateSummary,
      { projectId: number; templateId: number } & TemplateInput
    >({
      query: ({ projectId, templateId, ...body }) => ({
        url: `projects/${projectId}/templates/${templateId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (result) =>
        result == null ? [] : ['TemplateList', 'Cue', 'CueList'],
    }),

    deleteTemplate: build.mutation<
      void,
      { projectId: number; templateId: number; force?: boolean }
    >({
      query: ({ projectId, templateId, force }) => ({
        url: `projects/${projectId}/templates/${templateId}${force ? '?force=true' : ''}`,
        method: 'DELETE',
      }),
      // Guarded on the *error*, not the result: a 204 carries no body. A TEMPLATE_IN_USE 409 is an
      // ordinary step (it opens "delete anyway") and nothing was deleted. A forced delete does
      // remove cue layers, hence the cue tags.
      invalidatesTags: (_result, error) =>
        error != null ? [] : ['TemplateList', 'CueList', 'Cue'],
    }),

    /**
     * The editor's "resolves to" panel — the **same** resolver the cook runs, asked about a draft.
     *
     * A mutation rather than a query despite being a read, because the question is "resolve *this*
     * body", which has no stable cache key worth holding: the editor asks again on every change and
     * the answer is only interesting for the draft in front of you.
     */
    resolveTemplate: build.mutation<
      TemplateResolveResponse,
      { projectId: number } & TemplateResolveRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/templates/resolve`,
        method: 'POST',
        body,
      }),
    }),

    /**
     * **Click**: set literal values in the programmer for the current selection.
     *
     * No dependency — retuning the template later does not move these. That is the whole difference
     * from `toggleTemplate` below, and why the two gestures are two routes rather than a flag.
     *
     * No cache invalidation: the values land in the programmer and surface through the programmer's
     * own WS state, which every consumer already subscribes to.
     */
    applyTemplate: build.mutation<
      ApplyTemplateResponse,
      { projectId: number; templateId: number; targets: TemplateTarget[]; fadeMs?: number }
    >({
      query: ({ projectId, templateId, ...body }) => ({
        url: `projects/${projectId}/templates/${templateId}/apply`,
        method: 'POST',
        body,
      }),
    }),

    /**
     * **New from selection**: record what is selected as a new template.
     *
     * Server-side, and the third route that is for the same reason as the other two: converting a
     * recorded *literal* back into an **intent** is per-head arithmetic that has to agree with the
     * resolver, and a client doing it would be a second opinion about what the rig is showing. It
     * also decides generic-vs-per-fixture from the data rather than from a toggle.
     */
    createTemplateFromProgrammer: build.mutation<
      {
        template: TemplateSummary
        isGeneric: boolean
        skipped: { fixtureKey: string; propertyName: string; reason: string }[]
      },
      {
        projectId: number
        name: string
        notes?: string | null
        mask: AttributeFamily[]
        targets: TemplateTarget[]
        source?: 'TOUCHED' | 'ALL' | 'STAGE_SNAPSHOT'
      }
    >({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/templates/from-programmer`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result) => (result == null ? [] : ['TemplateList']),
    }),

    /**
     * **⌥click**: add (or remove) a layer that *tracks* the template, targeted at the selection.
     *
     * The layer is the dependency mechanism — it already is, for Looks — so "a colour I can change
     * everywhere later" and "a colour I want right now" are two gestures on one chip rather than two
     * kinds of template.
     */
    toggleTemplate: build.mutation<
      ToggleTemplateResponse,
      { projectId: number; templateId: number; targets: TemplateTarget[]; propertyMask?: string }
    >({
      query: ({ projectId, templateId, ...body }) => ({
        url: `projects/${projectId}/templates/${templateId}/toggle`,
        method: 'POST',
        body,
      }),
    }),
  }),
  overrideExisting: false,
})

export const {
  useTemplateListQuery,
  useTemplateGroupListQuery,
  useCreateTemplateGroupMutation,
  useRenameTemplateGroupMutation,
  useDeleteTemplateGroupMutation,
  useReorderTemplatesMutation,
  useCreateTemplateFromProgrammerMutation,
  useCreateTemplateMutation,
  useSaveTemplateMutation,
  useDeleteTemplateMutation,
  useResolveTemplateMutation,
  useApplyTemplateMutation,
  useToggleTemplateMutation,
} = templatesApi
