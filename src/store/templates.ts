import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type { AttributeFamily } from '@/lib/attributeFamily'
import type {
  ApplyTemplateResponse,
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
    store.dispatch(restApi.util.invalidateTags(['Template', 'TemplateList']))
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
          ? `project/${projectId}/templates?family=${family}`
          : `project/${projectId}/templates`,
      providesTags: (_result, _error, { projectId }) => [
        { type: 'TemplateList', id: projectId },
        'TemplateList',
      ],
    }),

    template: build.query<TemplateSummary, { projectId: number; templateId: number }>({
      query: ({ projectId, templateId }) => `project/${projectId}/templates/${templateId}`,
      providesTags: (_result, _error, { templateId }) => [{ type: 'Template', id: templateId }],
    }),

    createTemplate: build.mutation<TemplateSummary, { projectId: number } & TemplateInput>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/templates`,
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
     * Omit `rows` for a metadata-only edit; sending them replaces the lot. A contents edit is a
     * **live write** — the server republishes every cue layering this template and the programmer's
     * own stack — so `Cue` / `CueList` go with it.
     */
    saveTemplate: build.mutation<
      TemplateSummary,
      { projectId: number; templateId: number } & TemplateInput
    >({
      query: ({ projectId, templateId, ...body }) => ({
        url: `project/${projectId}/templates/${templateId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (result, _error, { templateId }) =>
        result == null
          ? []
          : [{ type: 'Template', id: templateId }, 'TemplateList', 'Cue', 'CueList'],
    }),

    deleteTemplate: build.mutation<
      void,
      { projectId: number; templateId: number; force?: boolean }
    >({
      query: ({ projectId, templateId, force }) => ({
        url: `project/${projectId}/templates/${templateId}${force ? '?force=true' : ''}`,
        method: 'DELETE',
      }),
      // Guarded on the *error*, not the result: a 204 carries no body. A TEMPLATE_IN_USE 409 is an
      // ordinary step (it opens "delete anyway") and nothing was deleted. A forced delete does
      // remove cue layers, hence the cue tags.
      invalidatesTags: (_result, error, { templateId }) =>
        error != null
          ? []
          : ['TemplateList', { type: 'Template', id: templateId }, 'CueList', 'Cue'],
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
        url: `project/${projectId}/templates/resolve`,
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
        url: `project/${projectId}/templates/${templateId}/apply`,
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
        url: `project/${projectId}/templates/from-programmer`,
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
        url: `project/${projectId}/templates/${templateId}/toggle`,
        method: 'POST',
        body,
      }),
    }),
  }),
  overrideExisting: false,
})

export const {
  useTemplateListQuery,
  useCreateTemplateFromProgrammerMutation,
  useTemplateQuery,
  useCreateTemplateMutation,
  useSaveTemplateMutation,
  useDeleteTemplateMutation,
  useResolveTemplateMutation,
  useApplyTemplateMutation,
  useToggleTemplateMutation,
} = templatesApi
