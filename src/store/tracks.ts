import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { TrackDetails } from "../api/trackApi"

export const tracksApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      currentTrack: build.query<TrackDetails, void>({
        queryFn: () => {
          const value = lightingApi.track.get()
          return { data: value }
        },
        async onCacheEntryAdded(_, { updateCachedData, cacheEntryRemoved }) {
          const subscription = lightingApi.track.subscribe((value) => {
            updateCachedData(() => {
              return value
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

export const { useCurrentTrackQuery } = tracksApi
