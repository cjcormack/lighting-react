import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type {
  PromptBookSummary,
  PromptBookDetails,
  NewPromptBookRequest,
  UpsertAnchorRequest,
  AnnotationRequest,
  CueAnchorDto,
  AnnotationDto,
  ScriptUploadResponse,
} from '../api/promptBooksApi'
export type {
  PromptBookSummary,
  PromptBookDetails,
  CueAnchorDto,
  AnnotationDto,
  Rect,
  Region,
  AnnotationKind,
  NoteTone,
} from '../api/promptBooksApi'

// Subscribe to WebSocket prompt book changes - invalidate all prompt book caches
lightingApi.promptBooks.subscribe(function () {
  store.dispatch(restApi.util.invalidateTags(['PromptBookList', 'PromptBook']))
})

export const promptBooksApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    projectPromptBookList: build.query<PromptBookSummary[], number>({
      query: (projectId) => `project/${projectId}/prompt-books`,
      providesTags: (_result, _error, projectId) => [
        { type: 'PromptBookList', id: projectId },
        'PromptBookList',
      ],
    }),

    projectPromptBook: build.query<PromptBookDetails, { projectId: number; bookId: number }>({
      query: ({ projectId, bookId }) => `project/${projectId}/prompt-books/${bookId}`,
      providesTags: (_result, _error, { bookId }) => [
        { type: 'PromptBook', id: bookId },
        'PromptBook',
      ],
    }),

    createPromptBook: build.mutation<PromptBookDetails, { projectId: number } & NewPromptBookRequest>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/prompt-books`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'PromptBookList', id: projectId },
        'PromptBookList',
      ],
    }),

    updatePromptBook: build.mutation<
      PromptBookDetails,
      { projectId: number; bookId: number } & NewPromptBookRequest
    >({
      query: ({ projectId, bookId, ...body }) => ({
        url: `project/${projectId}/prompt-books/${bookId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId, bookId }) => [
        { type: 'PromptBookList', id: projectId },
        { type: 'PromptBook', id: bookId },
      ],
    }),

    deletePromptBook: build.mutation<void, { projectId: number; bookId: number }>({
      query: ({ projectId, bookId }) => ({
        url: `project/${projectId}/prompt-books/${bookId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { projectId, bookId }) => [
        { type: 'PromptBookList', id: projectId },
        { type: 'PromptBook', id: bookId },
      ],
    }),

    uploadScriptDoc: build.mutation<ScriptUploadResponse, { projectId: number; bytes: ArrayBuffer }>({
      query: ({ projectId, bytes }) => ({
        url: `project/${projectId}/prompt-books/scripts`,
        method: 'POST',
        body: bytes,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    }),

    upsertAnchor: build.mutation<
      CueAnchorDto,
      { projectId: number; bookId: number; cueId: number } & UpsertAnchorRequest
    >({
      query: ({ projectId, bookId, cueId, ...body }) => ({
        url: `project/${projectId}/prompt-books/${bookId}/anchors/${cueId}`,
        method: 'PUT',
        body,
      }),
      // Optimistic update: patch the anchor into the book cache immediately so a
      // drag commit doesn't snap back while waiting for the server.
      async onQueryStarted({ projectId, bookId, cueId, region, label }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          promptBooksApi.util.updateQueryData('projectPromptBook', { projectId, bookId }, (draft) => {
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
      invalidatesTags: (_result, _error, { projectId, bookId }) => [
        { type: 'PromptBookList', id: projectId },
        { type: 'PromptBook', id: bookId },
      ],
    }),

    deleteAnchor: build.mutation<void, { projectId: number; bookId: number; cueId: number }>({
      query: ({ projectId, bookId, cueId }) => ({
        url: `project/${projectId}/prompt-books/${bookId}/anchors/${cueId}`,
        method: 'DELETE',
      }),
      async onQueryStarted({ projectId, bookId, cueId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          promptBooksApi.util.updateQueryData('projectPromptBook', { projectId, bookId }, (draft) => {
            draft.anchors = draft.anchors.filter((a) => a.cueId !== cueId)
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: (_result, _error, { projectId, bookId }) => [
        { type: 'PromptBookList', id: projectId },
        { type: 'PromptBook', id: bookId },
      ],
    }),

    createAnnotation: build.mutation<
      AnnotationDto,
      { projectId: number; bookId: number } & AnnotationRequest
    >({
      query: ({ projectId, bookId, ...body }) => ({
        url: `project/${projectId}/prompt-books/${bookId}/annotations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId, bookId }) => [
        { type: 'PromptBookList', id: projectId },
        { type: 'PromptBook', id: bookId },
      ],
    }),

    updateAnnotation: build.mutation<
      AnnotationDto,
      { projectId: number; bookId: number; annotationId: number } & AnnotationRequest
    >({
      query: ({ projectId, bookId, annotationId, ...body }) => ({
        url: `project/${projectId}/prompt-books/${bookId}/annotations/${annotationId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId, bookId }) => [
        { type: 'PromptBookList', id: projectId },
        { type: 'PromptBook', id: bookId },
      ],
    }),

    deleteAnnotation: build.mutation<void, { projectId: number; bookId: number; annotationId: number }>({
      query: ({ projectId, bookId, annotationId }) => ({
        url: `project/${projectId}/prompt-books/${bookId}/annotations/${annotationId}`,
        method: 'DELETE',
      }),
      async onQueryStarted({ projectId, bookId, annotationId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          promptBooksApi.util.updateQueryData('projectPromptBook', { projectId, bookId }, (draft) => {
            draft.annotations = draft.annotations.filter((n) => n.id !== annotationId)
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: (_result, _error, { projectId, bookId }) => [
        { type: 'PromptBookList', id: projectId },
        { type: 'PromptBook', id: bookId },
      ],
    }),
  }),
  overrideExisting: false,
})

export const {
  useProjectPromptBookListQuery,
  useProjectPromptBookQuery,
  useCreatePromptBookMutation,
  useUpdatePromptBookMutation,
  useDeletePromptBookMutation,
  useUploadScriptDocMutation,
  useUpsertAnchorMutation,
  useDeleteAnchorMutation,
  useCreateAnnotationMutation,
  useUpdateAnnotationMutation,
  useDeleteAnnotationMutation,
} = promptBooksApi
