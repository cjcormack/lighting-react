import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { lightingApi } from '../../api/lightingApi'
import { channelKey } from '../../hooks/usePropertyValues'
import { findDimmerProperty } from '../../store/fixtures'
import type { Fixture } from '../../store/fixtures'

const EMPTY_SET: ReadonlySet<string> = new Set()

/**
 * The set of fixture keys whose dimmer channel is above zero — drives the
 * "only lit" filter. One whole-map channel subscription for the entire rig
 * (not per-fixture), notifying React only when set *membership* changes, so
 * fades don't churn the row list. Fixtures without a dimmer property never
 * count as lit. Mount this hook only while the filter is on.
 */
export function useLitFixtureKeys(fixtures: readonly Fixture[]): ReadonlySet<string> {
  // dimmer channel key → fixture key
  const dimmerChannelToFixture = useMemo(() => {
    const map = new Map<string, string>()
    for (const fixture of fixtures) {
      const dimmer = findDimmerProperty(fixture.properties)
      if (dimmer) map.set(channelKey(dimmer.channel), fixture.key)
    }
    return map
  }, [fixtures])

  const cachedRef = useRef<ReadonlySet<string>>(EMPTY_SET)

  const subscribe = useCallback((callback: () => void) => {
    // Passing an empty fixture list is the "filter off" idle state — skip the
    // whole-map subscription entirely.
    if (dimmerChannelToFixture.size === 0) return () => undefined
    const subscription = lightingApi.channels.subscribe((updates) => {
      for (const key of updates.keys()) {
        if (dimmerChannelToFixture.has(key)) {
          callback()
          return
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [dimmerChannelToFixture])

  const getSnapshot = useCallback((): ReadonlySet<string> => {
    const all = lightingApi.channels.getAll()
    const lit = new Set<string>()
    for (const [chKey, fixtureKey] of dimmerChannelToFixture) {
      if ((all.get(chKey) ?? 0) > 0) lit.add(fixtureKey)
    }
    const cached = cachedRef.current
    if (cached.size === lit.size && [...lit].every((key) => cached.has(key))) {
      return cached
    }
    cachedRef.current = lit
    return lit
  }, [dimmerChannelToFixture])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
