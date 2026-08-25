import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import type { FxState } from '../api/fxApi'

export type { FxState, FxEffectState } from '../api/fxApi'

export const fxApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    fxState: build.query<FxState, void>({
      queryFn: () => {
        return { data: lightingApi.fx.get() }
      },
      async onCacheEntryAdded(_, { updateCachedData, cacheEntryRemoved }) {
        const subscription = lightingApi.fx.subscribe((state) => {
          updateCachedData(() => state)
        })
        await cacheEntryRemoved
        subscription.unsubscribe()
      },
    }),
  }),
  overrideExisting: false,
})

export const { useFxStateQuery } = fxApi

// Tempo used to live here too (`setBpm`, `tapTempo`, `subscribeToBeat`, `requestBeatSync`,
// over the unkeyed master-1 messages). It is all in `store/speedMasters.ts` now, keyed per
// master; this module is the effect list only.
