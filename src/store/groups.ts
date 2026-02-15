import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"
import {
  GroupSummary,
  GroupDetail,
  ApplyFxRequest,
  ApplyFxResponse,
  ClearFxResponse,
  DistributionStrategy,
  GroupActiveEffect,
  GroupPropertyDescriptor,
  type ElementMode,
} from "../api/groupsApi"

// WebSocket subscription for auto-invalidation
lightingApi.groups.subscribe(function () {
  store.dispatch(restApi.util.invalidateTags(['GroupList']))
})

// Also invalidate GroupActiveEffects when any FX changes (shared /fx/{id} endpoints)
lightingApi.fx.subscribe(() => {
  store.dispatch(restApi.util.invalidateTags(['GroupActiveEffects']))
})

// === Types ===

export interface UpdateGroupFxRequest {
  effectType?: string
  parameters?: Record<string, string>
  beatDivision?: number
  blendMode?: string
  phaseOffset?: number
  distributionStrategy?: string
  elementMode?: ElementMode
}

export const groupsApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    // List all groups
    groupList: build.query<GroupSummary[], void>({
      query: () => 'groups',
      providesTags: ['GroupList'],
    }),

    // Get single group with members
    group: build.query<GroupDetail, string>({
      query: (name) => `groups/${encodeURIComponent(name)}`,
      providesTags: (_result, _error, name) => [{ type: 'GroupList', id: name }],
      async onCacheEntryAdded(name, { updateCachedData, cacheEntryRemoved }) {
        const subscription = lightingApi.groups.subscribeToGroup(name, (value) => {
          updateCachedData(() => value)
        })
        await cacheEntryRemoved
        subscription.unsubscribe()
      },
    }),

    // Get group properties (aggregated property descriptors for all members)
    groupProperties: build.query<GroupPropertyDescriptor[], string>({
      query: (name) => `groups/${encodeURIComponent(name)}/properties`,
      providesTags: (_result, _error, name) => [{ type: 'GroupList', id: name }],
    }),

    // Get distribution strategies
    distributionStrategies: build.query<{ strategies: DistributionStrategy[] }, void>({
      query: () => 'groups/distribution-strategies',
    }),

    // Get active effects for a group
    groupActiveEffects: build.query<GroupActiveEffect[], string>({
      query: (groupName) => `groups/${encodeURIComponent(groupName)}/fx/active`,
      providesTags: (_result, _error, groupName) => [
        { type: 'GroupActiveEffects', id: groupName },
      ],
    }),

    // Apply effect to group
    applyGroupFx: build.mutation<ApplyFxResponse, { groupName: string } & ApplyFxRequest>({
      query: ({ groupName, ...request }) => ({
        url: `groups/${encodeURIComponent(groupName)}/fx`,
        method: 'POST',
        body: request,
      }),
      invalidatesTags: (_result, _error, { groupName }) => [
        { type: 'GroupList', id: groupName },
        { type: 'GroupActiveEffects', id: groupName },
        'GroupList',
      ],
    }),

    // Clear all effects from group
    clearGroupFx: build.mutation<ClearFxResponse, string>({
      query: (groupName) => ({
        url: `groups/${encodeURIComponent(groupName)}/fx`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, groupName) => [
        { type: 'GroupList', id: groupName },
        { type: 'GroupActiveEffects', id: groupName },
        'GroupList',
      ],
    }),

    // Pause a single group effect (shared /fx/{id} endpoint)
    pauseGroupFx: build.mutation<void, { id: number; groupName: string }>({
      query: ({ id }) => ({
        url: `fx/${id}/pause`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { groupName }) => [
        { type: 'GroupActiveEffects', id: groupName },
        'FixtureEffects',
      ],
    }),

    // Resume a single group effect
    resumeGroupFx: build.mutation<void, { id: number; groupName: string }>({
      query: ({ id }) => ({
        url: `fx/${id}/resume`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { groupName }) => [
        { type: 'GroupActiveEffects', id: groupName },
        'FixtureEffects',
      ],
    }),

    // Remove a single group effect
    removeGroupFx: build.mutation<void, { id: number; groupName: string }>({
      query: ({ id }) => ({
        url: `fx/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { groupName }) => [
        { type: 'GroupActiveEffects', id: groupName },
        { type: 'GroupList', id: groupName },
        'GroupList',
        'FixtureEffects',
      ],
    }),

    // Update a single group effect
    updateGroupFx: build.mutation<void, { id: number; groupName: string; body: UpdateGroupFxRequest }>({
      query: ({ id, body }) => ({
        url: `fx/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { groupName }) => [
        { type: 'GroupActiveEffects', id: groupName },
        'FixtureEffects',
      ],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGroupListQuery,
  useGroupQuery,
  useGroupPropertiesQuery,
  useDistributionStrategiesQuery,
  useGroupActiveEffectsQuery,
  useApplyGroupFxMutation,
  useClearGroupFxMutation,
  usePauseGroupFxMutation,
  useResumeGroupFxMutation,
  useRemoveGroupFxMutation,
  useUpdateGroupFxMutation,
} = groupsApi
