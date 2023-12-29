import {ChannelsApi, createChannelsApi} from "./channelsApi";
import {createStatusApi, StatusApi} from "./statusApi";
import {createTrackApi, TrackApi} from "./trackApi";
import {createInternalApiConnection} from "./internalApi";
import {createScriptApi, ScriptsApi} from "./scriptsApi";
import {createUniversesApi, UniversesApi} from "./universesApi";
import {createSceneApi, ScenesApi} from "./scenesApi";
import {createFixtureApi, FixturesApi} from "./fixturesApi";

interface LightingApi {
  universes: UniversesApi
  channels: ChannelsApi
  status: StatusApi
  track: TrackApi
  scripts: ScriptsApi
  scenes: ScenesApi
  fixtures: FixturesApi
}

export const lightingApi = createLightingApi()

function getWebSocketUrl() {
  if (process.env.NODE_ENV && process.env.NODE_ENV === 'development') {
    return 'ws://127.0.0.1:8413/api'
  } else {
    return 'ws://' + window.location.href.split('/')[2] + '/api'
  }
}

function createLightingApi(): LightingApi {
  const baseUrl = '/api/'
  const wsUrl = getWebSocketUrl()

  const connection = createInternalApiConnection(baseUrl, wsUrl)

  const universesApi = createUniversesApi(connection)
  const channelsApi = createChannelsApi(connection)
  const statusApi = createStatusApi(connection)
  const trackApi = createTrackApi(connection)
  const scriptApi = createScriptApi(connection)
  const sceneApi = createSceneApi(connection)
  const fixtureApi = createFixtureApi(connection)

  return {
    universes: universesApi,
    channels: channelsApi,
    status: statusApi,
    track: trackApi,
    scripts: scriptApi,
    scenes: sceneApi,
    fixtures: fixtureApi,
  }
}
