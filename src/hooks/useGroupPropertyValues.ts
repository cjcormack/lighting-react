import { useRef, useMemo, useSyncExternalStore, useCallback } from 'react'
import { lightingApi } from '../api/lightingApi'
import type { ChannelRef } from '../store/fixtures'
import type {
  GroupSliderPropertyDescriptor,
  GroupColourPropertyDescriptor,
  GroupPositionPropertyDescriptor,
  GroupSettingPropertyDescriptor,
  GroupPropertyDescriptor,
} from '../api/groupsApi'

// Helper to create channel key
function channelKey(ref: ChannelRef): string {
  return `${ref.universe}:${ref.channelNo}`
}

// Get a single channel value
function getChannelValue(channel: ChannelRef): number {
  return lightingApi.channels.get(channel.universe, channel.channelNo)
}

// Subscribe to channel updates for specific channels
function subscribeToChannels(
  channels: ChannelRef[],
  callback: () => void
): () => void {
  const subscriptions = channels.map((ch) => {
    const key = channelKey(ch)
    return lightingApi.channels.subscribeToChannel(key, callback)
  })

  return () => subscriptions.forEach((sub) => sub.unsubscribe())
}

// === Slider Group Values ===

export type GroupSliderValueResult = {
  min: number
  max: number
  isUniform: boolean
  displayText: string
  values: number[]
}

/**
 * Hook to get aggregated slider values from all group members.
 * Returns min, max, and whether all values are uniform.
 */
