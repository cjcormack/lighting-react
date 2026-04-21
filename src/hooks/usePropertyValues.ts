import { useRef, useMemo, useSyncExternalStore, useCallback } from 'react'
import { lightingApi } from '../api/lightingApi'
import { useEditorContext } from '../components/lighting-editor/EditorContext'
import {
  usePresetDraft,
  usePresetDraftValue,
} from '../components/presets/PresetDraftContext'
import {
  rgbToHex,
  hexToRgb,
  parseExtendedColour,
  serializeExtendedColour,
} from '../components/fx/colourUtils'
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

function parseSliderCanonical(value: string | undefined): number {
  if (value === undefined) return 0
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(255, Math.round(n)))
}

function parsePositionCanonical(value: string | undefined): { pan: number; tilt: number } {
  if (!value) return { pan: 0, tilt: 0 }
  const [panStr, tiltStr] = value.split(',')
  const pan = Number(panStr)
  const tilt = Number(tiltStr)
  return {
    pan: Number.isFinite(pan) ? pan : 0,
    tilt: Number.isFinite(tilt) ? tilt : 0,
  }
}

/**
 * Hook to get a slider property's current value
 */
export function useSliderValue(property: SliderPropertyDescriptor): number {
  const ctx = useEditorContext()
  const draftValue = usePresetDraftValue(property.name)

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels([property.channel], callback),
    [property.channel.universe, property.channel.channelNo]
  )

  const getSnapshot = useCallback(
    () => getChannelValue(property.channel),
    [property.channel.universe, property.channel.channelNo]
  )

  const liveValue = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  if (ctx.kind === 'preset') return parseSliderCanonical(draftValue)
  return liveValue
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

function computeCombinedCss(
  r: number,
  g: number,
  b: number,
  w: number | undefined,
  a: number | undefined,
  uv: number | undefined,
): string {
  let combinedR = r
  let combinedG = g
  let combinedB = b
  if (w !== undefined && w > 0) {
    const whiteFactor = w / 255
    combinedR = Math.min(255, combinedR + whiteFactor * (255 - combinedR))
    combinedG = Math.min(255, combinedG + whiteFactor * (255 - combinedG))
    combinedB = Math.min(255, combinedB + whiteFactor * (255 - combinedB))
  }
  if (a !== undefined && a > 0) {
    const amberFactor = a / 255
    combinedR = Math.min(255, combinedR + amberFactor * (255 - combinedR * 0.3))
    combinedG = Math.min(255, combinedG + amberFactor * (191 - combinedG * 0.5))
  }
  if (uv !== undefined && uv > 0) {
    const uvFactor = uv / 255
    combinedR = Math.min(255, combinedR + uvFactor * (139 - combinedR * 0.5))
    combinedG = Math.min(255, combinedG * (1 - uvFactor * 0.3))
    combinedB = Math.min(255, combinedB + uvFactor * (255 - combinedB * 0.3))
  }
  return `rgb(${Math.round(combinedR)}, ${Math.round(combinedG)}, ${Math.round(combinedB)})`
}

function parseColourFromDraft(
  property: ColourPropertyDescriptor,
  draftValue: string | undefined,
): ColourValueResult {
  if (!draftValue) {
    const zero: ColourValueResult = {
      r: 0,
      g: 0,
      b: 0,
      w: property.whiteChannel ? 0 : undefined,
      a: property.amberChannel ? 0 : undefined,
      uv: property.uvChannel ? 0 : undefined,
      css: 'rgb(0, 0, 0)',
      combinedCss: 'rgb(0, 0, 0)',
    }
    return zero
  }
  const ext = parseExtendedColour(draftValue)
  const { r, g, b } = hexToRgb(ext.hex)
  const w = property.whiteChannel ? ext.white : undefined
  const a = property.amberChannel ? ext.amber : undefined
  const uv = property.uvChannel ? ext.uv : undefined
  return {
    r,
    g,
    b,
    w,
    a,
    uv,
    css: `rgb(${r}, ${g}, ${b})`,
    combinedCss: computeCombinedCss(r, g, b, w, a, uv),
  }
}

/**
 * Hook to get a colour property's RGB values
 */
export function useColourValue(property: ColourPropertyDescriptor): ColourValueResult {
  const ctx = useEditorContext()
  const draftValue = usePresetDraftValue(property.name)
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
    const combinedCss = computeCombinedCss(r, g, b, w, a, uv)

    const result = { r, g, b, w, a, uv, css, combinedCss }
    cachedRef.current = result
    return result
  }, [property])

  const liveResult = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  if (ctx.kind === 'preset') return parseColourFromDraft(property, draftValue)
  return liveResult
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
  const ctx = useEditorContext()
  const draftValue = usePresetDraftValue(property.name)
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

  const liveResult = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  if (ctx.kind === 'preset') {
    const { pan, tilt } = parsePositionCanonical(draftValue)
    const panRange = property.panMax - property.panMin
    const tiltRange = property.tiltMax - property.tiltMin
    const panNormalized = panRange > 0 ? (pan - property.panMin) / panRange : 0.5
    const tiltNormalized = tiltRange > 0 ? (tilt - property.tiltMin) / tiltRange : 0.5
    return { pan, tilt, panNormalized, tiltNormalized }
  }
  return liveResult
}

type SettingValueResult = {
  level: number
  option?: SettingPropertyDescriptor['options'][number]
}

