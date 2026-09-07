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
 * The three writes, as plain functions rather than hooks.
 *
 * There is nothing to subscribe to and no cache to patch optimistically: `selection.state` is the
 * acknowledgement, so a write is a socket send and the frame that comes back is what moves every
 * reader. A `useX` wrapper would only be a stable identity around `lightingApi`, which is already
 * a module singleton.
 *
 * [toggleDeskSelection] is **not** "add if absent, remove if present". The desk narrows a partly
 * covered group head by head (D2, through `fx/TargetCoverage`), so pressing a fixture that a
 * selected group already covers takes that one head *out of the group's coverage* rather than
 * adding a duplicate entry. That is the behaviour a select button on the surface has, and the
 * reason the busk band's toggle goes through here rather than keeping its own Map.
 */
export function setDeskSelection(targets: readonly CueTarget[]): void {
  lightingApi.selection.set([...targets])
}

export function toggleDeskSelection(target: CueTarget): void {
  lightingApi.selection.toggle(target)
}

export function clearDeskSelection(): void {
  lightingApi.selection.clear()
}
