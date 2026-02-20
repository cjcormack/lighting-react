import { useMemo } from 'react'
import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import { useFxStateQuery } from './fx'
import type {
  Cue,
  CueInput,
  CopyCueRequest,
  CopyCueResponse,
  ApplyCueResponse,
  StopCueResponse,
  CueCurrentState,
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
      { projectId: number; cueId: number; replaceAll?: boolean }
    >({
      query: ({ projectId, cueId, replaceAll }) => ({
        url: `project/${projectId}/cues/${cueId}/apply${replaceAll ? '?replaceAll=true' : ''}`,
        method: 'POST',
      }),
      invalidatesTags: () => [
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    stopCue: build.mutation<
      StopCueResponse,
      { projectId: number; cueId: number }
    >({
      query: ({ projectId, cueId }) => ({
        url: `project/${projectId}/cues/${cueId}/stop`,
        method: 'POST',
      }),
      invalidatesTags: () => [
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    currentCueState: build.query<CueCurrentState, number>({
      query: (projectId) => `project/${projectId}/cues/current-state`,
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
  useStopCueMutation,
  useLazyCurrentCueStateQuery,
} = cuesApi

/** Derive active cue IDs from the real-time FxState WebSocket stream. */
export function useActiveCueIds(): Set<number> {
  const { data: fxState } = useFxStateQuery()
  return useMemo(() => {
    const ids = new Set<number>()
    for (const effect of fxState?.activeEffects ?? []) {
      if (effect.cueId != null) ids.add(effect.cueId)
    }
    return ids
  }, [fxState])
}

/** Derive active cue stack IDs from the real-time FxState WebSocket stream. */
export function useActiveCueStackIds(): Set<number> {
  const { data: fxState } = useFxStateQuery()
  return useMemo(() => {
    const ids = new Set<number>()
    for (const effect of fxState?.activeEffects ?? []) {
      if (effect.cueStackId != null) ids.add(effect.cueStackId)
    }
    return ids
  }, [fxState])
}
