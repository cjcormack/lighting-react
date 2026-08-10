import type {
  ChannelRef,
  ColourPropertyDescriptor,
  Fixture,
  PositionPropertyDescriptor,
  PropertyCategory,
  PropertyDescriptor,
  SettingOption,
  SettingPropertyDescriptor,
  SliderPropertyDescriptor,
} from '@/store/fixtures'

// Hand-built descriptor/fixture factories for fixtures-list tests. Type-only
// imports from store/fixtures, so importing this file never touches the store
// or the WebSocket layer.

export function chan(channelNo: number, universe = 0): ChannelRef {
  return { universe, channelNo }
}

export function sliderProp(
  name: string,
  category: PropertyCategory,
  channel: ChannelRef,
  over: Partial<SliderPropertyDescriptor> = {},
): SliderPropertyDescriptor {
  return {
    type: 'slider',
    name,
    displayName: name,
    category,
    channel,
    min: 0,
    max: 255,
    ...over,
  }
}

export function colourProp(
  name: string,
  red: ChannelRef,
  green: ChannelRef,
  blue: ChannelRef,
  over: Partial<ColourPropertyDescriptor> = {},
): ColourPropertyDescriptor {
  return {
    type: 'colour',
    name,
    displayName: name,
    category: 'colour',
    redChannel: red,
    greenChannel: green,
    blueChannel: blue,
    ...over,
  }
}

export function settingProp(
  name: string,
  category: PropertyCategory,
  channel: ChannelRef,
  options: SettingOption[] = [{ name: 'open', level: 0, displayName: 'Open' }],
): SettingPropertyDescriptor {
  return {
    type: 'setting',
    name,
    displayName: name,
    category,
    channel,
    options,
  }
}

export function positionProp(
  name: string,
  pan: ChannelRef,
  tilt: ChannelRef,
  over: Partial<PositionPropertyDescriptor> = {},
): PositionPropertyDescriptor {
  return {
    type: 'position',
    name,
    displayName: name,
    category: 'position',
    panChannel: pan,
    tiltChannel: tilt,
    panMin: 0,
    panMax: 255,
    tiltMin: 0,
    tiltMax: 255,
    ...over,
  }
}

let nextChannel = 1

export function makeFixture(
  key: string,
  properties: PropertyDescriptor[],
  over: Partial<Fixture> = {},
): Fixture {
  const firstChannel = nextChannel
  nextChannel += 8
  return {
    key,
    name: key,
    typeKey: 'test-type',
    universe: 0,
    firstChannel,
    channelCount: 8,
    channels: [],
    properties,
    capabilities: [],
    groups: [],
    compatiblePresetIds: [],
    ...over,
  }
}
