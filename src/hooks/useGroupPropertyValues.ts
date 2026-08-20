import { useRef, useMemo, useSyncExternalStore, useCallback } from 'react'
import { lightingApi } from '../api/lightingApi'
import { useEditorContext } from '../components/lighting-editor/EditorContext'
import { usePresetDraft } from '../components/presets/PresetDraftContext'
import { rgbToHex, serializeExtendedColour } from '../components/fx/colourUtils'
import { getChannelValue, resolveSettingOption, subscribeToChannels } from './usePropertyValues'
import { useChannelSource } from './useChannelSource'
import { colourFactor } from './useNormalizedIntensity'
import { foldChannels } from '../lib/colourMath'
import { serializeLevel } from '../lib/programmerValue'
import { outputChannelSource, type ChannelSource } from '../api/channelSource'
import type { ChannelRef } from '../store/fixtures'
import type {
  GroupSliderPropertyDescriptor,
  GroupColourPropertyDescriptor,
  GroupPositionPropertyDescriptor,
  GroupSettingPropertyDescriptor,
} from '../api/groupsApi'

// Group writes persist as per-fixture rows in cue mode — GroupPropertyDescriptor doesn't
// carry the group name, so we can't emit a group-level setProperty from here.
function cueEditWriteChannel(cueId: number, universe: number, channelNo: number, value: number) {
  lightingApi.cueEdit.send({
    type: 'cueEdit.setChannel',
    cueId,
    universe,
    channel: channelNo,
    level: value,
  })
}

// `channelKey` / `getChannelValue` / `subscribeToChannels` used to be private copies here.
// They now come from usePropertyValues, so there is one place to thread a ChannelSource
// through rather than three.

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
  const source = useChannelSource()

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(property.memberChannels, callback, source),
    [property.memberChannels, source]
  )

  const getSnapshot = useCallback((): GroupSliderValueResult => {
    // Wrapped rather than point-free: `getChannelValue` takes an optional source second and
    // `map` would hand it the array index.
    const values = property.memberChannels.map((ch) => getChannelValue(ch, source))

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
  }, [property.memberChannels, source])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook to update all slider channels in a group to the same value.
 *
 * Pass [groupName] for a real backend group: the write then goes out as a single
 * group-targeted programmer op, and the backend fans it to members *and* records
 * `sourceGroup` on each entry so the programmer sheet can show where the value came from.
 *
 * Without it — the element-group controls inside a multi-head fixture, which are a
 * client-side grouping the backend has no name for — the write falls back to one raw channel
 * update per member. Those still reach the programmer through the compatibility shim; this
 * descriptor is the one group shape that carries no per-member fixture key, so there is no
 * property-level middle ground.
 */
