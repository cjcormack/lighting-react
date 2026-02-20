import { restApi } from './restApi'
import { cuesApi } from './cues'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type {
  CueStack,
  CueStackInput,
  CueStackCueEntry,
  ReorderCuesRequest,
  AddCueToStackRequest,
  RemoveCueFromStackRequest,
  ActivateCueStackRequest,
  AdvanceCueStackRequest,
  GoToCueRequest,
  CueStackActivateResponse,
  CueStackDeactivateResponse,
} from '../api/cueStacksApi'

// Subscribe to WebSocket cue stack list changes - invalidate all cue stack caches
lightingApi.cueStacks.subscribe(function () {
  store.dispatch(restApi.util.invalidateTags(['CueStackList']))
})

export const cueStacksApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    projectCueStackList: build.query<CueStack[], number>({
      query: (projectId) => `project/${projectId}/cue-stacks`,
      providesTags: (_result, _error, projectId) => [
        { type: 'CueStackList', id: projectId },
        'CueStackList',
      ],
    }),

    projectCueStack: build.query<CueStack, { projectId: number; stackId: number }>({
      query: ({ projectId, stackId }) => `project/${projectId}/cue-stacks/${stackId}`,
      providesTags: (_result, _error, { projectId }) => [
        { type: 'CueStackList', id: projectId },
      ],
    }),

    createProjectCueStack: build.mutation<CueStack, { projectId: number } & CueStackInput>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/cue-stacks`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueStackList', id: projectId },
        'CueStackList',
      ],
    }),

    saveProjectCueStack: build.mutation<
      CueStack,
      { projectId: number; stackId: number } & CueStackInput
    >({
      query: ({ projectId, stackId, ...body }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueStackList', id: projectId },
        'CueStackList',
      ],
    }),

    deleteProjectCueStack: build.mutation<
      void,
      { projectId: number; stackId: number; keepCues?: boolean }
    >({
      query: ({ projectId, stackId, keepCues = true }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}?keepCues=${keepCues}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueStackList', id: projectId },
        'CueStackList',
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    reorderCueStackCues: build.mutation<
      CueStackCueEntry[],
      { projectId: number; stackId: number } & ReorderCuesRequest
    >({
      query: ({ projectId, stackId, ...body }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}/reorder`,
        method: 'POST',
        body,
      }),
      // Optimistic update: immediately rewrite sortOrder in the cue list cache
      // so the UI doesn't snap back to the old order while waiting for the server
      async onQueryStarted({ projectId, cueIds }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          cuesApi.util.updateQueryData('projectCueList', projectId, (draft) => {
            for (const cue of draft) {
              const newIndex = cueIds.indexOf(cue.id)
              if (newIndex !== -1) {
                cue.sortOrder = newIndex
              }
            }
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueStackList', id: projectId },
        'CueStackList',
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    addCueToCueStack: build.mutation<
      CueStackCueEntry[],
      { projectId: number; stackId: number } & AddCueToStackRequest
    >({
      query: ({ projectId, stackId, ...body }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}/add-cue`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueStackList', id: projectId },
        'CueStackList',
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    removeCueFromCueStack: build.mutation<
      CueStackCueEntry[],
      { projectId: number; stackId: number } & RemoveCueFromStackRequest
    >({
      query: ({ projectId, stackId, ...body }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}/remove-cue`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueStackList', id: projectId },
        'CueStackList',
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    activateCueStack: build.mutation<
      CueStackActivateResponse,
      { projectId: number; stackId: number } & ActivateCueStackRequest
    >({
      query: ({ projectId, stackId, ...body }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}/activate`,
        method: 'POST',
        body,
      }),
      // Optimistic update: immediately set activeCueId so the UI highlights correctly
      async onQueryStarted({ projectId, stackId, cueId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          cueStacksApi.util.updateQueryData('projectCueStackList', projectId, (draft) => {
            const stack = draft.find((s) => s.id === stackId)
            if (stack) {
              stack.activeCueId = cueId ?? stack.cues[0]?.id ?? null
            }
          }),
        )
        try {
          const { data } = await queryFulfilled
          dispatch(
            cueStacksApi.util.updateQueryData('projectCueStackList', projectId, (draft) => {
              const stack = draft.find((s) => s.id === stackId)
              if (stack) stack.activeCueId = data.cueId
            }),
          )
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: () => [
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    deactivateCueStack: build.mutation<
      CueStackDeactivateResponse,
      { projectId: number; stackId: number }
    >({
      query: ({ projectId, stackId }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}/deactivate`,
        method: 'POST',
      }),
      // Optimistic update: clear activeCueId immediately
      async onQueryStarted({ projectId, stackId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          cueStacksApi.util.updateQueryData('projectCueStackList', projectId, (draft) => {
            const stack = draft.find((s) => s.id === stackId)
            if (stack) stack.activeCueId = null
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: () => [
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    advanceCueStack: build.mutation<
      CueStackActivateResponse,
      { projectId: number; stackId: number } & AdvanceCueStackRequest
    >({
      query: ({ projectId, stackId, ...body }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}/advance`,
        method: 'POST',
        body,
      }),
      // Optimistic update: compute next cue locally for instant feedback
      async onQueryStarted({ projectId, stackId, direction }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          cueStacksApi.util.updateQueryData('projectCueStackList', projectId, (draft) => {
            const stack = draft.find((s) => s.id === stackId)
            if (!stack || stack.cues.length === 0) return
            const currentIdx = stack.cues.findIndex((c) => c.id === stack.activeCueId)
            const delta = direction === 'FORWARD' ? 1 : -1
            let nextIdx = currentIdx + delta
            if (stack.loop) {
              nextIdx = ((nextIdx % stack.cues.length) + stack.cues.length) % stack.cues.length
            } else {
              nextIdx = Math.max(0, Math.min(stack.cues.length - 1, nextIdx))
            }
            stack.activeCueId = stack.cues[nextIdx]?.id ?? stack.activeCueId
          }),
        )
        try {
          const { data } = await queryFulfilled
          dispatch(
            cueStacksApi.util.updateQueryData('projectCueStackList', projectId, (draft) => {
              const stack = draft.find((s) => s.id === stackId)
              if (stack) stack.activeCueId = data.cueId
            }),
          )
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: () => [
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    goToCueInStack: build.mutation<
      CueStackActivateResponse,
      { projectId: number; stackId: number } & GoToCueRequest
    >({
      query: ({ projectId, stackId, ...body }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}/go-to`,
        method: 'POST',
        body,
      }),
      // Optimistic update: immediately set activeCueId to the target cue
      async onQueryStarted({ projectId, stackId, cueId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          cueStacksApi.util.updateQueryData('projectCueStackList', projectId, (draft) => {
            const stack = draft.find((s) => s.id === stackId)
            if (stack) stack.activeCueId = cueId
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: () => [
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),
  }),
  overrideExisting: false,
})

export const {
  useProjectCueStackListQuery,
  useProjectCueStackQuery,
  useCreateProjectCueStackMutation,
  useSaveProjectCueStackMutation,
  useDeleteProjectCueStackMutation,
  useReorderCueStackCuesMutation,
  useAddCueToCueStackMutation,
  useRemoveCueFromCueStackMutation,
  useActivateCueStackMutation,
  useDeactivateCueStackMutation,
  useAdvanceCueStackMutation,
  useGoToCueInStackMutation,
} = cueStacksApi
