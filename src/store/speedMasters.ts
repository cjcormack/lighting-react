import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type { SpeedMasterBeat, SpeedMasterLiveState } from '../api/speedMastersWsApi'
import type {
  CreateSpeedMasterRequest,
  SpeedMaster,
  UpdateSpeedMasterRequest,
} from '../api/speedMastersApi'

// Master CRUD happens on other tabs and other surfaces too, so the WS notification is the
// invalidation signal rather than relying on this tab having made the change itself.
// (Live BPM deliberately does NOT go through invalidation — see speedMasterLive below.)
lightingApi.speedMasters.subscribeList(function () {
  store.dispatch(restApi.util.invalidateTags(['SpeedMaster', 'SpeedMasterList']))
})

export const speedMastersApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    speedMasterList: build.query<SpeedMaster[], { projectId: number }>({
      query: ({ projectId }) => `project/${projectId}/speed-masters`,
      providesTags: (_result, _error, { projectId }) => [
        { type: 'SpeedMasterList', id: projectId },
        'SpeedMasterList',
      ],
    }),

    createSpeedMaster: build.mutation<
      SpeedMaster,
      { projectId: number } & CreateSpeedMasterRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/speed-masters`,
        method: 'POST',
        body,
      }),
      // Guarded on the result: a duplicate name is a 409 and nothing moved.
      invalidatesTags: (result) => (result == null ? [] : ['SpeedMasterList']),
    }),

    saveSpeedMaster: build.mutation<
      SpeedMaster,
      { projectId: number; masterId: number } & UpdateSpeedMasterRequest
    >({
      query: ({ projectId, masterId, ...body }) => ({
        url: `project/${projectId}/speed-masters/${masterId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (result, _error, { masterId }) =>
        result == null ? [] : [{ type: 'SpeedMaster', id: masterId }, 'SpeedMasterList'],
    }),

    deleteSpeedMaster: build.mutation<
      void,
      { projectId: number; masterId: number; force?: boolean }
    >({
      query: ({ projectId, masterId, force }) => ({
        url: `project/${projectId}/speed-masters/${masterId}${force ? '?force=true' : ''}`,
        method: 'DELETE',
      }),
      // The 409s (protected master 1, master in use) are ordinary parts of the flow —
      // nothing moved, so nothing refetches.
      invalidatesTags: (_result, error) => (error ? [] : ['SpeedMasterList']),
    }),

    /**
     * The live bank, patched from `speedMasters.state` / `speedMasters.changed` pushes.
     * This is what the masters strip renders — BPM at tap rate, never via invalidation.
     */
    speedMasterLive: build.query<SpeedMasterLiveState[], void>({
      queryFn: () => ({ data: lightingApi.speedMasters.getState() }),
      async onCacheEntryAdded(_, { updateCachedData, cacheEntryRemoved }) {
        const subscription = lightingApi.speedMasters.subscribe((masters) => {
          updateCachedData((draft) => {
            // Field-wise writes rather than replacing the array: RTK Query's Immer draft
            // only notices structural changes, so a push that moved one master's bpm
            // re-renders without invalidating every tile's identity.
            draft.length = masters.length
            masters.forEach((master, i) => {
              const existing = draft[i]
              if (
                existing == null ||
                existing.uuid !== master.uuid ||
                existing.index !== master.index
              ) {
                draft[i] = master
                return
              }
              existing.name = master.name
              existing.bpm = master.bpm
              existing.isRunning = master.isRunning
              existing.source = master.source
            })
          })
        })
        await cacheEntryRemoved
        subscription.unsubscribe()
      },
    }),
  }),
  overrideExisting: false,
})

/**
 * Resolve an effect's speed-master reference for display, or null when nothing should
 * render: a null/unknown reference and an explicit master-1 pin all behave as master 1 at
 * apply time, and M1 is the silent default everywhere in the UI.
 *
 * This is THE shared home for that rule (the chip, the FX sheet, and anything else showing
 * a master label go through it), and it subscribes via `selectFromResult` so a consumer
 * re-renders only when *its own* master's entry changes — not on every tap of every master,
 * which matters when dozens of effect rows each mount one of these.
 */
export function useSpeedMasterDisplay(speedMasterUuid: string | null | undefined) {
  const { master } = useSpeedMasterLiveQuery(undefined, {
    selectFromResult: ({ data }) => ({
      master: speedMasterUuid ? data?.find((m) => m.uuid === speedMasterUuid) : undefined,
    }),
  })
  return master && master.index !== 1 ? master : null
}

/**
 * Master 1's uuid, or null before the first live frame.
 *
 * Needed because the read streams and the write messages address master 1 differently: a null
 * uuid *writes* to master 1, but `speedMasters.beat` tags master 1's frames with its real uuid
 * once the bank has loaded (`SpeedMasterBank.emitBeat`), and null only for the synthetic
 * pre-load master. So anything *subscribing* on master 1's behalf has to resolve the real one
 * — subscribing with null would silently never match a frame. Null while unresolved is exactly
 * right: that is the pre-load master 1, which really does emit null.
 *
 * `selectFromResult` like [useSpeedMasterDisplay], so a consumer re-renders only when master
 * 1's identity moves rather than on every tap of every master.
 */
export function useMaster1Uuid(): string | null {
  const { uuid } = useSpeedMasterLiveQuery(undefined, {
    selectFromResult: ({ data }) => ({
      uuid: data?.find((m) => m.index === 1)?.uuid ?? null,
    }),
  })
  return uuid
}

/** Set one master's live BPM over WS (null uuid → master 1). */
export function setSpeedMasterBpm(masterUuid: string | null, bpm: number) {
  lightingApi.speedMasters.setBpm(masterUuid, bpm)
}

/** Tap one master's tempo over WS (null uuid → master 1). */
export function tapSpeedMaster(masterUuid: string | null) {
  lightingApi.speedMasters.tap(masterUuid)
}

/**
 * Subscribe to one master's beat boundaries (null uuid → master 1). Frames are throttled
 * server-side, so callers interpolate locally between them — see `BeatIndicator`.
 */
export function subscribeToSpeedMasterBeat(
  masterUuid: string | null,
  fn: (beat: SpeedMasterBeat) => void,
) {
  return lightingApi.speedMasters.subscribeBeat(masterUuid, fn)
}

/**
 * Ask for one immediate beat frame for a master already subscribed to. For recovering from a
 * stale local timer without re-subscribing — see `BeatIndicator`'s visibility handler.
 */
export function requestSpeedMasterBeat(masterUuid: string | null) {
  lightingApi.speedMasters.requestBeat(masterUuid)
}

export const {
  useSpeedMasterListQuery,
  useCreateSpeedMasterMutation,
  useSaveSpeedMasterMutation,
  useDeleteSpeedMasterMutation,
  useSpeedMasterLiveQuery,
} = speedMastersApi
