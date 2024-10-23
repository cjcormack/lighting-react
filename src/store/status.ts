import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { Status } from "../api/statusApi"

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
