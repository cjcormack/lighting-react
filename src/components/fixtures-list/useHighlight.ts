import { useCallback, useEffect, useRef, useState } from 'react'
import { lightingApi } from '../../api/lightingApi'
import { channelKey } from '../../hooks/usePropertyValues'
import { findDimmerProperty } from '../../store/fixtures'
import type { ChannelRef, Fixture } from '../../store/fixtures'

/**
 * Momentary Highlight: while held, every selected fixture's dimmer goes to
 * full; on release the captured values are written back. Live context only —
 * this is a stage tool, not an editing operation.
 *
 * Kept deliberately simple: values that change underneath during the hold
 * (an FX engine, another operator) are clobbered by the snapshot restore,
 * which is acceptable for a momentary tool. The selection is captured at
 * press time — changing it mid-hold doesn't re-capture; we restore exactly
 * what we highlighted.
 */
export function useHighlight(getSelectedFixtures: () => Fixture[]) {
  const capturedRef = useRef<Map<string, { ref: ChannelRef; value: number }> | null>(null)
  const [isActive, setIsActive] = useState(false)

  const release = useCallback(() => {
    const captured = capturedRef.current
    capturedRef.current = null
    setIsActive(false)
    if (!captured) return
    for (const { ref, value } of captured.values()) {
      lightingApi.channels.update(ref.universe, ref.channelNo, value)
    }
  }, [])

  const press = useCallback(() => {
    if (capturedRef.current) return
    const captured = new Map<string, { ref: ChannelRef; value: number }>()
    for (const fixture of getSelectedFixtures()) {
      const dimmer = findDimmerProperty(fixture.properties)
      if (!dimmer) continue
      const ref = dimmer.channel
      const key = channelKey(ref)
      if (captured.has(key)) continue
      captured.set(key, { ref, value: lightingApi.channels.get(ref.universe, ref.channelNo) })
      lightingApi.channels.update(ref.universe, ref.channelNo, 255)
    }
    capturedRef.current = captured
    setIsActive(true)
  }, [getSelectedFixtures])

  // Restore on unmount so navigating away mid-hold doesn't strand the rig at full.
  useEffect(() => release, [release])

  return { press, release, isActive }
}
