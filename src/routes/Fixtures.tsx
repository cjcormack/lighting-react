import {
  Box,
  Container,
  Grid,
  Paper, Tab, Tabs,
  Typography
} from "@mui/material";
import React, {Suspense} from "react";
import {ChannelSlider} from "./Channels";
import { Fixture, useFixtureListQuery } from "../store/fixtures"

export function Fixtures() {
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
            Fixtures
          </Typography>
          <Suspense fallback={'Loading...'}>
            <FixturesContainer/>
          </Suspense>
        </Box>
      </Paper>
  )
}

function FixturesContainer() {
  const {
    data: maybeFixtureList,
    isLoading,
    isFetching
  } = useFixtureListQuery()

  const fixtureList = maybeFixtureList || []

  if (isLoading || isFetching) {
    return (
      <>Loading...</>
    )
  }

  return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          {fixtureList.map((fixture) => (
            <FixtureCard fixture={fixture} key={fixture.key}/>
          ))}
        </Grid>
      </Container>
  )
}

const FixtureCard = ({fixture}: {fixture: Fixture}) => {
  const [value, setValue] = React.useState(0)

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
      <Grid item xs={12} md={6} lg={4} xl={3}>
        <Paper
            sx={{
              p: 2,
              display: 'flex',
              flexDirection: 'column',
        }}>
          <Typography gutterBottom variant="h5" component="div">
            {fixture.name}
          </Typography>
          <Box sx={{ width: '100%' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={value} onChange={handleChange} aria-label="basic tabs example">
                <Tab label="Sliders" />
              </Tabs>
            </Box>
            {
              value === 0 && (
                    <Container
                        sx={{
                          p: 2,
                          display: 'flex',
                          flexDirection: 'column',
                        }}>
                      {
                        fixture.channels.map((channel) => {
                          return <ChannelSlider key={channel.channelNo}
                                                universe={fixture.universe}
                                                id={channel.channelNo}
                                                description={channel.description} />
                        })
                      }
                  </Container>
              )
            }
          </Box>
        </Paper>
      </Grid>
  )
}
