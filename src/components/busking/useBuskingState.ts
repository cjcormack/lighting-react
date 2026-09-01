import { useState, useMemo } from 'react'
import { useEffectLibraryQuery } from '@/store/fixtureFx'
import { useSpeedMasterForCategory } from '@/store/speedMasters'
import { useFixtureListQuery } from '@/store/fixtures'
import type { SettingPropertyDescriptor, SliderPropertyDescriptor } from '@/store/fixtures'
import {
  compatibleEffectsFor,
  effectsByCategory as groupEffectsByCategory,
  isExtraSliderProperty,
  isSettingProperty,
  propertyNamesFor,
} from '@/lib/fxTargetProperties'
import {
  fxPropertyTarget,
  type ActiveEffectContext,
  type PropertyButton,
} from './buskingTypes'
import { useBuskingSelection } from './useBuskingSelection'
import { useBuskingPresence } from './useBuskingPresence'
import { useBuskingFxActions } from './useBuskingFxActions'

export type { TargetEffectsData } from './buskingTypes'

/**
 * The busking pad's state, assembled from four pieces that used to be one 617-line hook.
 *
 * What this file keeps is the pad's own vocabulary: which targets are selected, what the pad
 * *offers* for them, and the two defaults a one-tap apply uses. Selection, presence and the four
 * mutation paths are each their own hook, and the "which properties does this target have"
 * question — asked identically by the add/edit sheet — lives in `lib/fxTargetProperties`.
 */
export function useBuskingState() {
  const { selectedTargets, selectTarget, toggleTarget, clearSelection } = useBuskingSelection()

  const [defaultBeatDivision, setDefaultBeatDivision] = useState(1.0)
  const [editingEffect, setEditingEffect] = useState<ActiveEffectContext | null>(null)

  const { data: library } = useEffectLibraryQuery()
  const { data: fixtureList } = useFixtureListQuery()

  const presence = useBuskingPresence()
  // The pad has no speed-master picker: a busked effect is routed by the master's declared
  // usage instead, which is what keeps a pad press to one press. One instance, shared with the
  // configure sheet so both agree on where a press would land.
  const speedMasterForCategory = useSpeedMasterForCategory()
  const actions = useBuskingFxActions({ defaultBeatDivision, speedMasterForCategory })

  const propertyTargets = useMemo(
    () => [...selectedTargets.values()].map((t) => fxPropertyTarget(t, fixtureList)),
    [selectedTargets, fixtureList],
  )

  // The effects the union of selected targets can run, minus `controls` — those are rendered as
  // property buttons in the Controls tab instead, so offering them here too would double them up.
  const effectsByCategory = useMemo(
    () =>
      groupEffectsByCategory(compatibleEffectsFor(library, propertyNamesFor(propertyTargets)), {
        exclude: ['controls'],
      }),
    [library, propertyTargets],
  )

  // Settings and extra sliders across the selected targets, in the order they are met — the two
  // kinds interleave rather than being listed separately, so a head's own property order survives.
  const propertyButtons = useMemo((): PropertyButton[] => {
    const settingSeen = new Set<string>()
    const sliderSeen = new Set<string>()
    const buttons: PropertyButton[] = []

    for (const target of propertyTargets) {
      const fixtures = target.type === 'fixture' ? [target.fixture] : target.members
      for (const fixture of fixtures) {
        for (const p of fixture.properties ?? []) {
          if (isSettingProperty(p) && !settingSeen.has(p.name)) {
            settingSeen.add(p.name)
            buttons.push({
              kind: 'setting',
              propertyName: p.name,
              displayName: p.displayName,
              effectType: 'StaticSetting',
              options: (p as SettingPropertyDescriptor).options,
            })
          }
          if (isExtraSliderProperty(p) && !sliderSeen.has(p.name)) {
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
    }
    return buttons
  }, [propertyTargets])

  return {
    // Selection
    selectedTargets,
    selectTarget,
    toggleTarget,
    clearSelection,

    // Beat division
    defaultBeatDivision,
    setDefaultBeatDivision,

    // Apply-time speed-master routing (there is no pad-wide picker: usage decides)
    speedMasterForCategory,

    // Effect data
    effectsByCategory,
    computePresence: presence.computePresence,
    toggleEffect: actions.toggleEffect,

    // Property buttons (settings & sliders)
    propertyButtons,
    computePropertyPresence: presence.computePropertyPresence,
    togglePropertyEffect: actions.togglePropertyEffect,
    getActivePropertyValue: presence.getActivePropertyValue,

    // Apply with custom params
    applyEffectWithParams: actions.applyEffectWithParams,

    // Looks
    applyLook: actions.applyLook,
    computeLookPresence: presence.computeLookPresence,

    // Bottom sheet
    editingEffect,
    setEditingEffect,
  }
}
