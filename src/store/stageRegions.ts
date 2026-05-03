import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"
import type {
  StageRegionDto,
  CreateStageRegionRequest,
  UpdateStageRegionRequest,
} from "../api/stageRegionApi"

lightingApi.stageRegions.subscribe(() => {
  store.dispatch(restApi.util.invalidateTags(['StageRegion']))
})

export const stageRegionsApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    stageRegionList: build.query<StageRegionDto[], number>({
      query: (projectId) => `project/${projectId}/stageRegions`,
      providesTags: ['StageRegion'],
    }),

    createStageRegion: build.mutation<StageRegionDto, { projectId: number } & CreateStageRegionRequest>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/stageRegions`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['StageRegion'],
    }),

    updateStageRegion: build.mutation<StageRegionDto, { projectId: number; regionId: number } & UpdateStageRegionRequest>({
      query: ({ projectId, regionId, ...body }) => ({
        url: `project/${projectId}/stageRegions/${regionId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['StageRegion'],
    }),

    deleteStageRegion: build.mutation<void, { projectId: number; regionId: number }>({
      query: ({ projectId, regionId }) => ({
        url: `project/${projectId}/stageRegions/${regionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['StageRegion'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useStageRegionListQuery,
  useCreateStageRegionMutation,
  useUpdateStageRegionMutation,
  useDeleteStageRegionMutation,
} = stageRegionsApi
