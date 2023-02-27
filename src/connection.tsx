import React, {PropsWithChildren} from "react";
import {DefaultValue} from "recoil";
import {ItemKey, RecoilSync, UpdateItems} from "recoil-sync";
import {createLightingApi} from "./lightingApi";
import {Simulate} from "react-dom/test-utils";
import change = Simulate.change;

export const LightingApiStoreKey: string = "lighting-channels"

export const LightingApiConnection: React.FC<PropsWithChildren> = ({children}) => {
  const lightingApi = createLightingApi()

  return (
      <RecoilSync
          storeKey={LightingApiStoreKey}
          read={(itemKey) => {
            const value = lightingApi.channels.currentValues().get(Number(itemKey))

            if (value === undefined) {
              return 0
            }

            return value
          }}
          write={({diff}) => {
            diff.forEach((value, channelNo) => {
              lightingApi.channels.updateValue(Number(channelNo), Number(value))
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
        {children}
      </RecoilSync>
  )
}

/*export const ConnectionStatus = (() => {
  const readyState = useRecoilValue(wsReadyStateState)
  if (readyState === undefined) {
    return null
  }

  switch (readyState) {
    case ReadyState.UNINSTANTIATED:
      return <Alert severity="warning">Uninitialised</Alert>

    case ReadyState.CONNECTING:
      return <Alert severity="warning">Connecting...</Alert>

    case ReadyState.OPEN:
      return <Alert severity="success">Connected</Alert>

    case ReadyState.CLOSING:
      return <Alert severity="error">Disconnecting...</Alert>

    case ReadyState.CLOSED:
      return <Alert severity="error">Disconnected</Alert>

    default:
      throw new Error('Unknown ReadyState')
  }
})*/
