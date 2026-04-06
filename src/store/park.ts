import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"

export interface ParkState {
  universe: number
  channel: number
  value: number
}

export const parkApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      /**
       * Query whether a specific channel is parked, and its parked value.
       * Returns the parked value (number) or undefined if not parked.
       */
      getChannelParkState: build.query<number | undefined, { universe: number; channelNo: number }>({
        queryFn: ({ universe, channelNo }) => {
          const value = lightingApi.park.getParkedValue(universe, channelNo)
          return { data: value }
        },
        async onCacheEntryAdded({ universe, channelNo }, { updateCachedData, cacheEntryRemoved }) {
          const key = `${universe}:${channelNo}`

          const subscription = lightingApi.park.subscribeToChannel(key, (value) => {
            updateCachedData(() => value)
          })
          await cacheEntryRemoved
          subscription.unsubscribe()
        },
      }),

      /**
       * Query all parked channels as a flat list.
       */
      getParkStateList: build.query<ParkState[], void>({
        queryFn: () => {
          const all = lightingApi.park.getAll()
          const list: ParkState[] = []
          all.forEach((value, key) => {
            const [universe, channel] = key.split(":").map(Number)
            list.push({ universe, channel, value })
          })
          return { data: list }
        },
        async onCacheEntryAdded(_, { updateCachedData, cacheEntryRemoved }) {
          const subscription = lightingApi.park.subscribe((parked) => {
            const list: ParkState[] = []
            parked.forEach((value, key) => {
              const [universe, channel] = key.split(":").map(Number)
              list.push({ universe, channel, value })
            })
            updateCachedData(() => list)
          })
          await cacheEntryRemoved
          subscription.unsubscribe()
        },
      }),

      parkChannel: build.mutation<void, { universe: number; channelNo: number; value: number }>({
        queryFn: ({ universe, channelNo, value }) => {
          lightingApi.park.park(universe, channelNo, value)
          return { data: undefined }
        },
      }),

      unparkChannel: build.mutation<void, { universe: number; channelNo: number }>({
        queryFn: ({ universe, channelNo }) => {
          lightingApi.park.unpark(universe, channelNo)
          return { data: undefined }
        },
      }),

      unparkAll: build.mutation<void, void>({
        queryFn: () => {
          lightingApi.park.unparkAll()
          return { data: undefined }
        },
      }),
    }
  },
  overrideExisting: false,
})

export const {
  useGetChannelParkStateQuery,
  useGetParkStateListQuery,
  useParkChannelMutation,
  useUnparkChannelMutation,
  useUnparkAllMutation,
} = parkApi
