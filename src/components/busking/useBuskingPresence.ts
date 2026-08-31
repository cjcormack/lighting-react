import { useCallback } from 'react'
import { lightingApi } from '@/api/lightingApi'
import { parseProgrammerValue } from '@/lib/programmerValue'
import { useFixtureListQuery } from '@/store/fixtures'
import { useProgrammerLayersQuery } from '@/store/programmer'
import type { LookSummary } from '@/api/looksApi'
import { groupMemberFixtures } from '@/lib/fxTargetProperties'
import {
  hasEffect,
  lookLayerTarget,
  normalizeEffectName,
  type BuskingTarget,
  type EffectPresence,
  type PropertyButton,
  type TargetEffectsData,
} from './buskingTypes'
import { lookLayerPresence } from './lookPresence'

/**
 * Whether a pad is lit, for each of the three kinds of pad — and they read three different sources.
 *
 * An effect pad reads the FX list, a property pad reads the **programmer**, and a Look pad reads the
 * programmer's **layer stack**. That is not inconsistency: a plain static value stopped being a
 * `StaticValue` instance when the programmer landed, and a Look made purely of static rows spawns no
 * effect to find, so neither can be answered from the effect list at all.
 */
export function useBuskingPresence() {
  const { data: fixtureList } = useFixtureListQuery()
  const { data: programmerLayers } = useProgrammerLayersQuery()

  /**
   * Fixture keys a busking target writes to. A group write is fanned out by the backend and
   * stored per member (with `sourceGroup` recorded), so reading a group's state means reading
   * its members'.
   */
  const targetFixtureKeys = useCallback(
    (target: BuskingTarget): string[] => {
      if (target.type === 'fixture') return [target.key]
      return groupMemberFixtures(fixtureList, target.name).map((f) => f.key)
    },
    [fixtureList],
  )

  /**
   * The programmer entry a property pad represents on one target, if it holds one.
   *
   * Only entries the *pad* could have made count — those whose winning owner is `web`. A
   * property held by a Locate, a Look toggle or a MIDI fader is somebody else's, and
   * treating it as the pad's would light the pad and, worse, arm its off-tap: `clearEntry`
   * releases **every** owner on the property, so tapping a pad that looked lit because of a
   * Locate would silently drop the Locate too.
   */
  const programmerEntryFor = useCallback(
    (target: BuskingTarget, propertyName: string) => {
      for (const key of targetFixtureKeys(target)) {
        const entry = lightingApi.programmer.getKeyState(key, propertyName).entry
        if (entry?.owner === 'web') return entry
      }
      return undefined
    },
    [targetFixtureKeys],
  )

  /** Effect-pad presence, from the active-effect list on each selected target. */
  const computePresence = useCallback(
    (effectName: string, targetEffectsData: TargetEffectsData[]): EffectPresence => {
      const normalized = normalizeEffectName(effectName)
      return countPresence(targetEffectsData, (data) => hasEffect(data, normalized))
    },
    [],
  )

  /**
   * Property-pad presence, read from the programmer rather than from the FX list.
   *
   * Plain static values stopped being `StaticValue` / `StaticSetting` effect instances when
   * the programmer landed: the pad has no blend-mode or distribution controls, so every write
   * it makes is the "plain case" the redesign moves to programmer values (§5.7). Blend-mode
   * and distributed statics still exist as effects — created from scripts, cues, or the
   * effect configuration sheet — and are untouched by this.
   */
  const computePropertyPresence = useCallback(
    (button: PropertyButton, targetEffectsData: TargetEffectsData[]): EffectPresence =>
      countPresence(targetEffectsData, (data) =>
        Boolean(programmerEntryFor(data.target, button.propertyName)),
      ),
    [programmerEntryFor],
  )

  /** The level a property pad is currently holding, from the first target that has one. */
  const getActivePropertyValue = useCallback(
    (button: PropertyButton, targetEffectsData: TargetEffectsData[]): string | null => {
      for (const data of targetEffectsData) {
        const entry = programmerEntryFor(data.target, button.propertyName)
        if (!entry) continue
        const parsed = parseProgrammerValue(entry.value)
        // Pads are scalar; a colour or position entry on the same property isn't one of ours.
        return parsed?.kind === 'level' ? String(parsed.value) : null
      }
      return null
    },
    [programmerEntryFor],
  )

  /**
   * Whether a Look is on, from the programmer's **layer stack** rather than the effect list.
   *
   * A tap adds or removes a layer (the toggle route is `programmerLayerStack.toggle`), so the stack
   * is what the ring should read — and it is the only thing that can answer for a Look made purely
   * of static rows, which spawns no effect to find. The rule itself lives in `lookLayerPresence`,
   * unit-tested there; this only maps the pad's targets onto the layer target shape, with the same
   * group-name convention `applyLook` sends.
   */
  const computeLookPresence = useCallback(
    (look: LookSummary, targetEffectsData: TargetEffectsData[]): EffectPresence =>
      lookLayerPresence(
        programmerLayers ?? [],
        targetEffectsData.map((data) => lookLayerTarget(data.target)),
        look.id,
      ),
    [programmerLayers],
  )

  return {
    computePresence,
    computePropertyPresence,
    getActivePropertyValue,
    computeLookPresence,
  }
}

/** `all` / `some` / `none` over the selected targets, given a per-target test. */
function countPresence(
  targetEffectsData: TargetEffectsData[],
  isActive: (data: TargetEffectsData) => boolean,
): EffectPresence {
  if (targetEffectsData.length === 0) return 'none'
  const activeCount = targetEffectsData.filter(isActive).length
  if (activeCount === 0) return 'none'
  if (activeCount === targetEffectsData.length) return 'all'
  return 'some'
}
