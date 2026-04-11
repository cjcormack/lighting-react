import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type {
  ShowSessionDetails,
  NewShowSession,
  UpdateShowSession,
  AddStackToSessionRequest,
  AddMarkerToSessionRequest,
  UpdateShowSessionEntryRequest,
  ReorderEntriesRequest,
  AdvanceShowSessionRequest,
  GoToSessionEntryRequest,
  ShowSessionActivateResponse,
} from '../api/showSessionsApi'

// Subscribe to WebSocket show session list changes
lightingApi.showSessions.subscribe(function () {
  store.dispatch(restApi.util.invalidateTags(['ShowSessionList']))
})

export const showSessionsApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    projectShowSessionList: build.query<ShowSessionDetails[], number>({
      query: (projectId) => `project/${projectId}/show-sessions`,
      providesTags: (_result, _error, projectId) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
      ],
    }),

    projectShowSession: build.query<ShowSessionDetails, { projectId: number; sessionId: number }>({
      query: ({ projectId, sessionId }) => `project/${projectId}/show-sessions/${sessionId}`,
      providesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
      ],
    }),

    createShowSession: build.mutation<ShowSessionDetails, { projectId: number } & NewShowSession>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/show-sessions`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
      ],
    }),

    updateShowSession: build.mutation<
      ShowSessionDetails,
      { projectId: number; sessionId: number } & UpdateShowSession
    >({
      query: ({ projectId, sessionId, ...body }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
      ],
    }),

    deleteShowSession: build.mutation<void, { projectId: number; sessionId: number }>({
      query: ({ projectId, sessionId }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
      ],
    }),

    addStackToSession: build.mutation<
      ShowSessionDetails,
      { projectId: number; sessionId: number } & AddStackToSessionRequest
    >({
      query: ({ projectId, sessionId, ...body }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}/add-stack`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
      ],
    }),

    addMarkerToSession: build.mutation<
      ShowSessionDetails,
      { projectId: number; sessionId: number } & AddMarkerToSessionRequest
    >({
      query: ({ projectId, sessionId, ...body }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}/add-marker`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
      ],
    }),

    updateShowSessionEntry: build.mutation<
      ShowSessionDetails,
      { projectId: number; sessionId: number; entryId: number } & UpdateShowSessionEntryRequest
    >({
      query: ({ projectId, sessionId, entryId, ...body }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}/entries/${entryId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
      ],
    }),

    deleteShowSessionEntry: build.mutation<
      void,
      { projectId: number; sessionId: number; entryId: number }
    >({
      query: ({ projectId, sessionId, entryId }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}/entries/${entryId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
      ],
    }),

    reorderShowSessionEntries: build.mutation<
      void,
      { projectId: number; sessionId: number } & ReorderEntriesRequest
    >({
      query: ({ projectId, sessionId, ...body }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}/reorder`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
      ],
    }),

    activateShowSession: build.mutation<
      ShowSessionActivateResponse,
      { projectId: number; sessionId: number }
    >({
      query: ({ projectId, sessionId }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}/activate`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    deactivateShowSession: build.mutation<void, { projectId: number; sessionId: number }>({
      query: ({ projectId, sessionId }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}/deactivate`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    advanceShowSession: build.mutation<
      ShowSessionActivateResponse,
      { projectId: number; sessionId: number } & AdvanceShowSessionRequest
    >({
      query: ({ projectId, sessionId, ...body }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}/advance`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    goToShowSessionEntry: build.mutation<
      ShowSessionActivateResponse,
      { projectId: number; sessionId: number } & GoToSessionEntryRequest
    >({
      query: ({ projectId, sessionId, ...body }) => ({
        url: `project/${projectId}/show-sessions/${sessionId}/go-to`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowSessionList', id: projectId },
        'ShowSessionList',
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),
  }),
  overrideExisting: false,
})

export const {
  useProjectShowSessionListQuery,
  useProjectShowSessionQuery,
  useCreateShowSessionMutation,
  useUpdateShowSessionMutation,
  useDeleteShowSessionMutation,
  useAddStackToSessionMutation,
  useAddMarkerToSessionMutation,
  useUpdateShowSessionEntryMutation,
  useDeleteShowSessionEntryMutation,
  useReorderShowSessionEntriesMutation,
  useActivateShowSessionMutation,
  useDeactivateShowSessionMutation,
  useAdvanceShowSessionMutation,
  useGoToShowSessionEntryMutation,
} = showSessionsApi
