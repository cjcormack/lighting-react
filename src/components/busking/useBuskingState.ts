import { useState, useMemo, useCallback } from 'react'
import { useEffectLibraryQuery, useAddFixtureFxMutation, useRemoveFxMutation } from '@/store/fixtureFx'
import { useApplyGroupFxMutation, useRemoveGroupFxMutation } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import type { SettingPropertyDescriptor, SliderPropertyDescriptor } from '@/store/fixtures'
import type { EffectLibraryEntry, FixtureDirectEffect } from '@/store/fixtureFx'
import type { GroupActiveEffect, BlendMode, DistributionStrategy, EffectType } from '@/api/groupsApi'
import type { FxPreset } from '@/api/fxPresetsApi'
import {
  type BuskingTarget,
  type PropertyButton,
  type EffectPresence,
  type ActiveEffectContext,
  targetKey,
  normalizeEffectName,
} from './buskingTypes'

export interface TargetEffectsData {
  key: string
  target: BuskingTarget
  groupEffects?: GroupActiveEffect[]
  fixtureDirectEffects?: FixtureDirectEffect[]
}

export function useBuskingState() {
  const [selectedTargets, setSelectedTargets] = useState<Map<string, BuskingTarget>>(new Map())
  const [defaultBeatDivision, setDefaultBeatDivision] = useState(1.0)
  const [activeCategory, setActiveCategory] = useState<string>('dimmer')
  const [editingEffect, setEditingEffect] = useState<ActiveEffectContext | null>(null)

  const { data: library } = useEffectLibraryQuery()
  const { data: fixtureList } = useFixtureListQuery()

  const [addFixtureFx] = useAddFixtureFxMutation()
  const [removeFx] = useRemoveFxMutation()
  const [applyGroupFx] = useApplyGroupFxMutation()
  const [removeGroupFx] = useRemoveGroupFxMutation()

  const selectTarget = useCallback((target: BuskingTarget) => {
    setSelectedTargets(new Map([[targetKey(target), target]]))
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

  // Whether the selected targets have actual dimmer/uv properties (not just extra sliders)
  const hasRealDimmer = useMemo(() => {
    return allPropertyNames.has('dimmer') || allPropertyNames.has('uv')
  }, [allPropertyNames])

  // Group by category, filtering out effects that are handled by property buttons
  const effectsByCategory = useMemo(() => {
    const grouped: Record<string, EffectLibraryEntry[]> = {}
    for (const effect of compatibleEffects) {
      // Filter out StaticSetting — settings are shown as property buttons instead
      if (normalizeEffectName(effect.name) === 'staticsetting') continue
      // Filter out dimmer effects that only matched via the "slider" sentinel
      // (e.g. hazer with pumpControl but no actual dimmer — those sliders are in Controls tab)
      if (effect.category === 'dimmer' && !hasRealDimmer) continue
      if (!grouped[effect.category]) grouped[effect.category] = []
      grouped[effect.category].push(effect)
    }
    return grouped
  }, [compatibleEffects, hasRealDimmer])

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

  // Compute property-specific presence (matches by both effectType AND propertyName)
  const computePropertyPresence = useCallback(
    (button: PropertyButton, targetEffectsData: TargetEffectsData[]): EffectPresence => {
      if (targetEffectsData.length === 0) return 'none'

      const normalizedType = normalizeEffectName(button.effectType)
      let activeCount = 0

      for (const data of targetEffectsData) {
        let hasEffect = false
        if (data.target.type === 'group' && data.groupEffects) {
          hasEffect = data.groupEffects.some(
            (e) => normalizeEffectName(e.effectType) === normalizedType && e.propertyName === button.propertyName,
          )
        } else if (data.target.type === 'fixture' && data.fixtureDirectEffects) {
          hasEffect = data.fixtureDirectEffects.some(
            (e) => normalizeEffectName(e.effectType) === normalizedType && e.propertyName === button.propertyName,
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

  // Toggle a property-specific effect (setting or slider)
  const togglePropertyEffect = useCallback(
    async (
      button: PropertyButton,
      presence: EffectPresence,
      targetEffectsData: TargetEffectsData[],
      settingLevel?: number,
    ) => {
      const normalizedType = normalizeEffectName(button.effectType)

      if (presence === 'all' && settingLevel === undefined) {
        // Remove from all selected targets
        const removals: Promise<unknown>[] = []
        for (const data of targetEffectsData) {
          if (data.target.type === 'group' && data.groupEffects) {
            const matching = data.groupEffects.filter(
              (e) => normalizeEffectName(e.effectType) === normalizedType && e.propertyName === button.propertyName,
            )
            for (const fx of matching) {
              removals.push(removeGroupFx({ id: fx.id, groupName: data.target.name }).unwrap())
            }
          } else if (data.target.type === 'fixture' && data.fixtureDirectEffects) {
            const matching = data.fixtureDirectEffects.filter(
              (e) => normalizeEffectName(e.effectType) === normalizedType && e.propertyName === button.propertyName,
            )
            for (const fx of matching) {
              removals.push(removeFx({ id: fx.id, fixtureKey: data.target.key }).unwrap())
            }
          }
        }
        await Promise.all(removals)
      } else {
        // Add or update on each target
        const paramKey = button.kind === 'setting' ? 'level' : 'value'
        const paramValue = settingLevel !== undefined ? String(settingLevel) : button.kind === 'slider' ? '128' : '0'

        const actions: Promise<unknown>[] = []
        for (const data of targetEffectsData) {
          // Check if already exists on this target
          let existingFx: GroupActiveEffect | FixtureDirectEffect | undefined
          if (data.target.type === 'group' && data.groupEffects) {
            existingFx = data.groupEffects.find(
              (e) => normalizeEffectName(e.effectType) === normalizedType && e.propertyName === button.propertyName,
            )
          } else if (data.target.type === 'fixture' && data.fixtureDirectEffects) {
            existingFx = data.fixtureDirectEffects.find(
              (e) => normalizeEffectName(e.effectType) === normalizedType && e.propertyName === button.propertyName,
            )
          }

          if (existingFx && settingLevel !== undefined) {
            // Already active but updating the value — remove and re-add
            if (data.target.type === 'group') {
              actions.push(removeGroupFx({ id: existingFx.id, groupName: data.target.name }).unwrap())
            } else if (data.target.type === 'fixture') {
              actions.push(removeFx({ id: existingFx.id, fixtureKey: data.target.key }).unwrap())
            }
          }

          if (!existingFx || settingLevel !== undefined) {
            if (data.target.type === 'group') {
              actions.push(
                applyGroupFx({
                  groupName: data.target.name,
                  effectType: button.effectType as EffectType,
                  propertyName: button.propertyName,
                  beatDivision: defaultBeatDivision,
                  blendMode: 'OVERRIDE' as BlendMode,
                  distribution: 'LINEAR' as DistributionStrategy,
                  phaseOffset: 0,
                  parameters: { [paramKey]: paramValue },
                }).unwrap(),
              )
            } else {
              actions.push(
                addFixtureFx({
                  effectType: button.effectType,
                  fixtureKey: data.target.key,
                  propertyName: button.propertyName,
                  beatDivision: defaultBeatDivision,
                  blendMode: 'OVERRIDE' as BlendMode,
                  startOnBeat: true,
                  phaseOffset: 0,
                  parameters: { [paramKey]: paramValue },
                }).unwrap(),
              )
            }
          }
        }
        await Promise.all(actions)
      }
    },
    [defaultBeatDivision, addFixtureFx, removeFx, applyGroupFx, removeGroupFx],
  )

  // Get the active value for a property button from the first matching active effect
  const getActivePropertyValue = useCallback(
    (button: PropertyButton, targetEffectsData: TargetEffectsData[]): string | null => {
      const normalizedType = normalizeEffectName(button.effectType)
      const paramKey = button.kind === 'setting' ? 'level' : 'value'

      for (const data of targetEffectsData) {
        if (data.target.type === 'group' && data.groupEffects) {
          const fx = data.groupEffects.find(
            (e) => normalizeEffectName(e.effectType) === normalizedType && e.propertyName === button.propertyName,
          )
          if (fx) return fx.parameters[paramKey] ?? null
        } else if (data.target.type === 'fixture' && data.fixtureDirectEffects) {
          const fx = data.fixtureDirectEffects.find(
            (e) => normalizeEffectName(e.effectType) === normalizedType && e.propertyName === button.propertyName,
          )
          if (fx) return fx.parameters[paramKey] ?? null
        }
      }
      return null
    },
    [],
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
        await Promise.all(removals)
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
                }).unwrap(),
              )
            }
          }
        }
        await Promise.all(additions)
      }
    },
    [defaultBeatDivision, resolveProperty, addFixtureFx, removeFx, applyGroupFx, removeGroupFx],
  )

  const applyPreset = useCallback(
    async (preset: FxPreset, targetEffectsData: TargetEffectsData[]) => {
      const additions: Promise<unknown>[] = []

      for (const presetEffect of preset.effects) {
        // Find the library entry for this effect to resolve properties
        const normalized = presetEffect.effectType.toLowerCase().replace(/[\s_]/g, '')
        const libraryEntry = library?.find(
          (e) => e.name.toLowerCase().replace(/[\s_]/g, '') === normalized,
        )

        for (const data of targetEffectsData) {
          // Resolve which property to target
          let propertyName = presetEffect.propertyName
          if (!propertyName && libraryEntry) {
            propertyName = resolveProperty(data.target, libraryEntry)
          }
          if (!propertyName) continue

          if (data.target.type === 'group') {
            additions.push(
              applyGroupFx({
                groupName: data.target.name,
                effectType: presetEffect.effectType as EffectType,
                propertyName,
                beatDivision: presetEffect.beatDivision,
                blendMode: (presetEffect.blendMode || 'OVERRIDE') as BlendMode,
                distribution: (presetEffect.distribution || 'LINEAR') as DistributionStrategy,
                phaseOffset: presetEffect.phaseOffset,
                parameters: { ...presetEffect.parameters },
              }).unwrap(),
            )
          } else {
            additions.push(
              addFixtureFx({
                effectType: presetEffect.effectType,
                fixtureKey: data.target.key,
                propertyName,
                beatDivision: presetEffect.beatDivision,
                blendMode: (presetEffect.blendMode || 'OVERRIDE') as BlendMode,
                startOnBeat: true,
                phaseOffset: presetEffect.phaseOffset,
                parameters: { ...presetEffect.parameters },
              }).unwrap(),
            )
          }
        }
      }

      await Promise.all(additions)
    },
    [library, resolveProperty, applyGroupFx, addFixtureFx],
  )

  return {
    // Selection
    selectedTargets,
    selectTarget,
    toggleTarget,

    // Beat division
    defaultBeatDivision,
    setDefaultBeatDivision,

    // Category
    activeCategory,
    setActiveCategory,

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

    // Presets
    applyPreset,

    // Bottom sheet
    editingEffect,
    setEditingEffect,
  }
}
