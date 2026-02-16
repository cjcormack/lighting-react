import { useState, useCallback, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useGroupActiveEffectsQuery } from '@/store/groups'
import { useFixtureEffectsQuery } from '@/store/fixtureFx'
import { useCurrentProjectQuery } from '@/store/projects'
import { useProjectPresetListQuery } from '@/store/fxPresets'
import { BuskingTopBar } from './BuskingTopBar'
import { TargetList } from './TargetList'
import { EffectPad } from './EffectPad'
import { ActiveEffectSheet } from './ActiveEffectSheet'
import { useBuskingState, type TargetEffectsData } from './useBuskingState'
import {
  type BuskingTarget,
  type PropertyButton,
  type ActiveEffectContext,
  type EffectPresence,
  targetKey,
  normalizeEffectName,
} from './buskingTypes'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { FxPreset } from '@/api/fxPresetsApi'

export function BuskingView() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [mobileTab, setMobileTab] = useState('targets')

  const {
    selectedTargets,
    selectTarget,
    toggleTarget,
    defaultBeatDivision,
    setDefaultBeatDivision,
    activeCategory,
    setActiveCategory,
    effectsByCategory,
    computePresence,
    toggleEffect,
    propertyButtons,
    computePropertyPresence,
    togglePropertyEffect,
    getActivePropertyValue,
    applyPreset,
    editingEffect,
    setEditingEffect,
  } = useBuskingState()

  // Fetch presets for the current project
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: presets } = useProjectPresetListQuery(currentProject?.id ?? 0, {
    skip: !currentProject,
  })

  // On mobile, switch to effects tab when a target is selected
  const handleSelectTarget = useCallback(
    (target: BuskingTarget) => {
      selectTarget(target)
      if (!isDesktop) {
        setMobileTab('effects')
      }
    },
    [selectTarget, isDesktop],
  )

  // Collect effects data for all selected targets
  const selectedArray = useMemo(
    () => Array.from(selectedTargets.values()),
    [selectedTargets],
  )

  // Fetch effects data for selected targets
  const targetEffectsData = useSelectedTargetEffects(selectedArray)

  const handleApplyPreset = useCallback(
    (preset: FxPreset) => applyPreset(preset, targetEffectsData),
    [applyPreset, targetEffectsData],
  )

  return (
    <div className="flex flex-col h-full">
      <BuskingTopBar
        defaultBeatDivision={defaultBeatDivision}
        onBeatDivisionChange={setDefaultBeatDivision}
      />

      {isDesktop ? (
        <div className="flex-1 flex min-h-0">
          <div className="w-72 border-r overflow-y-auto shrink-0">
            <TargetList
              selectedTargets={selectedTargets}
              onSelect={handleSelectTarget}
              onToggle={toggleTarget}
            />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <EffectPadWrapper
              selectedTargets={selectedArray}
              targetEffectsData={targetEffectsData}
              effectsByCategory={effectsByCategory}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              computePresence={computePresence}
              toggleEffect={toggleEffect}
              propertyButtons={propertyButtons}
              computePropertyPresence={computePropertyPresence}
              togglePropertyEffect={togglePropertyEffect}
              getActivePropertyValue={getActivePropertyValue}
              setEditingEffect={setEditingEffect}
              presets={presets ?? []}
              onApplyPreset={handleApplyPreset}
              currentProjectId={currentProject?.id}
            />
          </div>
        </div>
      ) : (
        <Tabs
          value={mobileTab}
          onValueChange={setMobileTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="mx-2 mt-2 w-auto self-start">
            <TabsTrigger value="targets">Targets</TabsTrigger>
            <TabsTrigger value="effects">
              Effects
              {selectedTargets.size > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({selectedTargets.size})
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="targets" className="flex-1 overflow-y-auto mt-0">
            <TargetList
              selectedTargets={selectedTargets}
              onSelect={handleSelectTarget}
              onToggle={toggleTarget}
            />
          </TabsContent>
          <TabsContent value="effects" className="flex-1 overflow-hidden mt-0">
            <EffectPadWrapper
              selectedTargets={selectedArray}
              targetEffectsData={targetEffectsData}
              effectsByCategory={effectsByCategory}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              computePresence={computePresence}
              toggleEffect={toggleEffect}
              propertyButtons={propertyButtons}
              computePropertyPresence={computePropertyPresence}
              togglePropertyEffect={togglePropertyEffect}
              getActivePropertyValue={getActivePropertyValue}
              setEditingEffect={setEditingEffect}
              presets={presets ?? []}
              onApplyPreset={handleApplyPreset}
              currentProjectId={currentProject?.id}
            />
          </TabsContent>
        </Tabs>
      )}

      <ActiveEffectSheet context={editingEffect} onClose={() => setEditingEffect(null)} />
    </div>
  )
}

/**
 * Wrapper that provides presence computation + toggle handlers to the EffectPad.
 */
function EffectPadWrapper({
  selectedTargets,
  targetEffectsData,
  effectsByCategory,
  activeCategory,
  onCategoryChange,
  computePresence,
  toggleEffect,
  propertyButtons,
  computePropertyPresence,
  togglePropertyEffect,
  getActivePropertyValue,
  setEditingEffect,
  presets,
  onApplyPreset,
  currentProjectId,
}: {
  selectedTargets: BuskingTarget[]
  targetEffectsData: TargetEffectsData[]
  effectsByCategory: Record<string, EffectLibraryEntry[]>
  activeCategory: string
  onCategoryChange: (cat: string) => void
  computePresence: (effectName: string, data: TargetEffectsData[]) => EffectPresence
  toggleEffect: (effect: EffectLibraryEntry, presence: EffectPresence, data: TargetEffectsData[]) => Promise<void>
  propertyButtons: PropertyButton[]
  computePropertyPresence: (button: PropertyButton, data: TargetEffectsData[]) => EffectPresence
  togglePropertyEffect: (button: PropertyButton, presence: EffectPresence, data: TargetEffectsData[], settingLevel?: number) => Promise<void>
  getActivePropertyValue: (button: PropertyButton, data: TargetEffectsData[]) => string | null
  setEditingEffect: (ctx: ActiveEffectContext | null) => void
  presets: FxPreset[]
  onApplyPreset: (preset: FxPreset) => Promise<void>
  currentProjectId: number | undefined
}) {
  const getPresence = useCallback(
    (effectName: string): EffectPresence => {
      return computePresence(effectName, targetEffectsData)
    },
    [computePresence, targetEffectsData],
  )

  const handleToggle = useCallback(
    (effect: EffectLibraryEntry) => {
      const presence = getPresence(effect.name)
      toggleEffect(effect, presence, targetEffectsData)
    },
    [getPresence, toggleEffect, targetEffectsData],
  )

  const handleLongPress = useCallback(
    (effect: EffectLibraryEntry) => {
      // Find the first active instance of this effect on a selected target
      const normalized = normalizeEffectName(effect.name)
      for (const data of targetEffectsData) {
        if (data.target.type === 'group' && data.groupEffects) {
          const match = data.groupEffects.find(
            (e) => normalizeEffectName(e.effectType) === normalized,
          )
          if (match) {
            setEditingEffect({ type: 'group', groupName: data.target.name, effect: match })
            return
          }
        } else if (data.target.type === 'fixture' && data.fixtureDirectEffects) {
          const match = data.fixtureDirectEffects.find(
            (e) => normalizeEffectName(e.effectType) === normalized,
          )
          if (match) {
            setEditingEffect({ type: 'fixture', fixtureKey: data.target.key, effect: match })
            return
          }
        }
      }
    },
    [targetEffectsData, setEditingEffect],
  )

  // Property button bound callbacks
  const getPropertyPresence = useCallback(
    (button: PropertyButton): EffectPresence => {
      return computePropertyPresence(button, targetEffectsData)
    },
    [computePropertyPresence, targetEffectsData],
  )

  const handlePropertyToggle = useCallback(
    (button: PropertyButton, settingLevel?: number) => {
      const presence = getPropertyPresence(button)
      togglePropertyEffect(button, presence, targetEffectsData, settingLevel)
    },
    [getPropertyPresence, togglePropertyEffect, targetEffectsData],
  )

  const handlePropertyLongPress = useCallback(
    (button: PropertyButton) => {
      const normalizedType = normalizeEffectName(button.effectType)
      for (const data of targetEffectsData) {
        if (data.target.type === 'group' && data.groupEffects) {
          const match = data.groupEffects.find(
            (e) => normalizeEffectName(e.effectType) === normalizedType && e.propertyName === button.propertyName,
          )
          if (match) {
            setEditingEffect({ type: 'group', groupName: data.target.name, effect: match })
            return
          }
        } else if (data.target.type === 'fixture' && data.fixtureDirectEffects) {
          const match = data.fixtureDirectEffects.find(
            (e) => normalizeEffectName(e.effectType) === normalizedType && e.propertyName === button.propertyName,
          )
          if (match) {
            setEditingEffect({ type: 'fixture', fixtureKey: data.target.key, effect: match })
            return
          }
        }
      }
    },
    [targetEffectsData, setEditingEffect],
  )

  const getPropertyValue = useCallback(
    (button: PropertyButton): string | null => {
      return getActivePropertyValue(button, targetEffectsData)
    },
    [getActivePropertyValue, targetEffectsData],
  )

  return (
    <EffectPad
      effectsByCategory={effectsByCategory}
      activeCategory={activeCategory}
      onCategoryChange={onCategoryChange}
      getPresence={getPresence}
      onToggle={handleToggle}
      onLongPress={handleLongPress}
      hasSelection={selectedTargets.length > 0}
      presets={presets}
      onApplyPreset={onApplyPreset}
      currentProjectId={currentProjectId}
      propertyButtons={propertyButtons}
      getPropertyPresence={getPropertyPresence}
      onPropertyToggle={handlePropertyToggle}
      onPropertyLongPress={handlePropertyLongPress}
      getPropertyValue={getPropertyValue}
    />
  )
}

/**
 * Custom hook that fetches effects for up to N selected targets.
 * Uses RTK Query hooks conditionally via a wrapper component pattern.
 * Since we can't call hooks in a loop, we use a fixed-size approach:
 * render individual fetcher components for each target.
 *
 * For simplicity, we fetch effects for up to the first 20 selected targets.
 */
function useSelectedTargetEffects(targets: BuskingTarget[]): TargetEffectsData[] {
  // We need a stable approach. Since RTK Query hooks can't be called conditionally,
  // we'll use the skip pattern with fixed slots.
  const t0 = targets[0]
  const t1 = targets[1]
  const t2 = targets[2]
  const t3 = targets[3]
  const t4 = targets[4]
  const t5 = targets[5]
  const t6 = targets[6]
  const t7 = targets[7]

  const d0 = useTargetEffects(t0)
  const d1 = useTargetEffects(t1)
  const d2 = useTargetEffects(t2)
  const d3 = useTargetEffects(t3)
  const d4 = useTargetEffects(t4)
  const d5 = useTargetEffects(t5)
  const d6 = useTargetEffects(t6)
  const d7 = useTargetEffects(t7)

  return useMemo(() => {
    const result: TargetEffectsData[] = []
    const all = [d0, d1, d2, d3, d4, d5, d6, d7]
    for (let i = 0; i < targets.length && i < 8; i++) {
      if (all[i]) result.push(all[i]!)
    }
    return result
  }, [targets.length, d0, d1, d2, d3, d4, d5, d6, d7])
}

function useTargetEffects(target: BuskingTarget | undefined): TargetEffectsData | null {
  const isGroup = target?.type === 'group'
  const isFixture = target?.type === 'fixture'

  const { data: groupEffects } = useGroupActiveEffectsQuery(
    isGroup ? target.name : '',
    { skip: !isGroup },
  )

  const { data: fixtureEffects } = useFixtureEffectsQuery(
    isFixture ? target.key : '',
    { skip: !isFixture },
  )

  return useMemo(() => {
    if (!target) return null
    return {
      key: targetKey(target),
      target,
      groupEffects: isGroup ? groupEffects ?? [] : undefined,
      fixtureDirectEffects: isFixture ? fixtureEffects?.direct ?? [] : undefined,
    }
  }, [target, isGroup, isFixture, groupEffects, fixtureEffects])
}
