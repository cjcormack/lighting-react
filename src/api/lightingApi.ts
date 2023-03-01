import {ChannelsApi, createChannelsApi} from "./channelsApi";
import {createStatusApi, StatusApi} from "./statusApi";
import {createTrackApi, TrackApi} from "./trackApi";
import {createInternalApiConnection} from "./internalApi";
import {createScriptApi, ScriptsApi} from "./scriptsApi";

interface LightingApi {
  channels: ChannelsApi
  status: StatusApi
  track: TrackApi
  scripts: ScriptsApi
}

export const lightingApi = createLightingApi()

function getWebSocketUrl() {
  if (process.env.NODE_ENV && process.env.NODE_ENV === 'development') {
    return 'ws://127.0.0.1:8080/lighting/'
  } else {
    return 'ws://' + window.location.href.split('/')[2] + '/lighting/'
  }
}

function createLightingApi(): LightingApi {
  const baseUrl = '/lighting/'
  const wsUrl = getWebSocketUrl()

  const connection = createInternalApiConnection(baseUrl, wsUrl)

  const channelsApi = createChannelsApi(connection)
  const statusApi = createStatusApi(connection)
  const trackApi = createTrackApi(connection)
  const scriptApi = createScriptApi(connection)

  return {
    channels: channelsApi,
    status: statusApi,
    track: trackApi,
    scripts: scriptApi,
  }
}