export function useGroupSliderValues(
  property: GroupSliderPropertyDescriptor
): GroupSliderValueResult {
  const cachedRef = useRef<GroupSliderValueResult | null>(null)

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(property.memberChannels, callback),
    [property.memberChannels]
  )

  const getSnapshot = useCallback((): GroupSliderValueResult => {
    const values = property.memberChannels.map(getChannelValue)

    if (values.length === 0) {
      return { min: 0, max: 0, isUniform: true, displayText: '0%', values: [] }
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    const isUniform = min === max

    // Check if values changed
    const cached = cachedRef.current
    if (
      cached &&
      cached.min === min &&
      cached.max === max &&
      cached.values.length === values.length
    ) {
      return cached
    }

    // Format display text
    const minPct = Math.round((min / 255) * 100)
    const maxPct = Math.round((max / 255) * 100)
    const displayText = isUniform ? `${minPct}%` : `${minPct}-${maxPct}%`

    const result = { min, max, isUniform, displayText, values }
    cachedRef.current = result
    return result
  }, [property.memberChannels])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook to update all slider channels in a group to the same value.
 */
export function useUpdateGroupSlider(property: GroupSliderPropertyDescriptor) {
  return useCallback(
    (value: number) => {
      property.memberChannels.forEach((channel) => {
        lightingApi.channels.update(channel.universe, channel.channelNo, value)
      })
    },
    [property.memberChannels]
  )
}

// === Colour Group Values ===

export type GroupColourValueResult = {
  isUniform: boolean
  displayText: string
  // Average/representative values for display
  avgR: number
  avgG: number
  avgB: number
  avgW?: number
  avgA?: number
  avgUv?: number
  combinedCss: string
  // Individual member values
  members: Array<{
    fixtureKey: string
    r: number
    g: number
    b: number
    w?: number
    a?: number
    uv?: number
  }>
}

/**
 * Hook to get aggregated colour values from all group members.
 */
export function useGroupColourValues(
  property: GroupColourPropertyDescriptor
): GroupColourValueResult {
  const cachedRef = useRef<GroupColourValueResult | null>(null)

  const allChannels = useMemo(() => {
    const channels: ChannelRef[] = []
    property.memberColourChannels.forEach((m) => {
      channels.push(m.redChannel, m.greenChannel, m.blueChannel)
      if (m.whiteChannel) channels.push(m.whiteChannel)
      if (m.amberChannel) channels.push(m.amberChannel)
      if (m.uvChannel) channels.push(m.uvChannel)
    })
    return channels
  }, [property.memberColourChannels])

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(allChannels, callback),
    [allChannels]
  )

  const getSnapshot = useCallback((): GroupColourValueResult => {
    const members = property.memberColourChannels.map((m) => ({
      fixtureKey: m.fixtureKey,
      r: getChannelValue(m.redChannel),
      g: getChannelValue(m.greenChannel),
      b: getChannelValue(m.blueChannel),
      w: m.whiteChannel ? getChannelValue(m.whiteChannel) : undefined,
      a: m.amberChannel ? getChannelValue(m.amberChannel) : undefined,
      uv: m.uvChannel ? getChannelValue(m.uvChannel) : undefined,
    }))

    if (members.length === 0) {
      return {
        isUniform: true,
        displayText: 'No members',
        avgR: 0,
        avgG: 0,
        avgB: 0,
        combinedCss: 'rgb(0, 0, 0)',
        members: [],
      }
    }

    // Calculate averages for RGB
    const avgR = Math.round(members.reduce((sum, m) => sum + m.r, 0) / members.length)
    const avgG = Math.round(members.reduce((sum, m) => sum + m.g, 0) / members.length)
    const avgB = Math.round(members.reduce((sum, m) => sum + m.b, 0) / members.length)

    // Calculate averages for extended channels (only if any member has them)
    const hasWhite = members.some((m) => m.w !== undefined)
    const hasAmber = members.some((m) => m.a !== undefined)
    const hasUv = members.some((m) => m.uv !== undefined)

    const avgW = hasWhite
      ? Math.round(members.reduce((sum, m) => sum + (m.w ?? 0), 0) / members.length)
      : undefined
    const avgA = hasAmber
      ? Math.round(members.reduce((sum, m) => sum + (m.a ?? 0), 0) / members.length)
      : undefined
    const avgUv = hasUv
      ? Math.round(members.reduce((sum, m) => sum + (m.uv ?? 0), 0) / members.length)
      : undefined

    // Check if all values are the same (including extended channels)
    const isUniform = members.every(
      (m) =>
        m.r === members[0].r &&
        m.g === members[0].g &&
        m.b === members[0].b &&
        m.w === members[0].w &&
        m.a === members[0].a &&
        m.uv === members[0].uv
    )

    const displayText = isUniform ? `R:${avgR} G:${avgG} B:${avgB}` : 'Mixed'
    const combinedCss = `rgb(${avgR}, ${avgG}, ${avgB})`

    // Check if cached value is still valid
    const cached = cachedRef.current
    if (
      cached &&
      cached.avgR === avgR &&
      cached.avgG === avgG &&
      cached.avgB === avgB &&
      cached.avgW === avgW &&
      cached.avgA === avgA &&
      cached.avgUv === avgUv &&
      cached.isUniform === isUniform
    ) {
      return cached
    }

    const result: GroupColourValueResult = {
      isUniform,
      displayText,
      avgR,
      avgG,
      avgB,
      avgW,
      avgA,
      avgUv,
      combinedCss,
      members,
    }
    cachedRef.current = result
    return result
  }, [property.memberColourChannels])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook to update all colour channels in a group to the same values.
 */
export function useUpdateGroupColour(property: GroupColourPropertyDescriptor) {
  return useCallback(
    (r: number, g: number, b: number, w?: number, a?: number, uv?: number) => {
      property.memberColourChannels.forEach((m) => {
        lightingApi.channels.update(m.redChannel.universe, m.redChannel.channelNo, r)
        lightingApi.channels.update(m.greenChannel.universe, m.greenChannel.channelNo, g)
        lightingApi.channels.update(m.blueChannel.universe, m.blueChannel.channelNo, b)
        if (m.whiteChannel && w !== undefined) {
          lightingApi.channels.update(m.whiteChannel.universe, m.whiteChannel.channelNo, w)
        }
        if (m.amberChannel && a !== undefined) {
          lightingApi.channels.update(m.amberChannel.universe, m.amberChannel.channelNo, a)
        }
        if (m.uvChannel && uv !== undefined) {
          lightingApi.channels.update(m.uvChannel.universe, m.uvChannel.channelNo, uv)
        }
      })
    },
    [property.memberColourChannels]
  )
}

// === Position Group Values ===

export type GroupPositionValueResult = {
  isUniform: boolean
  displayText: string
  avgPan: number
  avgTilt: number
  avgPanNormalized: number
  avgTiltNormalized: number
  members: Array<{
    fixtureKey: string
    pan: number
    tilt: number
  }>
}

/**
 * Hook to get aggregated position values from all group members.
 */
export function useGroupPositionValues(
  property: GroupPositionPropertyDescriptor
): GroupPositionValueResult {
  const cachedRef = useRef<GroupPositionValueResult | null>(null)

  const allChannels = useMemo(() => {
    const channels: ChannelRef[] = []
    property.memberPositionChannels.forEach((m) => {
      channels.push(m.panChannel, m.tiltChannel)
    })
    return channels
  }, [property.memberPositionChannels])

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(allChannels, callback),
    [allChannels]
  )

  const getSnapshot = useCallback((): GroupPositionValueResult => {
    const members = property.memberPositionChannels.map((m) => ({
      fixtureKey: m.fixtureKey,
      pan: getChannelValue(m.panChannel),
      tilt: getChannelValue(m.tiltChannel),
    }))

    if (members.length === 0) {
      return {
        isUniform: true,
        displayText: 'No members',
        avgPan: 128,
        avgTilt: 128,
        avgPanNormalized: 0.5,
        avgTiltNormalized: 0.5,
        members: [],
      }
    }

    const avgPan = Math.round(members.reduce((sum, m) => sum + m.pan, 0) / members.length)
    const avgTilt = Math.round(members.reduce((sum, m) => sum + m.tilt, 0) / members.length)

    const isUniform = members.every(
      (m) => m.pan === members[0].pan && m.tilt === members[0].tilt
    )

    // Use first member's range for normalization (they should all be the same)
    const first = property.memberPositionChannels[0]
    const panRange = first.panMax - first.panMin
    const tiltRange = first.tiltMax - first.tiltMin
    const avgPanNormalized = panRange > 0 ? (avgPan - first.panMin) / panRange : 0.5
    const avgTiltNormalized = tiltRange > 0 ? (avgTilt - first.tiltMin) / tiltRange : 0.5

    const displayText = isUniform
      ? `Pan:${avgPan} Tilt:${avgTilt}`
      : 'Mixed'

    // Check cache
    const cached = cachedRef.current
    if (
      cached &&
      cached.avgPan === avgPan &&
      cached.avgTilt === avgTilt &&
      cached.isUniform === isUniform
    ) {
      return cached
    }

    const result: GroupPositionValueResult = {
      isUniform,
      displayText,
      avgPan,
      avgTilt,
      avgPanNormalized,
      avgTiltNormalized,
      members,
    }
    cachedRef.current = result
    return result
  }, [property.memberPositionChannels])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook to update all position channels in a group to the same values.
 */
export function useUpdateGroupPosition(property: GroupPositionPropertyDescriptor) {
  return useCallback(
    (pan: number, tilt: number) => {
      property.memberPositionChannels.forEach((m) => {
        lightingApi.channels.update(m.panChannel.universe, m.panChannel.channelNo, pan)
        lightingApi.channels.update(m.tiltChannel.universe, m.tiltChannel.channelNo, tilt)
      })
    },
    [property.memberPositionChannels]
  )
}

// === Setting Group Values ===

export type GroupSettingValueResult = {
  isUniform: boolean
  displayText: string
  currentOption?: GroupSettingPropertyDescriptor['options'][number]
  values: number[]
}

/**
 * Hook to get aggregated setting values from all group members.
 */
export function useGroupSettingValues(
  property: GroupSettingPropertyDescriptor
): GroupSettingValueResult {
  const cachedRef = useRef<GroupSettingValueResult | null>(null)

  const allChannels = useMemo(
    () => property.memberChannels.map((m) => m.channel),
    [property.memberChannels]
  )

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(allChannels, callback),
    [allChannels]
  )

  const getSnapshot = useCallback((): GroupSettingValueResult => {
    const values = property.memberChannels.map((m) => getChannelValue(m.channel))

    if (values.length === 0) {
      return {
        isUniform: true,
        displayText: 'No members',
        values: [],
      }
    }

    const isUniform = values.every((v) => v === values[0])

    // Find matching option for first value (if uniform, this applies to all)
    let currentOption = property.options[0]
    if (isUniform) {
      const level = values[0]
      for (let i = property.options.length - 1; i >= 0; i--) {
        if (level >= property.options[i].level) {
          currentOption = property.options[i]
          break
        }
      }
    }

    const displayText = isUniform
      ? currentOption?.displayName ?? 'Unknown'
      : 'Mixed'

    // Check cache
    const cached = cachedRef.current
    if (
      cached &&
      cached.isUniform === isUniform &&
      cached.displayText === displayText
    ) {
      return cached
    }

    const result: GroupSettingValueResult = {
      isUniform,
      displayText,
      currentOption: isUniform ? currentOption : undefined,
      values,
    }
    cachedRef.current = result
    return result
  }, [property.memberChannels, property.options])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook to update all setting channels in a group to the same value.
 */
export function useUpdateGroupSetting(property: GroupSettingPropertyDescriptor) {
  return useCallback(
    (level: number) => {
      property.memberChannels.forEach((m) => {
        lightingApi.channels.update(m.channel.universe, m.channel.channelNo, level)
      })
    },
    [property.memberChannels]
  )
}

// === Generic Group Property Value Hook ===

/**
 * Hook to get any group property's aggregated values based on its type.
 */
export function useGroupPropertyValue(property: GroupPropertyDescriptor) {
  switch (property.type) {
    case 'slider':
      return useGroupSliderValues(property)
    case 'colour':
      return useGroupColourValues(property)
    case 'position':
      return useGroupPositionValues(property)
    case 'setting':
      return useGroupSettingValues(property)
  }
}
