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
} from "../api/groupsApi"

// WebSocket subscription for auto-invalidation
lightingApi.groups.subscribe(function () {
  store.dispatch(restApi.util.invalidateTags(['GroupList']))
})

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
  }),
  overrideExisting: false,
})

export const {
  useGroupListQuery,
  useGroupQuery,
  useDistributionStrategiesQuery,
  useGroupActiveEffectsQuery,
  useApplyGroupFxMutation,
  useClearGroupFxMutation,
} = groupsApi
