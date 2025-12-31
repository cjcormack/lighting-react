import { useRef, useMemo, useSyncExternalStore, useCallback } from 'react'
import { lightingApi } from '../api/lightingApi'
import type {
  ChannelRef,
  PropertyDescriptor,
  SliderPropertyDescriptor,
  ColourPropertyDescriptor,
  PositionPropertyDescriptor,
  SettingPropertyDescriptor,
} from '../store/fixtures'

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

/**
 * Hook to get a slider property's current value
 */
export function useSliderValue(property: SliderPropertyDescriptor): number {
  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels([property.channel], callback),
    [property.channel.universe, property.channel.channelNo]
  )

  const getSnapshot = useCallback(
    () => getChannelValue(property.channel),
    [property.channel.universe, property.channel.channelNo]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

type ColourValueResult = {
  r: number
  g: number
  b: number
  w?: number
  a?: number
  uv?: number
  css: string
  combinedCss: string
}

/**
 * Hook to get a colour property's RGB values
 */
export function useColourValue(property: ColourPropertyDescriptor): ColourValueResult {
  const cachedRef = useRef<ColourValueResult | null>(null)

  const channels = useMemo(() => {
    const result: ChannelRef[] = [
      property.redChannel,
      property.greenChannel,
      property.blueChannel,
    ]
    if (property.whiteChannel) result.push(property.whiteChannel)
    if (property.amberChannel) result.push(property.amberChannel)
    if (property.uvChannel) result.push(property.uvChannel)
    return result
  }, [property])

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(channels, callback),
    [channels]
  )

  const getSnapshot = useCallback((): ColourValueResult => {
    const r = getChannelValue(property.redChannel)
    const g = getChannelValue(property.greenChannel)
    const b = getChannelValue(property.blueChannel)
    const w = property.whiteChannel ? getChannelValue(property.whiteChannel) : undefined
    const a = property.amberChannel ? getChannelValue(property.amberChannel) : undefined
    const uv = property.uvChannel ? getChannelValue(property.uvChannel) : undefined

    // Check if values changed
    const cached = cachedRef.current
    if (
      cached &&
      cached.r === r &&
      cached.g === g &&
      cached.b === b &&
      cached.w === w &&
      cached.a === a &&
      cached.uv === uv
    ) {
      return cached
    }

    const css = `rgb(${r}, ${g}, ${b})`

    // Compute combined colour approximation for RGBWAUV
    let combinedR = r
    let combinedG = g
    let combinedB = b

    // Add white (brightens toward white)
    if (w !== undefined && w > 0) {
      const whiteFactor = w / 255
      combinedR = Math.min(255, combinedR + whiteFactor * (255 - combinedR))
      combinedG = Math.min(255, combinedG + whiteFactor * (255 - combinedG))
      combinedB = Math.min(255, combinedB + whiteFactor * (255 - combinedB))
    }

    // Add amber (warm orange ~#FFBF00, blends additively)
    if (a !== undefined && a > 0) {
      const amberFactor = a / 255
      // Amber LEDs are warm orange - blend with existing colour
      combinedR = Math.min(255, combinedR + amberFactor * (255 - combinedR * 0.3))
      combinedG = Math.min(255, combinedG + amberFactor * (191 - combinedG * 0.5))
      // Amber has minimal blue contribution
    }

    // Add UV (represented as violet/purple ~#8B00FF since UV is invisible)
    if (uv !== undefined && uv > 0) {
      const uvFactor = uv / 255
      // UV LEDs appear as deep violet/purple to cameras and in mixed light
      combinedR = Math.min(255, combinedR + uvFactor * (139 - combinedR * 0.5))
      combinedG = Math.min(255, combinedG * (1 - uvFactor * 0.3)) // UV suppresses green slightly
      combinedB = Math.min(255, combinedB + uvFactor * (255 - combinedB * 0.3))
    }

    const combinedCss = `rgb(${Math.round(combinedR)}, ${Math.round(combinedG)}, ${Math.round(combinedB)})`

    const result = { r, g, b, w, a, uv, css, combinedCss }
    cachedRef.current = result
    return result
  }, [property])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

type PositionValueResult = {
  pan: number
  tilt: number
  panNormalized: number
  tiltNormalized: number
}

/**
 * Hook to get a position property's pan/tilt values
 */
export function usePositionValue(property: PositionPropertyDescriptor): PositionValueResult {
  const cachedRef = useRef<PositionValueResult | null>(null)

  const channels = useMemo(
    () => [property.panChannel, property.tiltChannel],
    [property.panChannel, property.tiltChannel]
  )

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(channels, callback),
    [channels]
  )

  const getSnapshot = useCallback((): PositionValueResult => {
    const pan = getChannelValue(property.panChannel)
    const tilt = getChannelValue(property.tiltChannel)

    // Check if values changed
    const cached = cachedRef.current
    if (cached && cached.pan === pan && cached.tilt === tilt) {
      return cached
    }

    // Normalize to 0-1 range for display
    const panRange = property.panMax - property.panMin
    const tiltRange = property.tiltMax - property.tiltMin
    const panNormalized = panRange > 0 ? (pan - property.panMin) / panRange : 0.5
    const tiltNormalized = tiltRange > 0 ? (tilt - property.tiltMin) / tiltRange : 0.5

    const result = { pan, tilt, panNormalized, tiltNormalized }
    cachedRef.current = result
    return result
  }, [property])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

type SettingValueResult = {
  level: number
  option?: SettingPropertyDescriptor['options'][number]
}

/**
 * Hook to get a setting property's current option
 */
export function useSettingValue(property: SettingPropertyDescriptor): SettingValueResult {
  const cachedRef = useRef<SettingValueResult | null>(null)

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels([property.channel], callback),
    [property.channel.universe, property.channel.channelNo]
  )

  const getSnapshot = useCallback((): SettingValueResult => {
    const level = getChannelValue(property.channel)

    // Check if value changed
    const cached = cachedRef.current
    if (cached && cached.level === level) {
      return cached
    }

    // Find the matching option (first option with level >= current level)
    let matchedOption = property.options[0]
    for (let i = property.options.length - 1; i >= 0; i--) {
      if (level >= property.options[i].level) {
        matchedOption = property.options[i]
        break
      }
    }

    const result = { level, option: matchedOption }
    cachedRef.current = result
    return result
  }, [property])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook to get any property's value based on its type
 */
export function usePropertyValue(property: PropertyDescriptor) {
  switch (property.type) {
    case 'slider':
      return useSliderValue(property)
    case 'colour':
      return useColourValue(property)
    case 'position':
      return usePositionValue(property)
    case 'setting':
      return useSettingValue(property)
  }
}

/**
 * Hook to update a channel value
 */
export function useUpdateChannel() {
  return useCallback((channel: ChannelRef, value: number) => {
    lightingApi.channels.update(channel.universe, channel.channelNo, value)
  }, [])
}
