import { useState, useMemo, useCallback } from 'react'
import { useEffectLibraryQuery, useAddFixtureFxMutation, useRemoveFxMutation } from '@/store/fixtureFx'
import { useApplyGroupFxMutation, useRemoveGroupFxMutation } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import { useCurrentProjectQuery } from '@/store/projects'
import { useToggleLookMutation } from '@/store/looks'
import type { SettingPropertyDescriptor, SliderPropertyDescriptor } from '@/store/fixtures'
import type { EffectLibraryEntry, FixtureDirectEffect } from '@/store/fixtureFx'
import type { GroupActiveEffect, BlendMode, DistributionStrategy, EffectType, ElementMode } from '@/api/groupsApi'
import type { LookSummary, ToggleLookTarget } from '@/api/looksApi'
import { ignoreReportedError } from '@/store/errorToastMiddleware'
import { lightingApi } from '@/api/lightingApi'
import { programmerClearEntry, programmerSet } from '@/store/programmer'
import { parseProgrammerValue, serializeLevel } from '@/lib/programmerValue'
import type { ProgrammerTargetType } from '@/store/programmer'
import {
  type BuskingTarget,
  type PropertyButton,
  type EffectPresence,
  type ActiveEffectContext,
  targetKey,
  normalizeEffectName,
} from './buskingTypes'

/** A busking target as the programmer addresses it. */
function programmerTarget(target: BuskingTarget): {
  targetType: ProgrammerTargetType
  targetKey: string
} {
  return target.type === 'group'
    ? { targetType: 'group', targetKey: target.name }
    : { targetType: 'fixture', targetKey: target.key }
}

export interface TargetEffectsData {
  key: string
  target: BuskingTarget
  groupEffects?: GroupActiveEffect[]
  fixtureDirectEffects?: FixtureDirectEffect[]
}

