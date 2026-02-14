import { useRef, useMemo, useSyncExternalStore, useCallback } from 'react'
import { lightingApi } from '../api/lightingApi'
import type { ChannelRef, ColourPropertyDescriptor } from '../store/fixtures'
import type { GroupColourPropertyDescriptor } from '../api/groupsApi'

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

export type VirtualDimmerResult = {
  value: number
  percentage: number
  setValue: (newValue: number) => void
}

/**
 * Virtual dimmer for fixtures with colour but no dedicated dimmer channel.
 *
 * Reading: dimmer = max(R, G, B)
 * Writing: scales all RGB channels proportionally by newValue / oldMax.
 * Stores last-known colour ratios so raising from 0 restores the hue.
 */
export function useVirtualDimmer(
  colourProp: ColourPropertyDescriptor
): VirtualDimmerResult {
  // Store colour ratios for restoring hue when raising from zero
  const lastRatiosRef = useRef<{ r: number; g: number; b: number }>({
    r: 1 / 3,
    g: 1 / 3,
    b: 1 / 3,
  })

  const channels = useMemo(
    () => [colourProp.redChannel, colourProp.greenChannel, colourProp.blueChannel],
    [colourProp.redChannel, colourProp.greenChannel, colourProp.blueChannel]
  )

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(channels, callback),
    [channels]
  )

  const cachedRef = useRef<{ value: number; percentage: number } | null>(null)

  const getSnapshot = useCallback((): { value: number; percentage: number } => {
    const r = getChannelValue(colourProp.redChannel)
    const g = getChannelValue(colourProp.greenChannel)
    const b = getChannelValue(colourProp.blueChannel)
    const value = Math.max(r, g, b)

    // Update stored ratios whenever we have a non-zero colour
    if (value > 0) {
      lastRatiosRef.current = { r: r / value, g: g / value, b: b / value }
    }

    const cached = cachedRef.current
    if (cached && cached.value === value) {
      return cached
    }

    const result = { value, percentage: Math.round((value / 255) * 100) }
    cachedRef.current = result
    return result
  }, [colourProp.redChannel, colourProp.greenChannel, colourProp.blueChannel])

  const { value, percentage } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setValue = useCallback(
    (newValue: number) => {
      const clamped = Math.max(0, Math.min(255, Math.round(newValue)))

      // Read current RGB to compute ratios
      const r = getChannelValue(colourProp.redChannel)
      const g = getChannelValue(colourProp.greenChannel)
      const b = getChannelValue(colourProp.blueChannel)
      const oldMax = Math.max(r, g, b)

      let newR: number, newG: number, newB: number

      if (oldMax > 0) {
        // Scale proportionally
        const scale = clamped / oldMax
        newR = Math.round(r * scale)
        newG = Math.round(g * scale)
        newB = Math.round(b * scale)
      } else {
        // Colour is 0,0,0 — use stored ratios to restore hue
        const ratios = lastRatiosRef.current
        newR = Math.round(ratios.r * clamped)
        newG = Math.round(ratios.g * clamped)
        newB = Math.round(ratios.b * clamped)
      }

      lightingApi.channels.update(colourProp.redChannel.universe, colourProp.redChannel.channelNo, Math.min(255, newR))
      lightingApi.channels.update(colourProp.greenChannel.universe, colourProp.greenChannel.channelNo, Math.min(255, newG))
      lightingApi.channels.update(colourProp.blueChannel.universe, colourProp.blueChannel.channelNo, Math.min(255, newB))
    },
    [colourProp.redChannel, colourProp.greenChannel, colourProp.blueChannel]
  )

  return { value, percentage, setValue }
}

// === Group Virtual Dimmer ===

export type GroupVirtualDimmerResult = {
  min: number
  max: number
  isUniform: boolean
  displayText: string
  setValue: (newValue: number) => void
}

/**
 * Virtual dimmer for a group colour property — aggregates max(R,G,B) per member.
 *
 * Reading: per-member dimmer = max(R, G, B); aggregated as min/max across members.
 * Writing: scales each member's RGB proportionally.
 */
export function useGroupVirtualDimmer(
  colourProp: GroupColourPropertyDescriptor
): GroupVirtualDimmerResult {
  // Store per-member colour ratios for restoring hue when raising from zero
  const lastRatiosRef = useRef<Map<string, { r: number; g: number; b: number }>>(new Map())

  const allChannels = useMemo(() => {
    const channels: ChannelRef[] = []
    colourProp.memberColourChannels.forEach((m) => {
      channels.push(m.redChannel, m.greenChannel, m.blueChannel)
    })
    return channels
  }, [colourProp.memberColourChannels])

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(allChannels, callback),
    [allChannels]
  )

  const cachedRef = useRef<Omit<GroupVirtualDimmerResult, 'setValue'> | null>(null)

  const getSnapshot = useCallback((): Omit<GroupVirtualDimmerResult, 'setValue'> => {
    const memberDimmers: number[] = []

    for (const m of colourProp.memberColourChannels) {
      const r = getChannelValue(m.redChannel)
      const g = getChannelValue(m.greenChannel)
      const b = getChannelValue(m.blueChannel)
      const dimmer = Math.max(r, g, b)
      memberDimmers.push(dimmer)

      // Store ratios for non-zero colours
      if (dimmer > 0) {
        lastRatiosRef.current.set(m.fixtureKey, {
          r: r / dimmer,
          g: g / dimmer,
          b: b / dimmer,
        })
      }
    }

    if (memberDimmers.length === 0) {
      return { min: 0, max: 0, isUniform: true, displayText: '0%' }
    }

    const min = Math.min(...memberDimmers)
    const max = Math.max(...memberDimmers)
    const isUniform = min === max

    const cached = cachedRef.current
    if (cached && cached.min === min && cached.max === max) {
      return cached
    }

    const minPct = Math.round((min / 255) * 100)
    const maxPct = Math.round((max / 255) * 100)
    const displayText = isUniform ? `${minPct}%` : `${minPct}-${maxPct}%`

    const result = { min, max, isUniform, displayText }
    cachedRef.current = result
    return result
  }, [colourProp.memberColourChannels])

  const { min, max, isUniform, displayText } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  )

  const setValue = useCallback(
    (newValue: number) => {
      const clamped = Math.max(0, Math.min(255, Math.round(newValue)))

      for (const m of colourProp.memberColourChannels) {
        const r = getChannelValue(m.redChannel)
        const g = getChannelValue(m.greenChannel)
        const b = getChannelValue(m.blueChannel)
        const oldMax = Math.max(r, g, b)

        let newR: number, newG: number, newB: number

        if (oldMax > 0) {
          const scale = clamped / oldMax
          newR = Math.round(r * scale)
          newG = Math.round(g * scale)
          newB = Math.round(b * scale)
        } else {
          // Use stored ratios or default to white
          const ratios = lastRatiosRef.current.get(m.fixtureKey) ?? {
            r: 1 / 3,
            g: 1 / 3,
            b: 1 / 3,
          }
          newR = Math.round(ratios.r * clamped)
          newG = Math.round(ratios.g * clamped)
          newB = Math.round(ratios.b * clamped)
        }

        lightingApi.channels.update(m.redChannel.universe, m.redChannel.channelNo, Math.min(255, newR))
        lightingApi.channels.update(m.greenChannel.universe, m.greenChannel.channelNo, Math.min(255, newG))
        lightingApi.channels.update(m.blueChannel.universe, m.blueChannel.channelNo, Math.min(255, newB))
      }
    },
    [colourProp.memberColourChannels]
  )

  return { min, max, isUniform, displayText, setValue }
}
