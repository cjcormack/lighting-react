import {atom, DefaultValue, selectorFamily, useRecoilState, useRecoilValue} from "recoil";
import React, {PropsWithChildren, useEffect} from "react";
import {WsChannelUpdate, WsChannelUpdates, WsMessage, wsState} from "../connection";
import {Container, Grid, Paper, Slider, Typography} from "@mui/material";
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

export const ChannelSlider = (({id}: {id: number}) => {
  const [value, setValue] = useRecoilState(channelState(id))

  return (
      <>
        <Typography id="input-slider" gutterBottom>
          Channel {id}
        </Typography>
        <Slider defaultValue={0} max={255} value={value} aria-label="Default" valueLabelDisplay="auto" onChange={(e, v) => {
          if (typeof v === 'number') {
            setValue(v)
          }
        }} />
      </>
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

const ChannelGroups = (() => {
    const channelCount = 512;
    const groupSize = 8;

    return (
        <>
            {Array.from(Array(channelCount/groupSize)).map((g, groupNo) => (
                <Grid item xs={12} md={4} lg={3} key={groupNo}>
                    <Paper
                        sx={{
                            p: 2,
                            display: 'flex',
                            flexDirection: 'column',
                    }}>
                        {Array.from(Array(groupSize)).map((s, itemNo) => {
                            const channelNo = groupNo*groupSize + itemNo + 1
                            return <ChannelSlider key={itemNo} id={channelNo} />
                        })
                        }
                    </Paper>
                </Grid>
            ))}
        </>
    )
})
