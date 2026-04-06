import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"
import type {
  FixturePatch,
  UniverseConfig,
  CreatePatchRequest,
  UpdatePatchRequest,
  PatchGroup,
  PatchGroupDetail,
  UpdatePatchGroupRequest,
} from "../api/patchApi"

// Subscribe to WebSocket patch changes
lightingApi.patches.subscribe(() => {
  store.dispatch(restApi.util.invalidateTags(['Patch', 'UniverseConfig']))
})

export const patchesApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    // List patches for a project
    patchList: build.query<FixturePatch[], number>({
      query: (projectId) => `project/${projectId}/patches`,
      providesTags: ['Patch'],
    }),

    // Create a single patch
    createPatch: build.mutation<FixturePatch, { projectId: number } & CreatePatchRequest>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/patches`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Patch', 'UniverseConfig', 'Fixture'],
    }),

    // Update a patch
    updatePatch: build.mutation<FixturePatch, { projectId: number; patchId: number } & UpdatePatchRequest>({
      query: ({ projectId, patchId, ...body }) => ({
        url: `project/${projectId}/patches/${patchId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Patch', 'Fixture'],
    }),

    // Delete a patch
    deletePatch: build.mutation<void, { projectId: number; patchId: number }>({
      query: ({ projectId, patchId }) => ({
        url: `project/${projectId}/patches/${patchId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Patch', 'Fixture'],
    }),

    // List universe configs for a project
    universeConfigList: build.query<UniverseConfig[], number>({
      query: (projectId) => `project/${projectId}/universe-configs`,
      providesTags: ['UniverseConfig'],
    }),

    // List patch groups for a project
    patchGroupList: build.query<PatchGroup[], number>({
      query: (projectId) => `project/${projectId}/patch-groups`,
      providesTags: ['Patch'],
    }),

    // Get patch group detail (with ordered members)
    patchGroupDetail: build.query<PatchGroupDetail, { projectId: number; groupId: number }>({
      query: ({ projectId, groupId }) => `project/${projectId}/patch-groups/${groupId}`,
      providesTags: ['Patch'],
    }),

    // Update patch group (rename, reorder)
    updatePatchGroup: build.mutation<PatchGroupDetail, { projectId: number; groupId: number } & UpdatePatchGroupRequest>({
      query: ({ projectId, groupId, ...body }) => ({
        url: `project/${projectId}/patch-groups/${groupId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Patch', 'Fixture'],
    }),

    // Delete patch group
    deletePatchGroup: build.mutation<void, { projectId: number; groupId: number }>({
      query: ({ projectId, groupId }) => ({
        url: `project/${projectId}/patch-groups/${groupId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Patch', 'Fixture'],
    }),
  }),
  overrideExisting: false,
})

export const {
  usePatchListQuery,
  useCreatePatchMutation,
  useUpdatePatchMutation,
  useDeletePatchMutation,
  useUniverseConfigListQuery,
  usePatchGroupListQuery,
  usePatchGroupDetailQuery,
  useUpdatePatchGroupMutation,
  useDeletePatchGroupMutation,
} = patchesApi
