import {atomFamily, useRecoilState} from "recoil";
import React from "react";
import {Container, Grid, Paper, Slider, Typography} from "@mui/material";
import {syncEffect} from "recoil-sync";
import {LightingChannelsStoreKey} from "../connection";
import {number} from "@recoiljs/refine";

const channelState = atomFamily<number, number>({
  key: 'channels',
  default: 0,
  effects: param => [
    syncEffect({
      itemKey: param.toString(),
      storeKey: LightingChannelsStoreKey,
      refine: number(),
    }),
  ],
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
                            return <ChannelSlider key={itemNo} id={channelNo} />
                        })
                        }
                    </Paper>
                </Grid>
            ))}
        </>
    )
})
