import {atomFamily, useRecoilState} from "recoil";
import React from "react";
import {Container, Grid, Paper, Slider, Typography} from "@mui/material";
import {syncEffect} from "recoil-sync";
import {LightingChannelsStoreKey} from "../connection";
import {number} from "@recoiljs/refine";
import {useParams} from "react-router-dom";

const channelState = atomFamily<number, string>({
  key: 'channels',
  default: 0,
  effects: param => [
    syncEffect({
      itemKey: param,
      storeKey: LightingChannelsStoreKey,
      refine: number(),
    }),
  ],
})

export const ChannelSlider = (({universe, id}: {universe: number, id: number}) => {
  const [value, setValue] = useRecoilState(channelState(`${universe}:${id}`))

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
  const {universe} = useParams()
  return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          <ChannelGroups universe={Number(universe)}/>
        </Grid>
      </Container>
  )
}

const ChannelGroups = (({universe}: { universe: number }) => {
    const channelCount = 512
    const groupSize = 8

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
                            return <ChannelSlider key={itemNo} universe={universe} id={channelNo} />
                        })
                        }
                    </Paper>
                </Grid>
            ))}
        </>
    )
})
