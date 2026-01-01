import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { ChannelMappingEntry } from "../api/channelMappingApi"

export const channelMappingApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      getChannelMapping: build.query<ChannelMappingEntry | undefined, { universe: number, channelNo: number }>({
        queryFn: ({ universe, channelNo }) => {
          const mapping = lightingApi.channelMapping.get(universe, channelNo)
          return { data: mapping }
        },
        async onCacheEntryAdded({ universe, channelNo }, { updateCachedData, cacheEntryRemoved }) {
          const subscription = lightingApi.channelMapping.subscribe((mappings) => {
            updateCachedData(() => {
              return mappings.get(universe)?.get(channelNo)
            })
          })
          await cacheEntryRemoved
          subscription.unsubscribe()
        },
      }),
    }
  },
  overrideExisting: false,
})

export const { useGetChannelMappingQuery } = channelMappingApi
export type { ChannelMappingEntry } from "../api/channelMappingApi"
