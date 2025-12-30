import {ChannelsApi, createChannelsApi} from "./channelsApi";
import {createStatusApi, StatusApi} from "./statusApi";
import {createTrackApi, TrackApi} from "./trackApi";
import {createInternalApiConnection} from "./internalApi";
import {createUniversesApi, UniversesApi} from "./universesApi";
import {createSceneApi, ScenesApi} from "./scenesApi";
import {createFixtureApi, FixturesApi} from "./fixturesApi";
import {createProjectApi, ProjectApi} from "./projectApi";
import {createGroupsApi, GroupsApi} from "./groupsApi";

interface LightingApi {
  universes: UniversesApi
  channels: ChannelsApi
  status: StatusApi
  track: TrackApi
  scenes: ScenesApi
  fixtures: FixturesApi
  projects: ProjectApi
  groups: GroupsApi
}

export const lightingApi = createLightingApi()

function getWebSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL
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
  const sceneApi = createSceneApi(connection)
  const fixtureApi = createFixtureApi(connection)
  const projectApi = createProjectApi(connection)
  const groupsApi = createGroupsApi(connection)

  return {
    universes: universesApi,
    channels: channelsApi,
    status: statusApi,
    track: trackApi,
    scenes: sceneApi,
    fixtures: fixtureApi,
    projects: projectApi,
    groups: groupsApi,
  }
}
