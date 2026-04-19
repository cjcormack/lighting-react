import {ChannelsApi, createChannelsApi} from "./channelsApi";
import {ChannelMappingApi, createChannelMappingApi} from "./channelMappingApi";
import {createStatusApi, StatusApi} from "./statusApi";
import {createInternalApiConnection} from "./internalApi";
import {createUniversesApi, UniversesApi} from "./universesApi";

import {createFixtureApi, FixturesApi} from "./fixturesApi";
import {createProjectApi, ProjectApi} from "./projectApi";
import {createGroupsApi, GroupsApi} from "./groupsApi";
import {createFxApi, FxApi} from "./fxApi";
import {createFxPresetsWsApi, FxPresetsWsApi} from "./fxPresetsWsApi";
import {createCuesWsApi, CuesWsApi} from "./cuesWsApi";
import {createCueStacksWsApi, CueStacksWsApi} from "./cueStacksWsApi";
import {createCueSlotsWsApi, CueSlotsWsApi} from "./cueSlotsWsApi";
import {createPatchApi, PatchApi} from "./patchApi";
import {createParkApi, ParkApi} from "./parkApi";
import {createShowWsApi, ShowWsApi} from "./showWsApi";
import {createSurfacesWsApi, SurfacesWsApi} from "./surfacesApi";

interface LightingApi {
  universes: UniversesApi
  channels: ChannelsApi
  channelMapping: ChannelMappingApi
  status: StatusApi

  fixtures: FixturesApi
  projects: ProjectApi
  groups: GroupsApi
  fx: FxApi
  fxPresets: FxPresetsWsApi
  cues: CuesWsApi
  cueStacks: CueStacksWsApi
  cueSlots: CueSlotsWsApi
  patches: PatchApi
  park: ParkApi
  show: ShowWsApi
  surfaces: SurfacesWsApi
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
  const channelMappingApi = createChannelMappingApi(connection)
  const statusApi = createStatusApi(connection)
  const fixtureApi = createFixtureApi(connection)
  const projectApi = createProjectApi(connection)
  const groupsApi = createGroupsApi(connection)
  const fxApi = createFxApi(connection)
  const fxPresetsWsApi = createFxPresetsWsApi(connection)
  const cuesWsApi = createCuesWsApi(connection)
  const cueStacksWsApi = createCueStacksWsApi(connection)
  const cueSlotsWsApi = createCueSlotsWsApi(connection)
  const patchApi = createPatchApi(connection)
  const parkApi = createParkApi(connection)
  const showWsApi = createShowWsApi(connection)
  const surfacesWsApi = createSurfacesWsApi(connection)

  return {
    universes: universesApi,
    channels: channelsApi,
    channelMapping: channelMappingApi,
    status: statusApi,

    fixtures: fixtureApi,
    projects: projectApi,
    groups: groupsApi,
    fx: fxApi,
    fxPresets: fxPresetsWsApi,
    cues: cuesWsApi,
    cueStacks: cueStacksWsApi,
    cueSlots: cueSlotsWsApi,
    patches: patchApi,
    park: parkApi,
    show: showWsApi,
    surfaces: surfacesWsApi,
  }
}
