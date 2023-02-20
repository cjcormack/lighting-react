import {Alert} from "@mui/material";
import React, {PropsWithChildren, useEffect} from "react";
import {atom, selector, useRecoilValue, useSetRecoilState} from "recoil";
import useWebSocket, {ReadyState} from "react-use-websocket";
import {WebSocketHook} from "react-use-websocket/src/lib/types";
import {JsonValue} from "react-use-websocket/dist/lib/types";
import {ChannelsUpdater} from "./routes/Channels";

export type WsChannelUpdate = {c: {i: number, l: number}}
export type WsChannelUpdates = {channels: {id: number, currentLevel: number}[]}
type WsChannelUpdateOut = {
  channel: {
    id: number,
    level: number,
    fadeTime: number
  }
}

type WsData = WsChannelUpdate | WsChannelUpdates | WsChannelUpdateOut

export type WsMessage = {
  type: "uC" | "uT" | "channelState" | "updateChannel",
  data: WsData,
} & JsonValue

const wsAddress = "ws://" + window.location.href.split("/")[2] + "/lighting/"

export const wsState = atom<WebSocketHook<WsMessage> | undefined>({
  key: 'ws',
  default: undefined,
})

const wsReadyStateState = selector<ReadyState | undefined>({
  key: 'wsReadyState',
  get: ({get}) => {
    const ws = get(wsState)
    return ws?.readyState
  }
})

export const ConnectionStatus = (() => {
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
})

export const Connection = (({children}: PropsWithChildren) => {
  const ws = useWebSocket<WsMessage>(wsAddress, {
    share: true,
    shouldReconnect: () => true,
    reconnectInterval: 5000,
  })

  const setConnection = useSetRecoilState(wsState)

  useEffect(() => {
    setConnection(ws)
  })

  return (
      <>
        <ChannelsUpdater/>
        {children}
      </>
  )
})