export function useUpdateGroupSlider(
  property: GroupSliderPropertyDescriptor,
  groupName?: string,
) {
  const ctx = useEditorContext()
  const draft = usePresetDraft()
  return useCallback(
    (value: number) => {
      if (ctx.kind === 'cue') {
        for (const ch of property.memberChannels) {
          cueEditWriteChannel(ctx.id, ch.universe, ch.channelNo, value)
        }
        return
      }
      if (ctx.kind === 'preset' && draft) {
        draft.onSetProperty(property.name, String(value))
        return
      }
      if (groupName) {
        lightingApi.programmer.set('group', groupName, property.name, serializeLevel(value))
        return
      }
      property.memberChannels.forEach((channel) => {
        lightingApi.channels.update(channel.universe, channel.channelNo, value)
      })
    },
    [ctx, draft, groupName, property.memberChannels, property.name]
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
  // Aggregate beam representation for the single stage beam over all elements:
  // intensity-weighted hue (saturation-preserving — a plain RGB average of a
  // red+blue bar muddies to grey) + peak-blended level (a plain mean makes one
  // bright pixel on a dark bar near-invisible). 0..255 hue, 0..1 level.
  beamR: number
  beamG: number
  beamB: number
  beamIntensity: number
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
 * Pure computation behind [useGroupColourValues] — reads live DMX for every
 * member and returns per-member colours plus the aggregate beam hue/level.
 * Exported so the 3D stage can recompute the same values imperatively from its
 * channel subscription, bypassing React render/effect on the hot path.
 *
 * `source` defaults to the wire; the stage views pass the source their vis-source
 * selection resolved to.
 */
export function computeGroupColourValues(
  property: GroupColourPropertyDescriptor,
  source: ChannelSource = outputChannelSource
): GroupColourValueResult {
  const members = property.memberColourChannels.map((m) => ({
    fixtureKey: m.fixtureKey,
    r: getChannelValue(m.redChannel, source),
    g: getChannelValue(m.greenChannel, source),
    b: getChannelValue(m.blueChannel, source),
    w: m.whiteChannel ? getChannelValue(m.whiteChannel, source) : undefined,
    a: m.amberChannel ? getChannelValue(m.amberChannel, source) : undefined,
    uv: m.uvChannel ? getChannelValue(m.uvChannel, source) : undefined,
  }))

  if (members.length === 0) {
    return {
      isUniform: true,
      displayText: 'No members',
      avgR: 0,
      avgG: 0,
      avgB: 0,
      combinedCss: 'rgb(0, 0, 0)',
      beamR: 0,
      beamG: 0,
      beamB: 0,
      beamIntensity: 0,
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

  // Aggregate beam: intensity-weight each pixel's hue by its own brightness
  // (iₖ = brightest emitter / 255, counting white/amber/UV) so bright pixels
  // dominate and dim ones don't drag toward grey. The hue is folded first so an
  // amber/UV-only bar contributes its warm/violet colour to the beam instead of
  // reading as black. Level blends mean with peak so a sparse-but-bright bar
  // still throws a visible beam.
  let weight = 0
  let peak = 0
  let wr = 0
  let wg = 0
  let wb = 0
  for (const m of members) {
    const ik = colourFactor(m.r, m.g, m.b, m.w, m.a, m.uv)
    weight += ik
    if (ik > peak) peak = ik
    const f = foldChannels(m.r, m.g, m.b, m.w, m.a, m.uv)
    wr += ik * f.r
    wg += ik * f.g
    wb += ik * f.b
  }
  const lit = weight > 1e-4
  const beamR = lit ? Math.round(wr / weight) : 0
  const beamG = lit ? Math.round(wg / weight) : 0
  const beamB = lit ? Math.round(wb / weight) : 0
  const beamIntensity = lit ? Math.max(weight / members.length, peak * 0.6) : 0

  return {
    isUniform,
    displayText,
    avgR,
    avgG,
    avgB,
    avgW,
    avgA,
    avgUv,
    combinedCss,
    beamR,
    beamG,
    beamB,
    beamIntensity,
    members,
  }
}

/**
 * Hook to get aggregated colour values from all group members.
 */
export function useGroupColourValues(
  property: GroupColourPropertyDescriptor
): GroupColourValueResult {
  const cachedRef = useRef<GroupColourValueResult | null>(null)
  const source = useChannelSource()

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
    (callback: () => void) => subscribeToChannels(allChannels, callback, source),
    [allChannels, source]
  )

  const getSnapshot = useCallback((): GroupColourValueResult => {
    const result = computeGroupColourValues(property, source)

    // Return the cached object identity when nothing observable changed, so
    // useSyncExternalStore doesn't re-render on equal-but-fresh snapshots.
    const cached = cachedRef.current
    if (
      cached &&
      cached.avgR === result.avgR &&
      cached.avgG === result.avgG &&
      cached.avgB === result.avgB &&
      cached.avgW === result.avgW &&
      cached.avgA === result.avgA &&
      cached.avgUv === result.avgUv &&
      cached.isUniform === result.isUniform &&
      cached.beamR === result.beamR &&
      cached.beamG === result.beamG &&
      cached.beamB === result.beamB &&
      cached.beamIntensity === result.beamIntensity
    ) {
      return cached
    }

    cachedRef.current = result
    return result
  }, [property, source])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook to update all colour channels in a group to the same values.
 *
 * In cue mode the backend rejects setChannel on R/G/B (they're sub-channels of rgbColour), so
 * we send one setProperty per fixture for RGB and fall through to setChannel for W/A/UV.
 */
export function useUpdateGroupColour(
  property: GroupColourPropertyDescriptor,
  groupName?: string,
) {
  const ctx = useEditorContext()
  const draft = usePresetDraft()
  return useCallback(
    (r: number, g: number, b: number, w?: number, a?: number, uv?: number) => {
      if (ctx.kind === 'cue') {
        const hex = rgbToHex(r, g, b)
        for (const m of property.memberColourChannels) {
          lightingApi.cueEdit.send({
            type: 'cueEdit.setProperty',
            cueId: ctx.id,
            targetType: 'fixture',
            targetKey: m.fixtureKey,
            propertyName: 'rgbColour',
            value: hex,
          })
          if (m.whiteChannel && w !== undefined) {
            cueEditWriteChannel(ctx.id, m.whiteChannel.universe, m.whiteChannel.channelNo, w)
          }
          if (m.amberChannel && a !== undefined) {
            cueEditWriteChannel(ctx.id, m.amberChannel.universe, m.amberChannel.channelNo, a)
          }
          if (m.uvChannel && uv !== undefined) {
            cueEditWriteChannel(ctx.id, m.uvChannel.universe, m.uvChannel.channelNo, uv)
          }
        }
        return
      }
      if (ctx.kind === 'preset' && draft) {
        const hasWhite = property.memberColourChannels.some((m) => m.whiteChannel)
        const hasAmber = property.memberColourChannels.some((m) => m.amberChannel)
        const hasUv = property.memberColourChannels.some((m) => m.uvChannel)
        const value = serializeExtendedColour({
          hex: rgbToHex(r, g, b),
          white: hasWhite ? w ?? 0 : 0,
          amber: hasAmber ? a ?? 0 : 0,
          uv: hasUv ? uv ?? 0 : 0,
        })
        draft.onSetProperty(property.name, value)
        return
      }
      if (groupName) {
        lightingApi.programmer.setColour('group', groupName, property.name, { r, g, b, w, a, uv })
        return
      }
      property.memberColourChannels.forEach((m) => {
        // One entry per member covering the whole colour: only send the extended components
        // the member actually has a channel for, so a fixture without a white channel isn't
        // handed a white it can't render.
        lightingApi.programmer.setColour('fixture', m.fixtureKey, property.name, {
          r,
          g,
          b,
          w: m.whiteChannel ? w : undefined,
          a: m.amberChannel ? a : undefined,
          uv: m.uvChannel ? uv : undefined,
        })
      })
    },
    [ctx, draft, groupName, property.memberColourChannels, property.name]
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
  const source = useChannelSource()

  const allChannels = useMemo(() => {
    const channels: ChannelRef[] = []
    property.memberPositionChannels.forEach((m) => {
      channels.push(m.panChannel, m.tiltChannel)
    })
    return channels
  }, [property.memberPositionChannels])

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(allChannels, callback, source),
    [allChannels, source]
  )

  const getSnapshot = useCallback((): GroupPositionValueResult => {
    const members = property.memberPositionChannels.map((m) => ({
      fixtureKey: m.fixtureKey,
      pan: getChannelValue(m.panChannel, source),
      tilt: getChannelValue(m.tiltChannel, source),
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
  }, [property.memberPositionChannels, source])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook to update all position channels in a group to the same values.
 *
 * See [useUpdateGroupSlider] for what [groupName] buys. Without it the members are still
 * written at property level, one `setPosition` each — the descriptor carries a fixture key
 * per member, so an element group inside a multi-head fixture stays property-shaped.
 */
export function useUpdateGroupPosition(
  property: GroupPositionPropertyDescriptor,
  groupName?: string,
) {
  const ctx = useEditorContext()
  const draft = usePresetDraft()
  return useCallback(
    (pan: number, tilt: number) => {
      if (ctx.kind === 'cue') {
        const value = `${pan},${tilt}`
        for (const m of property.memberPositionChannels) {
          lightingApi.cueEdit.send({
            type: 'cueEdit.setProperty',
            cueId: ctx.id,
            targetType: 'fixture',
            targetKey: m.fixtureKey,
            propertyName: 'position',
            value,
          })
        }
        return
      }
      if (ctx.kind === 'preset' && draft) {
        draft.onSetProperty(property.name, `${pan},${tilt}`)
        return
      }
      if (groupName) {
        lightingApi.programmer.setPosition('group', groupName, Math.round(pan), Math.round(tilt))
        return
      }
      property.memberPositionChannels.forEach((m) => {
        lightingApi.programmer.setPosition(
          'fixture',
          m.fixtureKey,
          Math.round(pan),
          Math.round(tilt),
        )
      })
    },
    [ctx, draft, groupName, property.memberPositionChannels, property.name]
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
  const source = useChannelSource()

  const allChannels = useMemo(
    () => property.memberChannels.map((m) => m.channel),
    [property.memberChannels]
  )

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(allChannels, callback, source),
    [allChannels, source]
  )

  const getSnapshot = useCallback((): GroupSettingValueResult => {
    const values = property.memberChannels.map((m) => getChannelValue(m.channel, source))

    if (values.length === 0) {
      return {
        isUniform: true,
        displayText: 'No members',
        values: [],
      }
    }

    const isUniform = values.every((v) => v === values[0])

    const currentOption = isUniform
      ? resolveSettingOption(property.options, values[0])
      : property.options[0]

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
  }, [property.memberChannels, property.options, source])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook to update all setting channels in a group to the same value.
 */
export function useUpdateGroupSetting(
  property: GroupSettingPropertyDescriptor,
  groupName?: string,
) {
  const ctx = useEditorContext()
  const draft = usePresetDraft()
  return useCallback(
    (level: number) => {
      if (ctx.kind === 'cue') {
        for (const m of property.memberChannels) {
          cueEditWriteChannel(ctx.id, m.channel.universe, m.channel.channelNo, level)
        }
        return
      }
      if (ctx.kind === 'preset' && draft) {
        draft.onSetProperty(property.name, String(level))
        return
      }
      if (groupName) {
        lightingApi.programmer.set('group', groupName, property.name, serializeLevel(level))
        return
      }
      property.memberChannels.forEach((m) => {
        lightingApi.programmer.set('fixture', m.fixtureKey, property.name, serializeLevel(level))
      })
    },
    [ctx, draft, groupName, property.memberChannels, property.name]
  )
}
