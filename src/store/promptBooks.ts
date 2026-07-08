import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type {
  PromptBookDetails,
  NewPromptBookRequest,
  UpsertAnchorRequest,
  AnnotationRequest,
  CueAnchorDto,
  CueLocationDto,
  AnnotationDto,
  ScriptUploadResponse,
} from '../api/promptBooksApi'
export type {
  PromptBookDetails,
  CueAnchorDto,
  CueLocationDto,
  AnnotationDto,
  Rect,
  Region,
  AnnotationKind,
  NoteTone,
} from '../api/promptBooksApi'

// Subscribe to WebSocket prompt book changes - invalidate the prompt book cache
lightingApi.promptBooks.subscribe(function () {
  store.dispatch(restApi.util.invalidateTags(['PromptBook']))
})

export const promptBooksApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    // The project's single prompt book. A 404 means "no book imported yet" — the
    // viewer treats that as its empty/import state.
    projectPromptBook: build.query<PromptBookDetails, number>({
      query: (projectId) => `project/${projectId}/prompt-book`,
      providesTags: ['PromptBook'],
    }),

    // Per-cue reading positions from the project's prompt book, for the Run view.
    // Tagged PromptBook so it rides the same invalidation as anchor edits (both the
    // anchor mutations and the WS promptBookChanged echo refresh it).
    projectCueLocations: build.query<CueLocationDto[], number>({
      query: (projectId) => `project/${projectId}/cue-locations`,
      providesTags: ['PromptBook'],
    }),

    // Create or replace the project's prompt book (idempotent PUT — the show has one).
    setPromptBook: build.mutation<PromptBookDetails, { projectId: number } & NewPromptBookRequest>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/prompt-book`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['PromptBook'],
    }),

    uploadScriptDoc: build.mutation<ScriptUploadResponse, { projectId: number; bytes: ArrayBuffer }>({
      query: ({ projectId, bytes }) => ({
        url: `project/${projectId}/prompt-book/scripts`,
        method: 'POST',
        body: bytes,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    }),

    upsertAnchor: build.mutation<
      CueAnchorDto,
      { projectId: number; cueId: number } & UpsertAnchorRequest
    >({
      query: ({ projectId, cueId, ...body }) => ({
        url: `project/${projectId}/prompt-book/anchors/${cueId}`,
        method: 'PUT',
        body,
      }),
      // Optimistic update: patch the anchor into the book cache immediately so a
      // drag commit doesn't snap back while waiting for the server.
      async onQueryStarted({ projectId, cueId, region, label }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          promptBooksApi.util.updateQueryData('projectPromptBook', projectId, (draft) => {
            const existing = draft.anchors.find((a) => a.cueId === cueId)
            if (existing) {
              existing.region = region
              existing.label = label ?? null
            } else {
              draft.anchors.push({ cueId, region, label: label ?? null })
            }
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: ['PromptBook'],
    }),

    deleteAnchor: build.mutation<void, { projectId: number; cueId: number }>({
      query: ({ projectId, cueId }) => ({
        url: `project/${projectId}/prompt-book/anchors/${cueId}`,
        method: 'DELETE',
      }),
      async onQueryStarted({ projectId, cueId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          promptBooksApi.util.updateQueryData('projectPromptBook', projectId, (draft) => {
            draft.anchors = draft.anchors.filter((a) => a.cueId !== cueId)
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: ['PromptBook'],
    }),

    createAnnotation: build.mutation<
      AnnotationDto,
      { projectId: number } & AnnotationRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/prompt-book/annotations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['PromptBook'],
    }),

    updateAnnotation: build.mutation<
      AnnotationDto,
      { projectId: number; annotationId: number } & AnnotationRequest
    >({
      query: ({ projectId, annotationId, ...body }) => ({
        url: `project/${projectId}/prompt-book/annotations/${annotationId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['PromptBook'],
    }),

    deleteAnnotation: build.mutation<void, { projectId: number; annotationId: number }>({
      query: ({ projectId, annotationId }) => ({
        url: `project/${projectId}/prompt-book/annotations/${annotationId}`,
        method: 'DELETE',
      }),
      async onQueryStarted({ projectId, annotationId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          promptBooksApi.util.updateQueryData('projectPromptBook', projectId, (draft) => {
            draft.annotations = draft.annotations.filter((n) => n.id !== annotationId)
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: ['PromptBook'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useProjectPromptBookQuery,
  useProjectCueLocationsQuery,
  useSetPromptBookMutation,
  useUploadScriptDocMutation,
  useUpsertAnchorMutation,
  useDeleteAnchorMutation,
  useCreateAnnotationMutation,
  useUpdateAnnotationMutation,
  useDeleteAnnotationMutation,
} = promptBooksApi
