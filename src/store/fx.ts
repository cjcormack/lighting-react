import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import type { FxState } from '../api/fxApi'

export type { FxState, FxEffectState, BeatSync } from '../api/fxApi'

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

export function setBpm(bpm: number) {
  lightingApi.fx.setBpm(bpm)
}

export function tapTempo() {
  lightingApi.fx.tap()
}

export function subscribeToBeat(fn: (beat: import('../api/fxApi').BeatSync) => void) {
  return lightingApi.fx.subscribeToBeat(fn)
}
