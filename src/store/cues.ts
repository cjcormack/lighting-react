import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type {
  Cue,
  CueInput,
  CopyCueRequest,
  CopyCueResponse,
  ApplyCueResponse,
  CreateCueFromStateRequest,
} from '../api/cuesApi'

// Subscribe to WebSocket cue list changes - invalidate all cue caches
lightingApi.cues.subscribe(function () {
  store.dispatch(restApi.util.invalidateTags(['CueList']))
})

export const cuesApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    projectCueList: build.query<Cue[], number>({
      query: (projectId) => `project/${projectId}/cues`,
      providesTags: (_result, _error, projectId) => [
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    projectCue: build.query<Cue, { projectId: number; cueId: number }>({
      query: ({ projectId, cueId }) => `project/${projectId}/cues/${cueId}`,
    }),

    createProjectCue: build.mutation<Cue, { projectId: number } & CueInput>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/cues`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    saveProjectCue: build.mutation<
      Cue,
      { projectId: number; cueId: number } & CueInput
    >({
      query: ({ projectId, cueId, ...body }) => ({
        url: `project/${projectId}/cues/${cueId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    deleteProjectCue: build.mutation<void, { projectId: number; cueId: number }>({
      query: ({ projectId, cueId }) => ({
        url: `project/${projectId}/cues/${cueId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    copyCue: build.mutation<
      CopyCueResponse,
      { projectId: number; cueId: number } & CopyCueRequest
    >({
      query: ({ projectId, cueId, ...body }) => ({
        url: `project/${projectId}/cues/${cueId}/copy`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { targetProjectId }) => [
        { type: 'CueList', id: targetProjectId },
      ],
    }),

    applyCue: build.mutation<
      ApplyCueResponse,
      { projectId: number; cueId: number }
    >({
      query: ({ projectId, cueId }) => ({
        url: `project/${projectId}/cues/${cueId}/apply`,
        method: 'POST',
      }),
      invalidatesTags: () => [
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    createCueFromState: build.mutation<
      Cue,
      { projectId: number } & CreateCueFromStateRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/cues/from-state`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),
  }),
  overrideExisting: false,
})

export const {
  useProjectCueListQuery,
  useProjectCueQuery,
  useCreateProjectCueMutation,
  useSaveProjectCueMutation,
  useDeleteProjectCueMutation,
  useCopyCueMutation,
  useApplyCueMutation,
  useCreateCueFromStateMutation,
} = cuesApi
