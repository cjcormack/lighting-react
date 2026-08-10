import { useCallback, useEffect, useRef, useState } from 'react'
import { lightingApi } from '../../api/lightingApi'
import { channelKey } from '../../hooks/usePropertyValues'
import { resolveTargetCells } from './rowModel'
import type { ChannelRef } from '../../store/fixtures'
import type { WriteTarget } from './rowModel'

/**
 * Momentary Highlight: while held, every selected target's dimmer goes to
 * full; on release the captured values are written back. Dimmer lookup goes
 * through resolveTargetCells, so it lifts exactly the channels the Dimmer
 * column shows (parent master first, else per-element dimmers); targets with
 * no dimmer anywhere are skipped, and `isActive` stays false when nothing was
 * captured so the button never claims a no-op did something. Live context
 * only — this is a stage tool, not an editing operation.
 *
 * Kept deliberately simple: values that change underneath during the hold
 * (an FX engine, another operator) are clobbered by the snapshot restore,
 * which is acceptable for a momentary tool. The selection is captured at
 * press time — changing it mid-hold doesn't re-capture; we restore exactly
 * what we highlighted.
 */
export function useHighlight(getTargets: () => WriteTarget[]) {
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
    for (const target of getTargets()) {
      for (const { resolution } of resolveTargetCells(target, 'dimmer')) {
        if (resolution.kind !== 'slider') continue
        const ref = resolution.property.channel
        const key = channelKey(ref)
        if (captured.has(key)) continue
        captured.set(key, { ref, value: lightingApi.channels.get(ref.universe, ref.channelNo) })
        lightingApi.channels.update(ref.universe, ref.channelNo, 255)
      }
    }
    capturedRef.current = captured
    setIsActive(captured.size > 0)
  }, [getTargets])

  // Restore on unmount so navigating away mid-hold doesn't strand the rig at full.
  useEffect(() => release, [release])

  return { press, release, isActive }
}
