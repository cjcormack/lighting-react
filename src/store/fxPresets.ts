import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type {
  FxPreset,
  FxPresetInput,
  CopyPresetRequest,
  CopyPresetResponse,
  TogglePresetRequest,
  TogglePresetResponse,
} from '../api/fxPresetsApi'

// Subscribe to WebSocket preset list changes - invalidate all preset caches
lightingApi.fxPresets.subscribe(function () {
  store.dispatch(restApi.util.invalidateTags(['FxPreset']))
})

export const fxPresetsApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    projectPresetList: build.query<FxPreset[], number>({
      query: (projectId) => `project/${projectId}/fx-presets`,
      providesTags: (_result, _error, projectId) => [
        { type: 'FxPreset', id: projectId },
        'FxPreset',
      ],
      async onQueryStarted(projectId, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          data.forEach((preset) => {
            dispatch(
              fxPresetsApi.util.upsertQueryData(
                'projectPreset',
                { projectId, presetId: preset.id },
                preset,
              ),
            )
          })
        } catch {
          // Query failed, nothing to cache
        }
      },
    }),

    projectPreset: build.query<FxPreset, { projectId: number; presetId: number }>({
      query: ({ projectId, presetId }) => `project/${projectId}/fx-presets/${presetId}`,
    }),

    createProjectPreset: build.mutation<FxPreset, { projectId: number } & FxPresetInput>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/fx-presets`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'FxPreset', id: projectId },
        'FxPreset',
      ],
    }),

    saveProjectPreset: build.mutation<
      FxPreset,
      { projectId: number; presetId: number } & FxPresetInput
    >({
      query: ({ projectId, presetId, ...body }) => ({
        url: `project/${projectId}/fx-presets/${presetId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'FxPreset', id: projectId },
        'FxPreset',
      ],
    }),

    deleteProjectPreset: build.mutation<void, { projectId: number; presetId: number }>({
      query: ({ projectId, presetId }) => ({
        url: `project/${projectId}/fx-presets/${presetId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'FxPreset', id: projectId },
        'FxPreset',
      ],
    }),

    copyPreset: build.mutation<
      CopyPresetResponse,
      { projectId: number; presetId: number } & CopyPresetRequest
    >({
      query: ({ projectId, presetId, ...body }) => ({
        url: `project/${projectId}/fx-presets/${presetId}/copy`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { targetProjectId }) => [
        { type: 'FxPreset', id: targetProjectId },
      ],
    }),

    togglePreset: build.mutation<
      TogglePresetResponse,
      { projectId: number; presetId: number } & TogglePresetRequest
    >({
      query: ({ projectId, presetId, ...body }) => ({
        url: `project/${projectId}/fx-presets/${presetId}/toggle`,
        method: 'POST',
        body,
      }),
    }),
  }),
  overrideExisting: false,
})

export const {
  useProjectPresetListQuery,
  useProjectPresetQuery,
  useCreateProjectPresetMutation,
  useSaveProjectPresetMutation,
  useDeleteProjectPresetMutation,
  useCopyPresetMutation,
  useTogglePresetMutation,
} = fxPresetsApi
