import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"
import { Status } from "../api/statusApi"

// Invalidate all REST caches when WebSocket (re)connects, so failed
// queries from before the backend was available are retried.
let previousStatus: Status | null = null
lightingApi.status.subscribe((status) => {
  if (status === Status.OPEN && previousStatus !== Status.OPEN) {
    store.dispatch(restApi.util.invalidateTags([
      'Channel', 'Fixture', 'SceneList', 'Script', 'Project', 'ProjectList',
      'GroupList', 'GroupActiveEffects', 'FixtureEffects', 'FxPreset',
      'CueList', 'CueStackList', 'CueSlotList', 'AiConversation',
    ]))
  }
  previousStatus = status
})

export const statusApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      status: build.query<Status, void>({
        queryFn: () => {
          const value = lightingApi.status.get()
          return { data: value }
        },
        async onCacheEntryAdded(_, { updateCachedData, cacheEntryRemoved }) {
          const subscription = lightingApi.status.subscribe((value) => {
            updateCachedData(() => {
              return value
            })
          })
          await cacheEntryRemoved
          subscription.unsubscribe()
        },
      }),
      reconnect: build.mutation<void, void>({
        queryFn: () => {
          lightingApi.status.reconnect()

          return { data: undefined }
        },
      })
    }
  },
  overrideExisting: false,
})

export const { useStatusQuery, useReconnectMutation } = statusApi