export function useBuskingState() {
  const [selectedTargets, setSelectedTargets] = useState<Map<string, BuskingTarget>>(new Map())
  const [defaultBeatDivision, setDefaultBeatDivision] = useState(1.0)
  // Pad-wide default master (uuid; null → master 1). One-tap applies and the configure
  // sheet's starting value both take it, so a busk can be pinned to M2 wholesale.
  const [defaultSpeedMasterUuid, setDefaultSpeedMasterUuid] = useState<string | null>(null)
  const [editingEffect, setEditingEffect] = useState<ActiveEffectContext | null>(null)

  const { data: library } = useEffectLibraryQuery()
  const { data: fixtureList } = useFixtureListQuery()
  const { data: currentProject } = useCurrentProjectQuery()

  const [addFixtureFx] = useAddFixtureFxMutation()
  const [removeFx] = useRemoveFxMutation()
  const [applyGroupFx] = useApplyGroupFxMutation()
  const [removeGroupFx] = useRemoveGroupFxMutation()
  const [toggleLookMutation] = useToggleLookMutation()

  const selectTarget = useCallback((target: BuskingTarget) => {
    setSelectedTargets(new Map([[targetKey(target), target]]))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedTargets(new Map())
  }, [])

  const toggleTarget = useCallback((target: BuskingTarget) => {
    setSelectedTargets((prev) => {
      const next = new Map(prev)
      const key = targetKey(target)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, target)
      }
      return next
    })
  }, [])

  // Collect all property names across selected targets
  const allPropertyNames = useMemo(() => {
    const names = new Set<string>()
    let hasSetting = false
    let hasExtraSlider = false
    const isExtraSlider = (p: { type: string; category: string }) =>
      p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv'
    for (const target of selectedTargets.values()) {
      if (target.type === 'group') {
        target.group.capabilities.forEach((c) => names.add(c))
        // Also check member fixture properties for multi-head support
        if (fixtureList) {
          const members = fixtureList.filter((f) => f.groups.includes(target.name))
          for (const fixture of members) {
            fixture.properties?.forEach((p) => names.add(p.name))
            fixture.elementGroupProperties?.forEach((p) => names.add(p.name))
            if (fixture.properties?.some((p) => p.type === 'setting')) hasSetting = true
            if (fixture.properties?.some(isExtraSlider)) hasExtraSlider = true
          }
        }
      } else {
        target.fixture.properties?.forEach((p) => names.add(p.name))
        target.fixture.elementGroupProperties?.forEach((p) => names.add(p.name))
        if (target.fixture.properties?.some((p) => p.type === 'setting')) hasSetting = true
        if (target.fixture.properties?.some(isExtraSlider)) hasExtraSlider = true
      }
    }
    if (hasSetting) names.add('setting')
    if (hasExtraSlider) names.add('slider')
    return names
  }, [selectedTargets, fixtureList])

  // Filter library by compatible effects for the union of selected targets
  const compatibleEffects = useMemo(() => {
    if (!library || selectedTargets.size === 0) return []
    return library.filter((effect) =>
      effect.compatibleProperties.some((propName) => allPropertyNames.has(propName)),
    )
  }, [library, allPropertyNames, selectedTargets.size])

  // Group by category, filtering out controls (shown as property buttons instead)
  const effectsByCategory = useMemo(() => {
    const grouped: Record<string, EffectLibraryEntry[]> = {}
    for (const effect of compatibleEffects) {
      // Skip controls category — rendered as property buttons in the Controls tab
      if (effect.category === 'controls') continue
      if (!grouped[effect.category]) grouped[effect.category] = []
      grouped[effect.category].push(effect)
    }
    return grouped
  }, [compatibleEffects])

  // Collect property buttons for settings and extra sliders across selected targets
  const propertyButtons = useMemo((): PropertyButton[] => {
    const settingSeen = new Set<string>()
    const sliderSeen = new Set<string>()
    const buttons: PropertyButton[] = []

    const processFixtureProps = (properties?: Array<{ type: string; name: string; displayName: string; category: string; options?: Array<{ name: string; level: number; displayName: string; colourPreview?: string }> }>) => {
      if (!properties) return
      for (const p of properties) {
        if (p.type === 'setting' && !settingSeen.has(p.name)) {
          settingSeen.add(p.name)
          buttons.push({
            kind: 'setting',
            propertyName: p.name,
            displayName: p.displayName,
            effectType: 'StaticSetting',
            options: (p as SettingPropertyDescriptor).options,
          })
        }
        if (p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv' && !sliderSeen.has(p.name)) {
          sliderSeen.add(p.name)
          const slider = p as SliderPropertyDescriptor
          buttons.push({
            kind: 'slider',
            propertyName: p.name,
            displayName: p.displayName,
            effectType: 'StaticValue',
            min: slider.min,
            max: slider.max,
          })
        }
      }
    }

    for (const target of selectedTargets.values()) {
      if (target.type === 'group') {
        if (fixtureList) {
          const members = fixtureList.filter((f) => f.groups.includes(target.name))
          for (const fixture of members) {
            processFixtureProps(fixture.properties)
          }
        }
      } else {
        processFixtureProps(target.fixture.properties)
      }
    }
    return buttons
  }, [selectedTargets, fixtureList])

  // Compute effect presence given the active effects data from all selected targets
  const computePresence = useCallback(
    (effectName: string, targetEffectsData: TargetEffectsData[]): EffectPresence => {
      if (targetEffectsData.length === 0) return 'none'

      let activeCount = 0
      const normalized = normalizeEffectName(effectName)

      for (const data of targetEffectsData) {
        let hasEffect = false
        if (data.target.type === 'group' && data.groupEffects) {
          hasEffect = data.groupEffects.some(
            (e) => normalizeEffectName(e.effectType) === normalized,
          )
        } else if (data.target.type === 'fixture' && data.fixtureDirectEffects) {
          hasEffect = data.fixtureDirectEffects.some(
            (e) => normalizeEffectName(e.effectType) === normalized,
          )
        }
        if (hasEffect) activeCount++
      }

      if (activeCount === 0) return 'none'
      if (activeCount === targetEffectsData.length) return 'all'
      return 'some'
    },
    [],
  )

  /**
   * Fixture keys a busking target writes to. A group write is fanned out by the backend and
   * stored per member (with `sourceGroup` recorded), so reading a group's state means reading
   * its members'.
   */
  const targetFixtureKeys = useCallback(
    (target: BuskingTarget): string[] => {
      if (target.type === 'fixture') return [target.key]
      return (fixtureList ?? []).filter((f) => f.groups.includes(target.name)).map((f) => f.key)
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
    (button: PropertyButton, targetEffectsData: TargetEffectsData[]): EffectPresence => {
      if (targetEffectsData.length === 0) return 'none'

      let activeCount = 0
      for (const data of targetEffectsData) {
        if (programmerEntryFor(data.target, button.propertyName)) activeCount++
      }

      if (activeCount === 0) return 'none'
      if (activeCount === targetEffectsData.length) return 'all'
      return 'some'
    },
    [programmerEntryFor],
  )

  /**
   * Toggle or set a property value on every selected target.
   *
   * Writes go straight to the programmer: on for a plain set, `clearEntry` to release. The
   * release is a full clear of the property (every owner), which is what the operator means
   * by tapping the pad off — a busked value sitting under a locate should go too.
   */
  const togglePropertyEffect = useCallback(
    async (
      button: PropertyButton,
      presence: EffectPresence,
      targetEffectsData: TargetEffectsData[],
      settingLevel?: number,
    ) => {
      // A tap with no explicit level on an already-set pad means "turn it off".
      if (presence === 'all' && settingLevel === undefined) {
        for (const data of targetEffectsData) {
          const { targetType, targetKey } = programmerTarget(data.target)
          programmerClearEntry(targetType, targetKey, button.propertyName)
        }
        return
      }

      const level =
        settingLevel !== undefined ? settingLevel : button.kind === 'slider' ? 128 : 0
      for (const data of targetEffectsData) {
        const { targetType, targetKey } = programmerTarget(data.target)
        programmerSet(targetType, targetKey, button.propertyName, serializeLevel(level))
      }
    },
    [],
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

  // Resolve the target property for an effect on a specific target.
  // For setting effects, replace the sentinel "setting" with the actual fixture setting property name.
  const resolveProperty = useCallback(
    (target: BuskingTarget, effect: EffectLibraryEntry): string | null => {
      const propNames = new Set<string>()
      const fixtures: Array<{ properties?: Array<{ type: string; name: string; category: string }> }> = []
      if (target.type === 'group') {
        target.group.capabilities.forEach((c) => propNames.add(c))
        if (fixtureList) {
          const members = fixtureList.filter((f) => f.groups.includes(target.name))
          for (const fixture of members) {
            fixtures.push(fixture)
            fixture.properties?.forEach((p) => propNames.add(p.name))
            fixture.elementGroupProperties?.forEach((p) => propNames.add(p.name))
          }
        }
      } else {
        fixtures.push(target.fixture)
        target.fixture.properties?.forEach((p) => propNames.add(p.name))
        target.fixture.elementGroupProperties?.forEach((p) => propNames.add(p.name))
      }
      // Add sentinels so setting/slider effects can match
      if (fixtures.some((f) => f.properties?.some((p) => p.type === 'setting'))) {
        propNames.add('setting')
      }
      if (fixtures.some((f) => f.properties?.some((p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv'))) {
        propNames.add('slider')
      }
      const matched = effect.compatibleProperties.find((name) => propNames.has(name)) ?? null
      if (matched === 'setting') {
        for (const f of fixtures) {
          const settingProp = f.properties?.find((p) => p.type === 'setting')
          if (settingProp) return settingProp.name
        }
        return null
      }
      if (matched === 'slider') {
        for (const f of fixtures) {
          const sliderProp = f.properties?.find((p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv')
          if (sliderProp) return sliderProp.name
        }
        return null
      }
      return matched
    },
    [fixtureList],
  )

  const toggleEffect = useCallback(
    async (
      effect: EffectLibraryEntry,
      presence: EffectPresence,
      targetEffectsData: TargetEffectsData[],
    ) => {
      const normalized = normalizeEffectName(effect.name)

      if (presence === 'all') {
        // Remove from all selected targets
        const removals: Promise<unknown>[] = []
        for (const data of targetEffectsData) {
          if (data.target.type === 'group' && data.groupEffects) {
            const matching = data.groupEffects.filter(
              (e) => normalizeEffectName(e.effectType) === normalized,
            )
            for (const fx of matching) {
              removals.push(
                removeGroupFx({ id: fx.id, groupName: data.target.name }).unwrap(),
              )
            }
          } else if (data.target.type === 'fixture' && data.fixtureDirectEffects) {
            const matching = data.fixtureDirectEffects.filter(
              (e) => normalizeEffectName(e.effectType) === normalized,
            )
            for (const fx of matching) {
              removals.push(
                removeFx({ id: fx.id, fixtureKey: data.target.key }).unwrap(),
              )
            }
          }
        }
        await Promise.all(removals).catch(ignoreReportedError)
      } else {
        // Add to targets that don't have it
        const defaults: Record<string, string> = {}
        effect.parameters.forEach((p) => {
          defaults[p.name] = p.defaultValue
        })

        const additions: Promise<unknown>[] = []
        for (const data of targetEffectsData) {
          let hasEffect = false
          if (data.target.type === 'group' && data.groupEffects) {
            hasEffect = data.groupEffects.some(
              (e) => normalizeEffectName(e.effectType) === normalized,
            )
          } else if (data.target.type === 'fixture' && data.fixtureDirectEffects) {
            hasEffect = data.fixtureDirectEffects.some(
              (e) => normalizeEffectName(e.effectType) === normalized,
            )
          }

          if (!hasEffect) {
            const propertyName = resolveProperty(data.target, effect)
            if (!propertyName) continue

            if (data.target.type === 'group') {
              additions.push(
                applyGroupFx({
                  groupName: data.target.name,
                  effectType: effect.name as EffectType,
                  propertyName,
                  beatDivision: defaultBeatDivision,
                  blendMode: 'OVERRIDE' as BlendMode,
                  distribution: 'LINEAR' as DistributionStrategy,
                  phaseOffset: 0,
                  parameters: { ...defaults },
                  ...(defaultSpeedMasterUuid != null ? { speedMasterUuid: defaultSpeedMasterUuid } : {}),
                  programmerOwned: true,
                }).unwrap(),
              )
            } else {
              additions.push(
                addFixtureFx({
                  effectType: effect.name,
                  fixtureKey: data.target.key,
                  propertyName,
                  beatDivision: defaultBeatDivision,
                  blendMode: 'OVERRIDE' as BlendMode,
                  startOnBeat: true,
                  phaseOffset: 0,
                  parameters: { ...defaults },
                  ...(defaultSpeedMasterUuid != null ? { speedMasterUuid: defaultSpeedMasterUuid } : {}),
                  programmerOwned: true,
                }).unwrap(),
              )
            }
          }
        }
        await Promise.all(additions).catch(ignoreReportedError)
      }
    },
    [defaultBeatDivision, defaultSpeedMasterUuid, resolveProperty, addFixtureFx, removeFx, applyGroupFx, removeGroupFx],
  )

  const applyEffectWithParams = useCallback(
    async (
      effect: EffectLibraryEntry,
      targetEffectsData: TargetEffectsData[],
      params: {
        beatDivision: number
        blendMode: string
        phaseOffset: number
        distribution: string
        elementMode?: string
        stepTiming?: boolean
        parameters: Record<string, string>
        speedMasterUuid?: string
        rateSpeedMasterUuid?: string
      },
    ) => {
      const additions: Promise<unknown>[] = []
      for (const data of targetEffectsData) {
        const propertyName = resolveProperty(data.target, effect)
        if (!propertyName) continue

        if (data.target.type === 'group') {
          additions.push(
            applyGroupFx({
              groupName: data.target.name,
              effectType: effect.name as EffectType,
              propertyName,
              beatDivision: params.beatDivision,
              blendMode: params.blendMode as BlendMode,
              distribution: params.distribution as DistributionStrategy,
              phaseOffset: params.phaseOffset,
              parameters: { ...params.parameters },
              programmerOwned: true,
              ...(params.elementMode ? { elementMode: params.elementMode as ElementMode } : {}),
              ...(params.stepTiming !== undefined ? { stepTiming: params.stepTiming } : {}),
              ...(params.speedMasterUuid != null ? { speedMasterUuid: params.speedMasterUuid } : {}),
              ...(params.rateSpeedMasterUuid != null
                ? { rateSpeedMasterUuid: params.rateSpeedMasterUuid }
                : {}),
            }).unwrap(),
          )
        } else {
          additions.push(
            addFixtureFx({
              effectType: effect.name,
              fixtureKey: data.target.key,
              propertyName,
              beatDivision: params.beatDivision,
              blendMode: params.blendMode as BlendMode,
              startOnBeat: true,
              phaseOffset: params.phaseOffset,
              parameters: { ...params.parameters },
              distributionStrategy: params.distribution,
              programmerOwned: true,
              ...(params.stepTiming !== undefined ? { stepTiming: params.stepTiming } : {}),
              ...(params.speedMasterUuid != null ? { speedMasterUuid: params.speedMasterUuid } : {}),
              ...(params.rateSpeedMasterUuid != null
                ? { rateSpeedMasterUuid: params.rateSpeedMasterUuid }
                : {}),
            }).unwrap(),
          )
        }
      }
      await Promise.all(additions).catch(ignoreReportedError)
    },
    [resolveProperty, addFixtureFx, applyGroupFx],
  )

  const applyLook = useCallback(
    async (look: LookSummary, _presence: EffectPresence, targetEffectsData: TargetEffectsData[]) => {
      const projectId = currentProject?.id
      if (!projectId || targetEffectsData.length === 0) return

      const targets: ToggleLookTarget[] = targetEffectsData.map((data) => ({
        type: data.target.type,
        key: data.target.type === 'group' ? data.target.name : data.target.key,
      }))

      await toggleLookMutation({
        projectId,
        lookId: look.id,
        targets,
      })
        .unwrap()
        .catch(ignoreReportedError)
    },
    [currentProject?.id, toggleLookMutation],
  )

  /**
   * Whether a Look is on, from the effects tagged with its id.
   *
   * `presetId` is the right field to match, counter-intuitive as the name is: the toggle route
   * passes the *Look* id into `togglePresetOnTargets`, which keys its bookkeeping and stamps its
   * instances on that field. `FxInstance.lookId` exists but is set only by the cue-layer paths.
   * When the pads become programmer layers the whole question goes away.
   *
   * A Look made only of static rows shows `'none'`: it spawns no effects, so there is nothing here
   * to find. The server's programmer-write bookkeeping is not exposed to the pad.
   */
  const computeLookPresence = useCallback(
    (look: LookSummary, targetEffectsData: TargetEffectsData[]): EffectPresence => {
      if (targetEffectsData.length === 0 || look.effectCount === 0) return 'none'

      let activeCount = 0
      for (const data of targetEffectsData) {
        let hasLook = false
        if (data.target.type === 'group' && data.groupEffects) {
          hasLook = data.groupEffects.some((e) => e.presetId === look.id)
        } else if (data.target.type === 'fixture' && data.fixtureDirectEffects) {
          hasLook = data.fixtureDirectEffects.some((e) => e.presetId === look.id)
        }
        if (hasLook) activeCount++
      }

      if (activeCount === 0) return 'none'
      if (activeCount === targetEffectsData.length) return 'all'
      return 'some'
    },
    [],
  )

  return {
    // Selection
    selectedTargets,
    selectTarget,
    toggleTarget,
    clearSelection,

    // Beat division
    defaultBeatDivision,
    setDefaultBeatDivision,

    // Pad-wide default speed master
    defaultSpeedMasterUuid,
    setDefaultSpeedMasterUuid,

    // Effect data
    effectsByCategory,
    compatibleEffects,
    computePresence,
    toggleEffect,
    resolveProperty,

    // Property buttons (settings & sliders)
    propertyButtons,
    computePropertyPresence,
    togglePropertyEffect,
    getActivePropertyValue,

    // Apply with custom params
    applyEffectWithParams,

    // Looks
    applyLook,
    computeLookPresence,

    // Bottom sheet
    editingEffect,
    setEditingEffect,
  }
}
