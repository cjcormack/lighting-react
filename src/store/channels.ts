import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"

export const channelsApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      getChannel: build.query<number, { universe: number, channelNo: number }>({
        queryFn: ({ universe, channelNo }) => {
          const value = lightingApi.channels.get(universe, channelNo)
          return { data: value }
        },
        async onCacheEntryAdded({ universe, channelNo }, { updateCachedData, cacheEntryRemoved }) {
          const key = `${universe}:${channelNo}`

          const subscription = lightingApi.channels.subscribeToChannel(key, (value) => {
            updateCachedData(() => {
              return value
            })
          })
          await cacheEntryRemoved
          subscription.unsubscribe()
        },
      }),
      updateChannel: build.mutation<void, { universe: number, channelNo: number, value: number }>({
        queryFn: ({ universe, channelNo, value }) => {
          lightingApi.channels.update(universe, channelNo, value)
          return { data: undefined }
        },
      }),
    }
  },
})

export const { useGetChannelQuery, useUpdateChannelMutation } = channelsApi
