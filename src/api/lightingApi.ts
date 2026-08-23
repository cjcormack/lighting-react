import {ChannelsApi, createChannelsApi} from "./channelsApi";
import {ChannelMappingApi, createChannelMappingApi} from "./channelMappingApi";
import {createStatusApi, StatusApi} from "./statusApi";
import {createInternalApiConnection} from "./internalApi";
import {createUniversesApi, UniversesApi} from "./universesApi";

import {createFixtureApi, FixturesApi} from "./fixturesApi";
import {createProjectApi, ProjectApi} from "./projectApi";
import {createGroupsApi, GroupsApi} from "./groupsApi";
import {createFxApi, FxApi} from "./fxApi";
import {createLooksWsApi, LooksWsApi} from "./looksWsApi";
import {createTemplatesWsApi, TemplatesWsApi} from "./templatesWsApi";
import {createCuesWsApi, CuesWsApi} from "./cuesWsApi";
import {createCueStacksWsApi, CueStacksWsApi} from "./cueStacksWsApi";
import {createCueSlotsWsApi, CueSlotsWsApi} from "./cueSlotsWsApi";
import {createPatchApi, PatchApi} from "./patchApi";
import {createRiggingApi, RiggingApi} from "./riggingApi";
import {createStageRegionApi, StageRegionApi} from "./stageRegionApi";
import {createParkApi, ParkApi} from "./parkApi";
import {createPromptBooksWsApi, PromptBooksWsApi} from "./promptBooksWsApi";
import {createBootStatusWsApi, BootStatusWsApi} from "./bootStatusWsApi";
import {createSurfacesWsApi, SurfacesWsApi} from "./surfacesApi";
import {createCloudSyncWsApi, CloudSyncWsApi} from "./cloudSyncWsApi";
import {createProgrammerApi, ProgrammerApi} from "./programmerWsApi";
import {createSpeedMastersWsApi, SpeedMastersWsApi} from "./speedMastersWsApi";
import {AuthWsApi, createAuthWsApi} from "./authWsApi";
import {createUsersWsApi, UsersWsApi} from "./usersWsApi";
import {createInstallWsApi, InstallWsApi} from "./installWsApi";
import {createUpdateWsApi, UpdateWsApi} from "./updateWsApi";

interface LightingApi {
  universes: UniversesApi
  channels: ChannelsApi
  channelMapping: ChannelMappingApi
  status: StatusApi
  auth: AuthWsApi
  users: UsersWsApi
  install: InstallWsApi
  updates: UpdateWsApi

  fixtures: FixturesApi
  projects: ProjectApi
  groups: GroupsApi
  fx: FxApi
  looks: LooksWsApi
  templates: TemplatesWsApi
  speedMasters: SpeedMastersWsApi
  cues: CuesWsApi
  cueStacks: CueStacksWsApi
  cueSlots: CueSlotsWsApi
  patches: PatchApi
  riggings: RiggingApi
  stageRegions: StageRegionApi
  park: ParkApi
  promptBooks: PromptBooksWsApi
  surfaces: SurfacesWsApi
  cloudSync: CloudSyncWsApi
  bootStatus: BootStatusWsApi
  programmer: ProgrammerApi
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
  const authWsApi = createAuthWsApi(connection)
  const usersWsApi = createUsersWsApi(connection)
  const installWsApi = createInstallWsApi(connection)
  const updateWsApi = createUpdateWsApi(connection)
  const fixtureApi = createFixtureApi(connection)
  const projectApi = createProjectApi(connection)
  const groupsApi = createGroupsApi(connection)
  const fxApi = createFxApi(connection)
  const looksWsApi = createLooksWsApi(connection)
  const templatesWsApi = createTemplatesWsApi(connection)
  const cuesWsApi = createCuesWsApi(connection)
  const cueStacksWsApi = createCueStacksWsApi(connection)
  const cueSlotsWsApi = createCueSlotsWsApi(connection)
  const patchApi = createPatchApi(connection)
  const riggingApi = createRiggingApi(connection)
  const stageRegionApi = createStageRegionApi(connection)
  const parkApi = createParkApi(connection)
  const promptBooksWsApi = createPromptBooksWsApi(connection)
  const surfacesWsApi = createSurfacesWsApi(connection)
  const cloudSyncWsApi = createCloudSyncWsApi(connection)
  const bootStatusWsApi = createBootStatusWsApi(connection)
  const programmerApi = createProgrammerApi(connection)
  const speedMastersWsApi = createSpeedMastersWsApi(connection)

  return {
    universes: universesApi,
    channels: channelsApi,
    channelMapping: channelMappingApi,
    status: statusApi,
    auth: authWsApi,
    users: usersWsApi,
    install: installWsApi,
    updates: updateWsApi,

    fixtures: fixtureApi,
    projects: projectApi,
    groups: groupsApi,
    fx: fxApi,
    looks: looksWsApi,
    templates: templatesWsApi,
    speedMasters: speedMastersWsApi,
    cues: cuesWsApi,
    cueStacks: cueStacksWsApi,
    cueSlots: cueSlotsWsApi,
    patches: patchApi,
    riggings: riggingApi,
    stageRegions: stageRegionApi,
    park: parkApi,
    promptBooks: promptBooksWsApi,
    surfaces: surfacesWsApi,
    cloudSync: cloudSyncWsApi,
    bootStatus: bootStatusWsApi,
    programmer: programmerApi,
  }
}
