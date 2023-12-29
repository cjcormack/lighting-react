import {selector, selectorFamily, useRecoilValue} from "recoil";
import {lightingApi} from "../api/lightingApi";
import {
  Box,
  Container,
  Grid,
  Paper, Tab, Tabs,
  Typography
} from "@mui/material";
import React, {Suspense} from "react";
import {Fixture} from "../api/fixturesApi";
import {ChannelSlider} from "./Channels";

export const fixtureListState = selector<readonly Fixture[]>({
  key: 'fixtureList',
  get: () => {
    return lightingApi.fixtures.getAll()
  },
})

const fixtureKeysState = selector<Array<string>>({
  key: 'fixtureKeys',
  get: ({get}) => {
    const fixtures = get(fixtureListState)
    return fixtures.map((it) => it.key)
  },
})

const fixturesMappedByKeyState = selector<Map<string, Fixture>>({
  key: 'fixturesMappedByKey',
  get: ({get}) => {
    const fixtureList = get(fixtureListState)
    return new Map(fixtureList.map((fixture => [fixture.key, fixture])))
  }
})

const fixtureState = selectorFamily<Fixture, string>({
  key: 'fixture',
  get: (fixtureKey: string) => ({get}) => {
    const fixturesMappedByKey = get(fixturesMappedByKeyState)
    const fixture = fixturesMappedByKey.get(fixtureKey)
    if (fixture === undefined) {
      throw new Error(`Fixture '${fixtureKey}' not found`)
    }
    return fixture
  },
})

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
  const fixtureKeys = useRecoilValue(fixtureKeysState)

  return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          {fixtureKeys.map((fixtureKey) => (
            <Suspense fallback={'Loading...'} key={fixtureKey}>
              <FixtureCard fixtureKey={fixtureKey}/>
            </Suspense>
          ))}
        </Grid>
      </Container>
  )
}

const FixtureCard = ({fixtureKey}: {fixtureKey: string}) => {
  const fixture = useRecoilValue(fixtureState(fixtureKey))

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
