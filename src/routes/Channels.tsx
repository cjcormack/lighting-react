import React from "react";
import {Box, Container, Grid, Paper, Slider, TextField, Typography} from "@mui/material";
import {useParams} from "react-router-dom";
import { useGetChannelQuery, useUpdateChannelMutation } from "../store/channels"

export const ChannelSlider = (({universe, id, description}: {universe: number, id: number, description?: string}) => {
  const {
    data: maybeValue
  } = useGetChannelQuery({ universe: universe, channelNo: id });

  const value = maybeValue || 0

  const [
    runUpdateChannelMutation,
  ] = useUpdateChannelMutation()

  const setValue = (value: number) => {
    runUpdateChannelMutation({
      universe: universe,
      channelNo: id,
      value: value,
    })
  }

  const handleSliderChange = (e: Event, v: number | number[]) => {
    if (typeof v === 'number') {
      setValue(v)
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.value === '') {
      setValue(0)
    }

    const valueNumber = Number(event.target.value)
    if (isNaN(valueNumber)) { /* empty */ } else if (valueNumber < 0) {
      setValue(0)
    } else if (valueNumber > 255) {
      setValue(255)
    } else {
      setValue(valueNumber)
    }
  }

  const handleInputBlur = () => {
    if (value < 0) {
      setValue(0)
    } else if (value > 255) {
      setValue(255)
    }
  }

  return (
      <>
        <Typography id="input-slider" gutterBottom>
          {
            description ?
              `${id}: ${description}`
            :
              `Channel ${id}`
          }
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid size="grow">
            <Slider defaultValue={0} max={255} value={value} aria-label="Default" valueLabelDisplay="auto" onChange={handleSliderChange} />
          </Grid>
          <Grid size="auto">
            <TextField
                value={value}
                size="small"
                variant="outlined"
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                inputProps={{
                  min: 0,
                  max: 255,
                  'aria-labelledby': 'input-slider',
                }}
                sx={{
                  width: 62,
                }}
            />
          </Grid>
        </Grid>

      </>
  )
})
export default function Channels() {
  const {universe} = useParams()
  return (
      <Paper
          sx={{
            p: 2,
            m: 2,
            display: 'flex',
            flexDirection: 'column',
          }}>
        <Box>
          <Typography variant="h2">
            Universe {universe}
          </Typography>
          <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Grid container spacing={3}>
              <ChannelGroups universe={Number(universe)}/>
            </Grid>
          </Container>
        </Box>
      </Paper>
  )
}

const ChannelGroups = (({universe}: { universe: number }) => {
    const channelCount = 512
    const groupSize = 8

    return (
        <>
            {Array.from(Array(channelCount/groupSize)).map((g, groupNo) => (
                <Grid size={{ xs: 12, md: 6, lg: 4, xl: 3 }} key={groupNo}>
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
