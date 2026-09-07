import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import type { CueTarget } from '../api/cuesApi'

/**
 * The desk selection — see `api/selectionApi.ts` for what it is and why it is server-owned.
 *
 * A cache entry rather than a hook's `useState`, following `speedMasterLive` and the four surface
 * streams: two components reading one stream then share a subscription and RTK Query owns the
 * teardown. There is no REST endpoint behind it and nothing to invalidate — the frame is the only
 * source — so `queryFn` seeds from the WS layer's own snapshot and everything after arrives by
 * push.
 *
 * The project is not part of the key. The backend keeps one selection and clears it on project
 * switch, so a per-project cache entry would be a second, disagreeing answer to which selection is
 * current.
 */

/** What the selection is before its first frame, and after a clear — one identity, every reader. */
const NO_TARGETS: CueTarget[] = []

export const selectionApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    deskSelection: build.query<CueTarget[], void>({
      queryFn: () => ({ data: lightingApi.selection.getState() ?? NO_TARGETS }),
      async onCacheEntryAdded(_, { cacheDataLoaded, updateCachedData, cacheEntryRemoved }) {
        await cacheDataLoaded
        const subscription = lightingApi.selection.subscribe((targets) => {
          updateCachedData(() => targets)
        })
        await cacheEntryRemoved
        subscription.unsubscribe()
      },
    }),
  }),
  overrideExisting: false,
})

export const { useDeskSelectionQuery } = selectionApi

/** The desk selection, in the order targets were added. */
export function useDeskSelection(): CueTarget[] {
  const { data } = useDeskSelectionQuery()
  return data ?? NO_TARGETS
}

/**
 * Empty the desk selection.
 *
 * The one selection *write* this pass carries, and deliberately: it is a single gesture with no
 * mapping to get wrong, where the two-way wiring session 3b adds — `useBuskingSelection` over this
 * cache, and the programmer list's publish through `rowLocateTarget` — is where a lossy conversion
 * would be silent.
 */
export function clearDeskSelection(): void {
  lightingApi.selection.clear()
}
