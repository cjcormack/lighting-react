import {atom, DefaultValue, selectorFamily, useRecoilState, useRecoilValue} from "recoil";
import React, {PropsWithChildren, useEffect} from "react";
import {WsChannelUpdate, WsChannelUpdates, WsMessage, wsState} from "../connection";
import {Box, Container, Grid, Paper, Slider} from "@mui/material";
import {ReadyState} from "react-use-websocket";

const channelsState = atom<Map<number, number>>({
  key: 'channels',
  default: new Map(),
  effects: [
    ({getPromise, onSet}) => {
      onSet((newValues, oldValues) => {
        return getPromise(wsState).then((ws) => {
          if (ws === undefined || ws.readyState !== ReadyState.OPEN) {
            return
          }

          if ((oldValues instanceof DefaultValue)) {
            return
          }

          newValues.forEach((newValue, id) => {
            const oldValue = oldValues.get(id)
            if (oldValue !== newValue) {
              const payload: WsMessage = {
                type: "updateChannel",
                data: {channel: {id: id, level: newValue, fadeTime: 0}}
              }
              ws.sendJsonMessage(payload)
            }
          })
        })
      })
    },
  ],
})

const channelState = selectorFamily<number, number>({
  key: 'channel',
  get: (id) => ({get}) => {
    const value = get(channelsState).get(id)
    if (value === undefined) {
      return 0
    }
    return value
  },
  set: (id) => ({get, set}, newValue) => {
    if ((newValue instanceof DefaultValue)) {
      return
    }
    const updatedMap = new Map(get(channelsState))
    updatedMap.set(id, newValue)
    set(channelsState, updatedMap)
  },
})

export const ChannelsUpdater = (({children}: PropsWithChildren) => {
  const ws = useRecoilValue(wsState)
  const readyState = ws?.readyState
  const sendJsonMessage = ws?.sendJsonMessage
  const lastJsonMessage = ws?.lastJsonMessage

  const [channels, setChannels] = useRecoilState(channelsState)

  useEffect(() => {
    if (lastJsonMessage === undefined || lastJsonMessage === null) {
      return
    }

    const updatedMap = new Map(channels)

    if (lastJsonMessage.type === 'uC') {
      const data = lastJsonMessage.data as WsChannelUpdate
      updatedMap.set(data.c.i, data.c.l)
    } else if (lastJsonMessage.type === 'channelState') {
      const data = lastJsonMessage.data as WsChannelUpdates

      data.channels.forEach((value) => {
        updatedMap.set(value.id, value.currentLevel)
      })
    }
    setChannels(updatedMap)
  }, [lastJsonMessage/*, channels, setChannels*/])
  // TODO work how to prevent infinite loop wnen channels, setChannels supplied as deps

  useEffect(() => {
    if (readyState === undefined || sendJsonMessage === undefined) {
      return
    }
    if (readyState === ReadyState.OPEN) {
      sendJsonMessage({type: 'channelState'})
    }
  }, [readyState, sendJsonMessage])

  return (
      <>
        {children}
      </>
  )
})

export const ChannelTest = (({id}: {id: number}) => {
  const [value, setValue] = useRecoilState(channelState(id))

  return (
      <Slider defaultValue={0} max={255} value={value} aria-label="Default" valueLabelDisplay="auto" onChange={(e, v) => {
        if (typeof v === 'number') {
          setValue(v)
        }
      }} />
  )
})
export default function Channels() {
  return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          <ChannelGroups/>
        </Grid>
      </Container>
  )
}

function ChannelsB() {
  return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          {/* Chart */}
          <Grid item xs={12} md={8} lg={9}>
            <Paper
                sx={{
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  height: 240,
                }}
            >
              {/*<Chart />*/}
            </Paper>
          </Grid>
          {/* Recent Deposits */}
          <Grid item xs={12} md={4} lg={3}>
            <Paper
                sx={{
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  height: 240,
                }}
            >
              {/*<Deposits />*/}
            </Paper>
          </Grid>
          {/* Recent Orders */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
              {/*<Orders />*/}
            </Paper>
          </Grid>
        </Grid>
      </Container>
  )
}

function ChannelsA() {
  return (
      <Grid container spacing={2} columns={16}>
        <Grid xs={4}>
          <ChannelTest id={1} />
          <ChannelTest id={2} />
          <ChannelTest id={3} />
          <ChannelTest id={4} />
        </Grid>
        <Grid xs={4}>
          <ChannelTest id={5} />
          <ChannelTest id={6} />
          <ChannelTest id={7} />
          <ChannelTest id={8} />
        </Grid>
        <Grid xs={4}>
          <ChannelTest id={1} />
          <ChannelTest id={2} />
          <ChannelTest id={3} />
          <ChannelTest id={4} />
        </Grid>
        <Grid xs={4}>
          <ChannelTest id={5} />
          <ChannelTest id={6} />
          <ChannelTest id={7} />
          <ChannelTest id={8} />
        </Grid>
      </Grid>
  )
}

const ChannelGroups = (() => {
  new Array(64).fill(1,0, 64).map((_, k) => {

  })

  return (
      <>
        <Grid item xs={12} md={4} lg={3}>
          <Paper
              sx={{
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                height: 240,
              }}
          >
          </Paper>
        </Grid>
      </>
  )
})
