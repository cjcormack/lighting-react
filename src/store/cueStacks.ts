import { restApi } from './restApi'
import { cuesApi } from './cues'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type {
  CueStack,
  CueStackInput,
  CueStackCueEntry,
  ReorderCuesRequest,
  ReorderCueStacksRequest,
  AddCueToStackRequest,
  ActivateCueStackRequest,
  AdvanceCueStackRequest,
  GoToCueRequest,
  CueStackActivateResponse,
  CueStackDeactivateResponse,
  ProgramState,
  AdvanceProgramRequest,
  GoToStackRequest,
  ProgramActivateResponse,
} from '../api/cueStacksApi'
export type { CueStack, CueStackCueEntry } from '../api/cueStacksApi'
export type { CueType, StackType } from '../api/cueStacksApi'

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

    // The project's playhead — which stack is currently live. The ordered stack list itself
    // comes from projectCueStackList; this is just the transport state.
    projectProgramState: build.query<ProgramState, number>({
      query: (projectId) => `project/${projectId}/show`,
      providesTags: (_result, _error, projectId) => [{ type: 'ProgramState', id: projectId }],
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

    // Deleting a stack cascades its cues (standalone cues no longer exist). Deleting a separator
    // just removes that divider row.
    deleteProjectCueStack: build.mutation<
      void,
      { projectId: number; stackId: number }
    >({
      query: ({ projectId, stackId }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueStackList', id: projectId },
        'CueStackList',
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    // Reorder the project's stacks + separators (the show order).
    reorderCueStacks: build.mutation<
      void,
      { projectId: number } & ReorderCueStacksRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/cue-stacks/reorder`,
        method: 'POST',
        body,
      }),
      // Optimistically rewrite sortOrder so the list doesn't snap back mid-drag.
      async onQueryStarted({ projectId, stackIds }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          cueStacksApi.util.updateQueryData('projectCueStackList', projectId, (draft) => {
            for (const stack of draft) {
              const newIndex = stackIds.indexOf(stack.id)
              if (newIndex !== -1) stack.sortOrder = newIndex
            }
            draft.sort((a, b) => a.sortOrder - b.sortOrder)
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

    // Add or move a cue into a stack (moving between stacks; there is no standalone target).
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

    sortCueStackByCueNumber: build.mutation<
      CueStackCueEntry[],
      { projectId: number; stackId: number }
    >({
      query: ({ projectId, stackId }) => ({
        url: `project/${projectId}/cue-stacks/${stackId}/sort-by-cue-number`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueStackList', id: projectId },
        'CueStackList',
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    // ─── Program transport (project playhead over the ordered stacks) ─────────

    activateProgram: build.mutation<ProgramActivateResponse, { projectId: number }>({
      query: ({ projectId }) => ({ url: `project/${projectId}/show/activate`, method: 'POST' }),
      // Patch the playhead as soon as the server confirms so `isShowActive` flips immediately.
      async onQueryStarted({ projectId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          dispatch(
            cueStacksApi.util.updateQueryData('projectProgramState', projectId, (draft) => {
              draft.activeStackId = data.activeStackId
            }),
          )
        } catch {
          // Mutation failed — nothing to patch
        }
      },
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ProgramState', id: projectId },
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    deactivateProgram: build.mutation<void, { projectId: number }>({
      query: ({ projectId }) => ({ url: `project/${projectId}/show/deactivate`, method: 'POST' }),
      async onQueryStarted({ projectId }, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          dispatch(
            cueStacksApi.util.updateQueryData('projectProgramState', projectId, (draft) => {
              draft.activeStackId = null
            }),
          )
        } catch {
          // Mutation failed — nothing to patch
        }
      },
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ProgramState', id: projectId },
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    advanceProgram: build.mutation<
      ProgramActivateResponse,
      { projectId: number } & AdvanceProgramRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/show/advance`,
        method: 'POST',
        body,
      }),
      async onQueryStarted({ projectId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          dispatch(
            cueStacksApi.util.updateQueryData('projectProgramState', projectId, (draft) => {
              draft.activeStackId = data.activeStackId
            }),
          )
        } catch {
          // Mutation failed — nothing to patch
        }
      },
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ProgramState', id: projectId },
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    goToStack: build.mutation<
      ProgramActivateResponse,
      { projectId: number } & GoToStackRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/show/go-to`,
        method: 'POST',
        body,
      }),
      async onQueryStarted({ projectId, stackId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          cueStacksApi.util.updateQueryData('projectProgramState', projectId, (draft) => {
            draft.activeStackId = stackId
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'ProgramState', id: projectId },
        'CueStackList',
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),
  }),
  overrideExisting: false,
})

// Subscribe to WebSocket program-state changes (activate/deactivate/advance/go-to). Patches
// activeStackId directly so the playhead updates immediately in other browsers without a refetch.
lightingApi.cueStacks.subscribeToProgramState(function (event) {
  store.dispatch(
    cueStacksApi.util.updateQueryData('projectProgramState', event.projectId, (draft) => {
      draft.activeStackId = event.activeStackId
    }),
  )
})

export const {
  useProjectCueStackListQuery,
  useProjectCueStackQuery,
  useProjectProgramStateQuery,
  useCreateProjectCueStackMutation,
  useSaveProjectCueStackMutation,
  useDeleteProjectCueStackMutation,
  useReorderCueStacksMutation,
  useReorderCueStackCuesMutation,
  useAddCueToCueStackMutation,
  useActivateCueStackMutation,
  useDeactivateCueStackMutation,
  useAdvanceCueStackMutation,
  useGoToCueInStackMutation,
  useSortCueStackByCueNumberMutation,
  useActivateProgramMutation,
  useDeactivateProgramMutation,
  useAdvanceProgramMutation,
  useGoToStackMutation,
} = cueStacksApi
