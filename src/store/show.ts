import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type {
  ShowDetails,
  AddStackToShowRequest,
  AddMarkerToShowRequest,
  UpdateShowEntryRequest,
  ReorderEntriesRequest,
  AdvanceShowRequest,
  GoToShowEntryRequest,
  ShowActivateResponse,
} from '../api/showApi'

// Subscribe to WebSocket show entry list changes
lightingApi.show.subscribeToEntriesChanged(function () {
  store.dispatch(restApi.util.invalidateTags(['ShowEntries']))
})

export const showApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    projectShow: build.query<ShowDetails, number>({
      query: (projectId) => `project/${projectId}/show`,
      providesTags: (_result, _error, projectId) => [{ type: 'ShowEntries', id: projectId }],
    }),

    addStackToShow: build.mutation<
      ShowDetails,
      { projectId: number } & AddStackToShowRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/show/add-stack`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [{ type: 'ShowEntries', id: projectId }],
    }),

    addMarkerToShow: build.mutation<
      ShowDetails,
      { projectId: number } & AddMarkerToShowRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/show/add-marker`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [{ type: 'ShowEntries', id: projectId }],
    }),

    updateShowEntry: build.mutation<
      ShowDetails,
      { projectId: number; entryId: number } & UpdateShowEntryRequest
    >({
      query: ({ projectId, entryId, ...body }) => ({
        url: `project/${projectId}/show/entries/${entryId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [{ type: 'ShowEntries', id: projectId }],
    }),

    deleteShowEntry: build.mutation<
      void,
      { projectId: number; entryId: number }
    >({
      query: ({ projectId, entryId }) => ({
        url: `project/${projectId}/show/entries/${entryId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [{ type: 'ShowEntries', id: projectId }],
    }),

    reorderShowEntries: build.mutation<
      void,
      { projectId: number } & ReorderEntriesRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/show/reorder`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [{ type: 'ShowEntries', id: projectId }],
    }),

    activateShow: build.mutation<ShowActivateResponse, { projectId: number }>({
      query: ({ projectId }) => ({
        url: `project/${projectId}/show/activate`,
        method: 'POST',
      }),
      // Patch the show cache as soon as the server confirms activation so that
      // `isShowActive` flips before the refetch triggered by `invalidatesTags`
      // completes. Avoids a flicker of the Start CTA when navigating from
      // Program → Run after Start.
      async onQueryStarted({ projectId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          dispatch(
            showApi.util.updateQueryData('projectShow', projectId, (draft) => {
              draft.activeEntryId = data.activeEntryId
            }),
          )
        } catch {
          // Mutation failed — nothing to patch
        }
      },
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowEntries', id: projectId },
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    deactivateShow: build.mutation<void, { projectId: number }>({
      query: ({ projectId }) => ({
        url: `project/${projectId}/show/deactivate`,
        method: 'POST',
      }),
      // Symmetric to activateShow — clear `activeEntryId` immediately on
      // confirmation so the Start CTA appears without waiting for the refetch.
      async onQueryStarted({ projectId }, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          dispatch(
            showApi.util.updateQueryData('projectShow', projectId, (draft) => {
              draft.activeEntryId = null
            }),
          )
        } catch {
          // Mutation failed — nothing to patch
        }
      },
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowEntries', id: projectId },
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    advanceShow: build.mutation<
      ShowActivateResponse,
      { projectId: number } & AdvanceShowRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/show/advance`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowEntries', id: projectId },
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    goToShowEntry: build.mutation<
      ShowActivateResponse,
      { projectId: number } & GoToShowEntryRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/show/go-to`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ShowEntries', id: projectId },
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),
  }),
  overrideExisting: false,
})

export const {
  useProjectShowQuery,
  useAddStackToShowMutation,
  useAddMarkerToShowMutation,
  useUpdateShowEntryMutation,
  useDeleteShowEntryMutation,
  useReorderShowEntriesMutation,
  useActivateShowMutation,
  useDeactivateShowMutation,
  useAdvanceShowMutation,
  useGoToShowEntryMutation,
} = showApi
