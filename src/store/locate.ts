import { restApi } from "./restApi"

// === Types ===

export type LocateTargetType = 'fixture' | 'group'

export interface LocateTarget {
  type: LocateTargetType
  key: string
}

export interface LocateState {
  targets: LocateTarget[]
}

export interface ToggleLocateResponse {
  active: boolean
  writeCount: number
  effectsRemoved: number
}

// === API ===

export const locateApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    /** All currently-located fixtures and groups. */
    locateState: build.query<LocateState, void>({
      query: () => 'locate',
      providesTags: ['Locate'],
    }),

    /**
     * Toggle locate for a fixture or group. Locate-on removes running effects on the
     * target, but the effects tags are NOT invalidated here — the FX WebSocket
     * subscriptions in fixtureFx.ts / groups.ts already invalidate them when the
     * engine broadcasts the removal, and a bare tag here would refetch every
     * per-fixture effects query on each toggle.
     */
    toggleLocate: build.mutation<ToggleLocateResponse, LocateTarget>({
      query: (body) => ({
        url: 'locate/toggle',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Locate'],
    }),
  }),
  overrideExisting: false,
})

export const { useLocateStateQuery, useToggleLocateMutation } = locateApi
