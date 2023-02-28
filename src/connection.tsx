import React, {PropsWithChildren} from "react";
import {atom, DefaultValue, useRecoilValue} from "recoil";
import {ItemKey, RecoilSync, syncEffect} from "recoil-sync";
import {useLightingApi} from "./api/lightingApi";
import {Alert, Button} from "@mui/material";
import {number} from "@recoiljs/refine";
import {Status} from "./api/statusApi";

export const LightingChannelsStoreKey: string = 'lighting-channels'
export const LightingStatusStoreKey: string = 'lighting-status'
export const LightingTrackStoreKey: string = 'lighting-track'

export const LightingApiConnection: React.FC<PropsWithChildren> = ({children}) => {
  const lightingApi = useLightingApi()

  return (
      <RecoilSync
          storeKey={LightingStatusStoreKey}
          read={() => {
            return lightingApi.status.get()
          }}
          listen={({updateAllKnownItems}) => {
            const subscription = lightingApi.status.subscribe((status) => {
              updateAllKnownItems(new Map<ItemKey, DefaultValue | unknown>([['status', status]]))
            })
            return subscription.unsubscribe
          }}
      >
        <RecoilSync
            storeKey={LightingChannelsStoreKey}
            read={(itemKey) => {
              const value = lightingApi.channels.getAll().get(Number(itemKey))

              if (value === undefined) {
                return 0
              }

              return value
            }}
            write={({diff}) => {
              diff.forEach((value, channelNo) => {
                lightingApi.channels.update(Number(channelNo), Number(value))
              })
            }}
            listen={({updateItems}) => {
              const subscription = lightingApi.channels.subscribe((updates) => {
                const items = new Map<ItemKey, DefaultValue | unknown>()

                updates.forEach((value, channelNo) => {
                  items.set(channelNo.toString(), value)
                })

                updateItems(items)
              })
              return subscription.unsubscribe
            }}
        >
          <RecoilSync
              storeKey={LightingTrackStoreKey}
              read={() => {
                return lightingApi.track.get()
              }}
              listen={({updateAllKnownItems}) => {
                const subscription = lightingApi.track.subscribe((currentTrack) => {
                  updateAllKnownItems(new Map<ItemKey, DefaultValue | unknown>([['currentTrack', currentTrack]]))
                })
                return subscription.unsubscribe
              }}
          >
            {children}
          </RecoilSync>
        </RecoilSync>
      </RecoilSync>
  )
}

const statusState = atom<Status>({
  key: 'lightingApiStatus',
  effects: [
    syncEffect({
      itemKey: 'status',
      storeKey: LightingStatusStoreKey,
      refine: number(),
    }),
  ],
})

export const ConnectionStatus = (() => {
  const readyState = useRecoilValue(statusState)
  const lightingApi = useLightingApi()

  if (readyState === undefined) {
    return null
  }

  switch (readyState) {
    case Status.CONNECTING:
      return <Alert severity="warning">Connecting...</Alert>

    case Status.OPEN:
      return <Alert severity="success">Connected</Alert>

    case Status.CLOSING:
      return <Alert severity="error">Disconnecting...</Alert>

    case Status.CLOSED:
      return <>
        <Alert severity="error">Disconnected</Alert>
        <Button variant="contained" color="error" onClick={() => lightingApi.status.reconnect()}>Reconnect...</Button>
      </>

    default:
      throw new Error('Unknown ReadyState')
  }
})
