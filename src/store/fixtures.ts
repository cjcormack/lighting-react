import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"
import type { GroupColourPropertyDescriptor, GroupPropertyDescriptor } from "../api/groupsApi"

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
      fixtureTypeList: build.query<Array<FixtureTypeInfo>, void>({
        query: () => {
          return 'fixture/types'
        },
        providesTags: ['Fixture'],
      }),
    }
  },
  overrideExisting: false,
})

export const {
  useFixtureListQuery, useFixtureQuery, useFixtureTypeListQuery,
} = fixturesApi

export const FIXTURE_KINDS = [
  'MOVING_HEAD',
  'SCANNER',
  'PROFILE',
  'FRESNEL',
  'PAR',
  'WASH',
  'STRIP',
  'LASER',
  'BLINDER',
  'EFFECT',
  'GENERIC',
] as const

export type FixtureKind = (typeof FIXTURE_KINDS)[number]

/**
 * Human-readable labels for each kind, kept next to the type so adding a new
 * kind surfaces a TS error here (missing key) rather than at the UI consumer.
 */
export const FIXTURE_KIND_LABEL: Record<FixtureKind, string> = {
  MOVING_HEAD: 'Moving head',
  SCANNER: 'Scanner',
  PROFILE: 'Profile',
  FRESNEL: 'Fresnel',
  PAR: 'PAR',
  WASH: 'Wash',
  STRIP: 'Strip / bar',
  LASER: 'Laser',
  BLINDER: 'Blinder',
  EFFECT: 'Effect (fog, hazer, …)',
  GENERIC: 'Generic',
}

const FIXTURE_KIND_SET = new Set<string>(FIXTURE_KINDS)

export function isFixtureKind(value: unknown): value is FixtureKind {
  return typeof value === 'string' && FIXTURE_KIND_SET.has(value)
}

/**
 * Render-time kind selection: per-patch override wins, falling back to the
 * fixture type's declared kind, then GENERIC. Unknown strings on either input
 * (older backend, hand-edited JSON) fall through to GENERIC.
 */
export function resolveFixtureKind(
  override: string | null | undefined,
  typeKind: string | null | undefined,
): FixtureKind {
  if (isFixtureKind(override)) return override
  if (isFixtureKind(typeKind)) return typeKind
  return 'GENERIC'
}

/** How a fixture's beam is drawn on the stage view (mirrors backend BeamShape). */
export type BeamShape = 'NONE' | 'ROUND' | 'LINEAR'
/** Beam edge hardness (mirrors backend BeamEdge). */
export type BeamEdge = 'HARD' | 'SOFT'

export type FixtureTypeInfo = {
  typeKey: string
  manufacturer: string | null
  model: string | null
  modeName: string | null
  channelCount: number | null
  isRegistered: boolean
  capabilities: string[]
  properties: PropertyDescriptor[]
  elementGroupProperties: GroupPropertyDescriptor[] | null
  acceptsBeamAngle?: boolean
  acceptsGel?: boolean
  gelCompactDisplay?: CompactDisplayRole | null
  kind?: FixtureKind
  /** Physical bounding size in metres; `lengthM` is the long axis. Optional so
   *  older /types payloads still typecheck. */
  lengthM?: number | null
  widthM?: number | null
  heightM?: number | null
  beamShape?: BeamShape
  beamEdge?: BeamEdge
}

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
  | 'pan'
  | 'tilt'
  | 'pan_fine'
  | 'tilt_fine'
  | 'uv'
  | 'strobe'
  | 'amber'
  | 'white'
  | 'setting'
  | 'speed'
  | 'other'

export type CompactDisplayRole = 'primary' | 'secondary'

export type SliderPropertyDescriptor = {
  type: 'slider'
  name: string
  displayName: string
  category: PropertyCategory
  channel: ChannelRef
  min: number
  max: number
  compactDisplay?: CompactDisplayRole
  /** Movement axis for moving-head sliders (omitted ⇒ none). */
  axis?: 'PAN' | 'TILT'
  /** Slider min in degrees (mapped to DMX min). Both deg fields must be set
   *  for the 3D view to convert raw values into degrees. */
  degMin?: number
  /** Slider max in degrees (mapped to DMX max). */
  degMax?: number
  /** Reverse the direction of the slider→degrees mapping. */
  inverted?: boolean
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
  compactDisplay?: CompactDisplayRole
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
  compactDisplay?: CompactDisplayRole
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
  compactDisplay?: CompactDisplayRole
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
  elementGroupProperties?: GroupPropertyDescriptor[]
  mode?: ModeInfo
  capabilities: string[]
  groups: string[]
  compatiblePresetIds: number[]
  gelCode?: string | null
}

/**
 * Find the property promoted to the compact card primary slot (top row).
 */
export function findCompactPrimary(properties: PropertyDescriptor[]): PropertyDescriptor | undefined {
  return properties.find((p) => p.compactDisplay === 'primary')
}

/**
 * Find the property promoted to the compact card secondary slot (bottom row).
 */
export function findCompactSecondary(properties: PropertyDescriptor[]): PropertyDescriptor | undefined {
  return properties.find((p) => p.compactDisplay === 'secondary')
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

/**
 * The aggregated per-element colour control of a multi-element fixture, if any.
 * Present only when the backend exposed ≥2 elements with a common colour
 * property (e.g. an RGBW pixel bar). Drives per-pixel stage rendering.
 */
export function findGroupColourSource(
  fixture: Fixture | undefined,
): GroupColourPropertyDescriptor | undefined {
  return fixture?.elementGroupProperties?.find(
    (p): p is GroupColourPropertyDescriptor => p.type === 'colour',
  )
}

/**
 * Find the dimmer slider on a fixture or element. Used widely for
 * brightness-derived UI (compact cards, stage markers, gel swatches).
 */
export function findDimmerProperty(
  properties: PropertyDescriptor[] | undefined,
): SliderPropertyDescriptor | undefined {
  return properties?.find(
    (p): p is SliderPropertyDescriptor => p.type === 'slider' && p.category === 'dimmer',
  )
}

/** Find the pan slider (axis === 'PAN') for moving-head head rotation. */
export function findPanProperty(
  properties: PropertyDescriptor[] | undefined,
): SliderPropertyDescriptor | undefined {
  return properties?.find(
    (p): p is SliderPropertyDescriptor => p.type === 'slider' && p.axis === 'PAN',
  )
}

/** Find the tilt slider (axis === 'TILT') for moving-head head rotation. */
export function findTiltProperty(
  properties: PropertyDescriptor[] | undefined,
): SliderPropertyDescriptor | undefined {
  return properties?.find(
    (p): p is SliderPropertyDescriptor => p.type === 'slider' && p.axis === 'TILT',
  )
}

/**
 * Find the optional 8-bit fine pan slider (category === 'pan_fine') for
 * 16-bit head positioning. Combined with `findPanProperty` to give 65536-step
 * resolution; absent on fixtures without sub-step pan precision.
 */
export function findPanFineProperty(
  properties: PropertyDescriptor[] | undefined,
): SliderPropertyDescriptor | undefined {
  return properties?.find(
    (p): p is SliderPropertyDescriptor => p.type === 'slider' && p.category === 'pan_fine',
  )
}

/** Fine tilt counterpart to {@link findPanFineProperty}. */
export function findTiltFineProperty(
  properties: PropertyDescriptor[] | undefined,
): SliderPropertyDescriptor | undefined {
  return properties?.find(
    (p): p is SliderPropertyDescriptor => p.type === 'slider' && p.category === 'tilt_fine',
  )
}
