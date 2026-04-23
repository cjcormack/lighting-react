import { useEffect, useState } from "react"
import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"
import type {
  ControlSurfaceBinding,
  ControlSurfaceType,
  CreateSurfaceBindingRequest,
  UpdateSurfaceBindingRequest,
  SurfaceDeviceInfo,
  PickupChange,
  ScalerState,
} from "../api/surfacesApi"

export type {
  ControlSurfaceBinding,
  ControlSurfaceType,
  CreateSurfaceBindingRequest,
  UpdateSurfaceBindingRequest,
  SurfaceDeviceInfo,
  PickupChange,
  ScalerState,
  BindingTarget,
  FixturePropertyTarget,
  GroupPropertyTarget,
  CueStackGoTarget,
  CueStackBackTarget,
  CueStackPauseTarget,
  FireCueTarget,
  FlashTarget,
  BlackoutTarget,
  GrandMasterToggleTarget,
  SetBankTarget,
  ControlDescriptor,
  FaderControl,
  EncoderControl,
  ButtonControl,
  BankButtonControl,
  BankDefinition,
  TakeoverPolicy,
  LearnEvent,
  BindingHealth,
} from "../api/surfacesApi"

lightingApi.surfaces.subscribeBindingsChanged((event) => {
  store.dispatch(
    restApi.util.invalidateTags([{ type: 'SurfaceBinding', id: event.projectId }]),
  )
})

export const surfacesApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    // All known device-family profiles (not attached instances — see useSurfaceDevices hook).
    controlSurfaceTypeList: build.query<ControlSurfaceType[], void>({
      query: () => 'controlSurfaceTypes',
      providesTags: ['ControlSurfaceType'],
    }),

    // All bindings for a project.
    surfaceBindings: build.query<ControlSurfaceBinding[], number>({
      query: (projectId) => `project/${projectId}/surfaceBindings`,
      providesTags: (_result, _error, projectId) => [
        { type: 'SurfaceBinding', id: projectId },
      ],
    }),

    createSurfaceBinding: build.mutation<
      ControlSurfaceBinding,
      { projectId: number } & CreateSurfaceBindingRequest
    >({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/surfaceBindings`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'SurfaceBinding', id: projectId },
      ],
    }),

    updateSurfaceBinding: build.mutation<
      ControlSurfaceBinding,
      { projectId: number; bindingId: number } & UpdateSurfaceBindingRequest
    >({
      query: ({ projectId, bindingId, ...body }) => ({
        url: `project/${projectId}/surfaceBindings/${bindingId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'SurfaceBinding', id: projectId },
      ],
    }),

    deleteSurfaceBinding: build.mutation<
      void,
      { projectId: number; bindingId: number }
    >({
      query: ({ projectId, bindingId }) => ({
        url: `project/${projectId}/surfaceBindings/${bindingId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'SurfaceBinding', id: projectId },
      ],
    }),
  }),
  overrideExisting: false,
})

export const {
  useControlSurfaceTypeListQuery,
  useSurfaceBindingsQuery,
  useCreateSurfaceBindingMutation,
  useUpdateSurfaceBindingMutation,
  useDeleteSurfaceBindingMutation,
} = surfacesApi

// WS-driven live state. `subscribeXxx` on the WS API replays the last cached
// snapshot synchronously on subscribe, so we don't need to `requestXxxState`
// at mount — the initial snapshot arrives from the `open` handler.

/** Attached MIDI devices (both matched and unmatched). */
export function useSurfaceDevices(): SurfaceDeviceInfo[] {
  const [devices, setDevices] = useState<SurfaceDeviceInfo[]>([])
  useEffect(() => {
    const sub = lightingApi.surfaces.subscribeDevices(setDevices)
    return () => sub.unsubscribe()
  }, [])
  return devices
}

/** Active bank per `deviceTypeKey`. */
export function useActiveBanks(): Record<string, string> {
  const [banks, setBanks] = useState<Record<string, string>>({})
  useEffect(() => {
    const sub = lightingApi.surfaces.subscribeBanks(setBanks)
    return () => sub.unsubscribe()
  }, [])
  return banks
}

/** Per-`(displayKey, controlId)` soft-takeover state. */
export function usePickupStates(): Map<string, PickupChange> {
  const [pickups, setPickups] = useState<Map<string, PickupChange>>(new Map())
  useEffect(() => {
    const sub = lightingApi.surfaces.subscribePickup((change) => {
      setPickups((prev) => {
        const next = new Map(prev)
        const key = `${change.displayKey}|${change.controlId}`
        if (change.state === 'ENGAGED') next.delete(key)
        else next.set(key, change)
        return next
      })
    })
    return () => sub.unsubscribe()
  }, [])
  return pickups
}

/** Global blackout / grand-master state. */
export function useScalerState(): ScalerState {
  const [scaler, setScaler] = useState<ScalerState>({
    blackoutEnabled: false,
    grandMasterEnabled: true,
  })
  useEffect(() => {
    const sub = lightingApi.surfaces.subscribeScaler(setScaler)
    return () => sub.unsubscribe()
  }, [])
  return scaler
}
