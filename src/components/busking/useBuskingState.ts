import { useState, useMemo, useCallback } from 'react'
import { useEffectLibraryQuery, useAddFixtureFxMutation, useRemoveFxMutation } from '@/store/fixtureFx'
import { useApplyGroupFxMutation, useRemoveGroupFxMutation } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import type { EffectLibraryEntry, FixtureDirectEffect } from '@/store/fixtureFx'
import type { GroupActiveEffect, BlendMode, DistributionStrategy, EffectType } from '@/api/groupsApi'
import {
  type BuskingTarget,
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
    for (const target of selectedTargets.values()) {
      if (target.type === 'group') {
        target.group.capabilities.forEach((c) => names.add(c))
        // Also check member fixture properties for multi-head support
        if (fixtureList) {
          const members = fixtureList.filter((f) => f.groups.includes(target.name))
          for (const fixture of members) {
            fixture.properties?.forEach((p) => names.add(p.name))
            fixture.elementGroupProperties?.forEach((p) => names.add(p.name))
          }
        }
      } else {
        target.fixture.properties?.forEach((p) => names.add(p.name))
        target.fixture.elementGroupProperties?.forEach((p) => names.add(p.name))
      }
    }
    return names
  }, [selectedTargets, fixtureList])

  // Filter library by compatible effects for the union of selected targets
  const compatibleEffects = useMemo(() => {
    if (!library || selectedTargets.size === 0) return []
    return library.filter((effect) =>
      effect.compatibleProperties.some((propName) => allPropertyNames.has(propName)),
    )
  }, [library, allPropertyNames, selectedTargets.size])

  // Group by category
  const effectsByCategory = useMemo(() => {
    const grouped: Record<string, EffectLibraryEntry[]> = {}
    for (const effect of compatibleEffects) {
      if (!grouped[effect.category]) grouped[effect.category] = []
      grouped[effect.category].push(effect)
    }
    return grouped
  }, [compatibleEffects])

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

  // Resolve the target property for an effect on a specific target
  const resolveProperty = useCallback(
    (target: BuskingTarget, effect: EffectLibraryEntry): string | null => {
      const propNames = new Set<string>()
      if (target.type === 'group') {
        target.group.capabilities.forEach((c) => propNames.add(c))
        if (fixtureList) {
          const members = fixtureList.filter((f) => f.groups.includes(target.name))
          for (const fixture of members) {
            fixture.properties?.forEach((p) => propNames.add(p.name))
            fixture.elementGroupProperties?.forEach((p) => propNames.add(p.name))
          }
        }
      } else {
        target.fixture.properties?.forEach((p) => propNames.add(p.name))
        target.fixture.elementGroupProperties?.forEach((p) => propNames.add(p.name))
      }
      return effect.compatibleProperties.find((name) => propNames.has(name)) ?? null
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

    // Bottom sheet
    editingEffect,
    setEditingEffect,
  }
}
