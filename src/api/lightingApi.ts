import {ChannelsApi, createChannelsApi} from "./channelsApi";
import {createStatusApi, StatusApi} from "./statusApi";
import {createTrackApi, TrackApi} from "./trackApi";
import {createInternalApiConnection} from "./internalApi";

interface LightingApi {
  channels: ChannelsApi
  status: StatusApi
  track: TrackApi
}

const lightingApi = createLightingApi()

export function useLightingApi(): LightingApi {
  return lightingApi
}

function getLightingWsUrl() {
  if (process.env.NODE_ENV && process.env.NODE_ENV === 'development') {
    return 'ws://127.0.0.1:8080/lighting/'
  } else {
    return 'ws://' + window.location.href.split('/')[2] + '/lighting/'
  }
}

function createLightingApi(): LightingApi {
  const wsAddress = getLightingWsUrl()
  const connection = createInternalApiConnection(wsAddress)

  const channelsApi = createChannelsApi(connection)
  const statusApi = createStatusApi(connection)
  const trackApi = createTrackApi(connection)

  return {
    channels: channelsApi,
    status: statusApi,
    track: trackApi,
  }
}
