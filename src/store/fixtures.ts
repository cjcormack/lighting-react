import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"

lightingApi.fixtures.subscribe(function() {
  store.dispatch(restApi.util.invalidateTags(['Fixture']))
})

export const fixturesApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      fixtureList: build.query<Array<Fixture>, void>({
        query: () => {
          return 'fixture/list'
        },
        providesTags: ['Fixture'],
      }),
      fixture: build.query<Fixture, number>({
        query: (id) => {
          return `fixture/${id}`
        },
        providesTags: ['Fixture'],
      }),
    }
  },
  overrideExisting: false,
})

export const {
  useFixtureListQuery, useFixtureQuery
} = fixturesApi

// Channel reference for property descriptors
export type ChannelRef = {
  universe: number
  channelNo: number
}

// Property descriptor types (discriminated union)
export type PropertyDescriptor =
  | SliderPropertyDescriptor
  | ColourPropertyDescriptor
  | PositionPropertyDescriptor
  | SettingPropertyDescriptor

export type PropertyCategory =
  | 'dimmer'
  | 'colour'
  | 'position'
  | 'uv'
  | 'strobe'
  | 'amber'
  | 'white'
  | 'setting'
  | 'speed'
  | 'other'

export type SliderPropertyDescriptor = {
  type: 'slider'
  name: string
  displayName: string
  category: PropertyCategory
  channel: ChannelRef
  min: number
  max: number
}

export type ColourPropertyDescriptor = {
  type: 'colour'
  name: string
  displayName: string
  category: 'colour'
  redChannel: ChannelRef
  greenChannel: ChannelRef
  blueChannel: ChannelRef
  whiteChannel?: ChannelRef
  amberChannel?: ChannelRef
  uvChannel?: ChannelRef
}

export type PositionPropertyDescriptor = {
  type: 'position'
  name: string
  displayName: string
  category: 'position'
  panChannel: ChannelRef
  tiltChannel: ChannelRef
  panMin: number
  panMax: number
  tiltMin: number
  tiltMax: number
}

export type SettingOption = {
  name: string
  level: number
  displayName: string
  colourPreview?: string
}

export type SettingPropertyDescriptor = {
  type: 'setting'
  name: string
  displayName: string
  category: PropertyCategory
  channel: ChannelRef
  options: SettingOption[]
}

export type ElementDescriptor = {
  index: number
  key: string
  displayName: string
  properties: PropertyDescriptor[]
}

export type ModeInfo = {
  modeName: string
  channelCount: number
}

export type Fixture = {
  key: string
  name: string
  typeKey: string
  manufacturer?: string
  model?: string
  universe: number
  firstChannel: number
  channelCount: number
  channels: {
    channelNo: number
    description: string
  }[]
  properties: PropertyDescriptor[]
  elements?: ElementDescriptor[]
  mode?: ModeInfo
  capabilities: string[]
  groups: string[]
}

/**
 * Result of finding a colour source from properties.
 * Either a direct colour property (type: 'colour') or a setting with category 'colour'.
 */
export type ColourSource =
  | { type: 'colour'; property: ColourPropertyDescriptor }
  | { type: 'setting'; property: SettingPropertyDescriptor }

/**
 * Find the colour source from an array of properties.
 * Prioritizes colour properties over colour settings.
 * If multiple colour settings exist, returns the first one.
 */
export function findColourSource(properties: PropertyDescriptor[]): ColourSource | undefined {
  // First, look for a direct colour property
  const colourProp = properties.find((p) => p.type === 'colour')
  if (colourProp) {
    return { type: 'colour', property: colourProp as ColourPropertyDescriptor }
  }

  // Fall back to the first setting with category 'colour'
  const colourSetting = properties.find(
    (p) => p.type === 'setting' && p.category === 'colour'
  )
  if (colourSetting) {
    return { type: 'setting', property: colourSetting as SettingPropertyDescriptor }
  }

  return undefined
}