/**
 * Match a DMX level to its display option — scans from the highest-level option down
 * and picks the first one the level clears. Shared between fixture and group setting hooks.
 */
export function resolveSettingOption<O extends { level: number }>(
  options: O[],
  level: number,
): O {
  let matchedOption = options[0]
  for (let i = options.length - 1; i >= 0; i--) {
    if (level >= options[i].level) {
      matchedOption = options[i]
      break
    }
  }
  return matchedOption
}

/**
 * Hook to get a setting property's current option
 */
export function useSettingValue(property: SettingPropertyDescriptor): SettingValueResult {
  const ctx = useEditorContext()
  const draftValue = usePresetDraftValue(property.name)
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

    const result = { level, option: resolveSettingOption(property.options, level) }
    cachedRef.current = result
    return result
  }, [property])

  const liveResult = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  if (ctx.kind === 'preset') {
    const level = parseSliderCanonical(draftValue)
    return { level, option: resolveSettingOption(property.options, level) }
  }
  return liveResult
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
 * Hook to update a channel value. Routes through `cueEdit.setChannel` when the surrounding
 * [EditorContext] is `kind: 'cue'`, else writes direct to Layer 4. In `kind: 'preset'` mode
 * channel-level writes are a no-op — preset assignments are property-keyed, not channel-
 * keyed, and the synthetic fixture's channel refs don't map to real DMX anyway. Callers
 * authoring preset properties should use the property-level write hooks instead.
 */
export function useUpdateChannel() {
  const ctx = useEditorContext()
  return useCallback(
    (channel: ChannelRef, value: number) => {
      if (ctx.kind === 'cue') {
        lightingApi.cueEdit.send({
          type: 'cueEdit.setChannel',
          cueId: ctx.id,
          universe: channel.universe,
          channel: channel.channelNo,
          level: value,
        })
        return
      }
      if (ctx.kind === 'preset') return
      lightingApi.channels.update(channel.universe, channel.channelNo, value)
    },
    [ctx]
  )
}

/**
 * Update all colour channels of a fixture-level colour property. In cue mode RGB routes
 * through one `cueEdit.setProperty { rgbColour }` (the backend rejects R/G/B sub-channels);
 * W/A/UV stay on `setChannel`. In preset mode writes go to the local draft keyed by
 * `property.name`, with W/A/UV serialised into the extended-colour suffix. Mirrors
 * [useUpdateGroupColour].
 */
export function useUpdateFixtureColour(
  property: ColourPropertyDescriptor,
  fixtureKey: string | undefined,
) {
  const ctx = useEditorContext()
  const draft = usePresetDraft()
  return useCallback(
    (r: number, g: number, b: number, w?: number, a?: number, uv?: number) => {
      if (ctx.kind === 'cue' && fixtureKey) {
        lightingApi.cueEdit.send({
          type: 'cueEdit.setProperty',
          cueId: ctx.id,
          targetType: 'fixture',
          targetKey: fixtureKey,
          propertyName: 'rgbColour',
          value: rgbToHex(r, g, b),
        })
        if (property.whiteChannel && w !== undefined) {
          lightingApi.cueEdit.send({
            type: 'cueEdit.setChannel',
            cueId: ctx.id,
            universe: property.whiteChannel.universe,
            channel: property.whiteChannel.channelNo,
            level: w,
          })
        }
        if (property.amberChannel && a !== undefined) {
          lightingApi.cueEdit.send({
            type: 'cueEdit.setChannel',
            cueId: ctx.id,
            universe: property.amberChannel.universe,
            channel: property.amberChannel.channelNo,
            level: a,
          })
        }
        if (property.uvChannel && uv !== undefined) {
          lightingApi.cueEdit.send({
            type: 'cueEdit.setChannel',
            cueId: ctx.id,
            universe: property.uvChannel.universe,
            channel: property.uvChannel.channelNo,
            level: uv,
          })
        }
        return
      }
      if (ctx.kind === 'preset' && draft) {
        const value = serializeExtendedColour({
          hex: rgbToHex(r, g, b),
          white: property.whiteChannel ? w ?? 0 : 0,
          amber: property.amberChannel ? a ?? 0 : 0,
          uv: property.uvChannel ? uv ?? 0 : 0,
        })
        draft.onSetProperty(property.name, value)
        return
      }
      lightingApi.channels.update(property.redChannel.universe, property.redChannel.channelNo, r)
      lightingApi.channels.update(property.greenChannel.universe, property.greenChannel.channelNo, g)
      lightingApi.channels.update(property.blueChannel.universe, property.blueChannel.channelNo, b)
      if (property.whiteChannel && w !== undefined) {
        lightingApi.channels.update(property.whiteChannel.universe, property.whiteChannel.channelNo, w)
      }
      if (property.amberChannel && a !== undefined) {
        lightingApi.channels.update(property.amberChannel.universe, property.amberChannel.channelNo, a)
      }
      if (property.uvChannel && uv !== undefined) {
        lightingApi.channels.update(property.uvChannel.universe, property.uvChannel.channelNo, uv)
      }
    },
    [ctx, draft, fixtureKey, property]
  )
}

/**
 * Hook to get the colourPreview from a setting's current option (if it has one)
 */
export function useSettingColourPreview(property: SettingPropertyDescriptor): string | undefined {
  const { option } = useSettingValue(property)
  return option?.colourPreview
}
