import { useState, useCallback, useMemo, useEffect } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useGroupActiveEffectsQuery } from '@/store/groups'
import { useFixtureEffectsQuery } from '@/store/fixtureFx'
import { useFixtureListQuery } from '@/store/fixtures'
import { useCurrentProjectQuery } from '@/store/projects'
import { useProjectPresetListQuery, useCreateProjectPresetMutation, useSaveProjectPresetMutation, useDeleteProjectPresetMutation } from '@/store/fxPresets'
import { TargetList } from './TargetList'
import { EffectPad } from './EffectPad'
import { SelectedTargetSummary } from './SelectedTargetSummary'
import { ActiveEffectSheet } from './ActiveEffectSheet'
import { ConfigureEffectSheet } from './ConfigureEffectSheet'
import { PresetForm } from '@/components/presets/PresetForm'
import { FixtureDetailModal } from '@/components/groups/FixtureDetailModal'
import { useBuskingState, type TargetEffectsData } from './useBuskingState'
import {
  type BuskingTarget,
  type PropertyButton,
  type ActiveEffectContext,
  type EffectPresence,
  targetKey,
  normalizeEffectName,
} from './buskingTypes'
import { inferPresetCapabilities, inferPresetExtendedChannels } from '@/api/fxPresetsApi'
import { detectExtendedChannels } from '@/components/fx/colourUtils'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { FxPreset, FxPresetInput } from '@/api/fxPresetsApi'

interface BuskingViewProps {
  /** Called whenever the set of selected targets changes, with control functions */
  onSelectionChange?: (targetNames: string[], controls: { clearSelection: () => void; openTargetPicker: () => void }) => void
}

export function BuskingView({ onSelectionChange }: BuskingViewProps) {
  const isDesktop = useMediaQuery('(min-width: 900px)')
  const [targetSheetOpen, setTargetSheetOpen] = useState(false)

  const {
    selectedTargets,
    selectTarget,
    toggleTarget,
    clearSelection,
    defaultBeatDivision,
    setDefaultBeatDivision,
    effectsByCategory,
    computePresence,
    toggleEffect,
    propertyButtons,
    computePropertyPresence,
    togglePropertyEffect,
    getActivePropertyValue,
    applyPreset,
    computePresetPresence,
    applyEffectWithParams,
    editingEffect,
    setEditingEffect,
  } = useBuskingState()

  const [configuringEffect, setConfiguringEffect] = useState<EffectLibraryEntry | null>(null)
  const [presetFormOpen, setPresetFormOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<FxPreset | null>(null)
  const [detailFixtureKey, setDetailFixtureKey] = useState<string | null>(null)

  // Fetch presets for the current project
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: presets } = useProjectPresetListQuery(currentProject?.id ?? 0, {
    skip: !currentProject,
  })
  const { data: fixtureList } = useFixtureListQuery()
  const [createPreset, { isLoading: isCreatingPreset }] = useCreateProjectPresetMutation()
  const [savePreset, { isLoading: isSavingPreset }] = useSaveProjectPresetMutation()
  const [deletePreset, { isLoading: isDeletingPreset }] = useDeleteProjectPresetMutation()

  // On mobile, close the target sheet when a target is selected
  const handleSelectTarget = useCallback(
    (target: BuskingTarget) => {
      selectTarget(target)
      if (!isDesktop) {
        setTargetSheetOpen(false)
      }
    },
    [selectTarget, isDesktop],
  )

  // Collect effects data for all selected targets
  const selectedArray = useMemo(
    () => Array.from(selectedTargets.values()),
    [selectedTargets],
  )

  // Track which group cards are expanded (default: all expanded)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const groups = new Set<string>()
    for (const t of selectedTargets.values()) {
      if (t.type === 'group') groups.add(t.name)
    }
    return groups
  })

  // Auto-expand newly added groups
  useEffect(() => {
    setExpandedGroups((prev) => {
      const currentGroupNames = new Set<string>()
      for (const t of selectedTargets.values()) {
        if (t.type === 'group') currentGroupNames.add(t.name)
      }
      // Add any new groups that aren't already tracked
      let changed = false
      const next = new Set(prev)
      for (const name of currentGroupNames) {
        if (!next.has(name)) {
          next.add(name)
          changed = true
        }
      }
      // Remove groups that are no longer selected
      for (const name of next) {
        if (!currentGroupNames.has(name)) {
          next.delete(name)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedTargets])

  const toggleGroupExpanded = useCallback((groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }, [])

  // Stable ref for openTargetPicker to avoid effect re-fires
  const openTargetPicker = useCallback(() => setTargetSheetOpen(true), [])

  // Notify parent of selection changes for breadcrumb display
  useEffect(() => {
    onSelectionChange?.(
      selectedArray.map((t) =>
        t.type === 'group' ? t.name : t.fixture.name,
      ),
      { clearSelection, openTargetPicker },
    )
  }, [selectedArray, onSelectionChange, clearSelection, openTargetPicker])

  // Fetch effects data for selected targets
  const targetEffectsData = useSelectedTargetEffects(selectedArray)

  // Extended colour channels (W/A/UV) available across selected targets
  const extendedChannels = useMemo(() => {
    const propertySets: Array<readonly { type: string; category?: string; whiteChannel?: unknown; amberChannel?: unknown; uvChannel?: unknown }[]> = []
    for (const target of selectedArray) {
      if (target.type === 'fixture') {
        if (target.fixture.properties) propertySets.push(target.fixture.properties)
      } else if (fixtureList) {
        for (const f of fixtureList.filter((fi) => fi.groups.includes(target.name))) {
          if (f.properties) propertySets.push(f.properties)
        }
      }
    }
    return detectExtendedChannels(propertySets)
  }, [selectedArray, fixtureList])

  // Filter presets to those compatible with selected targets
  const filteredPresets = useMemo(() => {
    if (!presets || selectedArray.length === 0) return presets ?? []
    // Collect capabilities and fixture type keys from selected targets
    const targetCaps = new Set<string>()
    const targetTypeKeys = new Set<string>()
    for (const target of selectedArray) {
      if (target.type === 'group') {
        target.group.capabilities.forEach((c) => targetCaps.add(c))
        // Collect typeKeys of member fixtures
        if (fixtureList) {
          fixtureList
            .filter((f) => f.groups.includes(target.name))
            .forEach((f) => targetTypeKeys.add(f.typeKey))
        }
      } else {
        target.fixture.capabilities.forEach((c) => targetCaps.add(c))
        targetTypeKeys.add(target.fixture.typeKey)
      }
    }
    return presets.filter((preset) => {
      // Check capability compatibility
      const requiredCaps = inferPresetCapabilities(preset.effects)
      if (!requiredCaps.every((cap) => targetCaps.has(cap))) return false
      // Check fixture type if set on preset
      if (preset.fixtureType && !targetTypeKeys.has(preset.fixtureType)) return false
      // Check extended colour channel compatibility
      const requiredExt = inferPresetExtendedChannels(preset.effects)
      if (requiredExt && extendedChannels) {
        if (requiredExt.white && !extendedChannels.white) return false
        if (requiredExt.amber && !extendedChannels.amber) return false
        if (requiredExt.uv && !extendedChannels.uv) return false
      } else if (requiredExt && !extendedChannels) {
        // Preset needs extended channels but target has none
        return false
      }
      return true
    })
  }, [presets, selectedArray, fixtureList, extendedChannels])

  const handleApplyPreset = useCallback(
    (preset: FxPreset) => {
      return applyPreset(preset, 'none', targetEffectsData)
    },
    [applyPreset, targetEffectsData],
  )

  // Determine common fixture type from selected targets for preset pre-population
  const commonFixtureType = useMemo(() => {
    if (selectedArray.length === 0 || !fixtureList) return null
    const typeKeys = new Set<string>()
    for (const target of selectedArray) {
      if (target.type === 'fixture') {
        typeKeys.add(target.fixture.typeKey)
      } else {
        const members = fixtureList.filter((f) => f.groups.includes(target.name))
        members.forEach((f) => typeKeys.add(f.typeKey))
      }
    }
    if (typeKeys.size === 1) return [...typeKeys][0]
    return null
  }, [selectedArray, fixtureList])

  // Detect whether any selected GROUP target has multi-element (multi-head) fixtures.
  // Element Mode is a group-only concept (PER_FIXTURE vs FLAT across the group),
  // so individual fixtures never show this option.
  const hasMultiElementTarget = useMemo(() => {
    if (!fixtureList) return false
    return selectedArray.some((target) => {
      if (target.type !== 'group') return false
      const members = fixtureList.filter((f) => f.groups.includes(target.name))
      return members.some((f) => f.elements && f.elements.length > 1)
    })
  }, [selectedArray, fixtureList])

  // Show distribution for groups or multi-head single fixtures
  const showDistribution = useMemo(() => {
    return selectedArray.some((target) => {
      if (target.type === 'group') return true
      return (target.fixture.elementGroupProperties?.length ?? 0) > 0
    })
  }, [selectedArray])

  const handleSavePreset = useCallback(
    async (input: FxPresetInput) => {
      if (!currentProject) return
      if (editingPreset) {
        await savePreset({ projectId: currentProject.id, presetId: editingPreset.id, ...input }).unwrap()
      } else {
        await createPreset({ projectId: currentProject.id, ...input }).unwrap()
      }
    },
    [currentProject, createPreset, savePreset, editingPreset],
  )

  const handleEditPreset = useCallback((preset: FxPreset) => {
    setEditingPreset(preset)
    setPresetFormOpen(true)
  }, [])

  const handleDeletePreset = useCallback(async () => {
    if (!currentProject || !editingPreset) return
    await deletePreset({ projectId: currentProject.id, presetId: editingPreset.id }).unwrap()
    setPresetFormOpen(false)
    setEditingPreset(null)
  }, [currentProject, editingPreset, deletePreset])

  return (
    <div className="flex flex-col h-full">
      {isDesktop ? (
        <div className="flex-1 flex min-h-0">
          <div className="w-72 border-r overflow-y-auto shrink-0">
            <TargetList
              selectedTargets={selectedTargets}
              onSelect={handleSelectTarget}
              onToggle={toggleTarget}
            />
          </div>
          <div className="flex-1 min-w-0 min-h-0">
            <EffectPadWrapper
              selectedTargets={selectedArray}
              targetEffectsData={targetEffectsData}
              effectsByCategory={effectsByCategory}
              computePresence={computePresence}
              toggleEffect={toggleEffect}
              defaultBeatDivision={defaultBeatDivision}
              onBeatDivisionChange={setDefaultBeatDivision}
              propertyButtons={propertyButtons}
              computePropertyPresence={computePropertyPresence}
              togglePropertyEffect={togglePropertyEffect}
              getActivePropertyValue={getActivePropertyValue}
              setEditingEffect={setEditingEffect}
              setConfiguringEffect={setConfiguringEffect}
              presets={filteredPresets}
              onApplyPreset={handleApplyPreset}
              computePresetPresence={computePresetPresence}
              currentProjectId={currentProject?.id}
              onCreatePreset={() => { setEditingPreset(null); setPresetFormOpen(true) }}
              onEditPreset={handleEditPreset}
              headerContent={
                <SelectedTargetSummary
                  targets={selectedArray}
                  onDeselect={toggleTarget}
                  expandedGroups={expandedGroups}
                  onToggleGroupExpanded={toggleGroupExpanded}
                  onFixtureClick={setDetailFixtureKey}
                />
              }
            />
          </div>
        </div>
      ) : selectedTargets.size === 0 ? (
        /* Mobile: nothing selected — show target list inline for discoverability */
        <div className="flex-1 overflow-y-auto">
          <TargetList
            selectedTargets={selectedTargets}
            onSelect={handleSelectTarget}
            onToggle={toggleTarget}
          />
        </div>
      ) : (
        /* Mobile: targets selected — show effects with sheet for quick target switching */
        <div className="flex-1 min-h-0">
          <EffectPadWrapper
            selectedTargets={selectedArray}
            targetEffectsData={targetEffectsData}
            effectsByCategory={effectsByCategory}
            computePresence={computePresence}
            toggleEffect={toggleEffect}
            defaultBeatDivision={defaultBeatDivision}
            onBeatDivisionChange={setDefaultBeatDivision}
            propertyButtons={propertyButtons}
            computePropertyPresence={computePropertyPresence}
            togglePropertyEffect={togglePropertyEffect}
            getActivePropertyValue={getActivePropertyValue}
            setEditingEffect={setEditingEffect}
            setConfiguringEffect={setConfiguringEffect}
            presets={filteredPresets}
            onApplyPreset={handleApplyPreset}
            computePresetPresence={computePresetPresence}
            currentProjectId={currentProject?.id}
            onCreatePreset={() => { setEditingPreset(null); setPresetFormOpen(true) }}
            onEditPreset={handleEditPreset}
            headerContent={
              <SelectedTargetSummary
                targets={selectedArray}
                onDeselect={toggleTarget}
                expandedGroups={expandedGroups}
                onToggleGroupExpanded={toggleGroupExpanded}
                onFixtureClick={setDetailFixtureKey}
              />
            }
          />
          <Sheet open={targetSheetOpen} onOpenChange={setTargetSheetOpen}>
            <SheetContent side="bottom" className="h-[70vh]">
              <SheetHeader>
                <SheetTitle>Select Targets</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto flex-1 -mx-6">
                <TargetList
                  selectedTargets={selectedTargets}
                  onSelect={handleSelectTarget}
                  onToggle={toggleTarget}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      <ActiveEffectSheet context={editingEffect} onClose={() => setEditingEffect(null)} />
      <ConfigureEffectSheet
        effect={configuringEffect}
        defaultBeatDivision={defaultBeatDivision}
        showDistribution={showDistribution}
        showElementMode={hasMultiElementTarget}
        extendedChannels={extendedChannels}
        onApply={(params) => {
          if (configuringEffect) {
            applyEffectWithParams(configuringEffect, targetEffectsData, params)
          }
          setConfiguringEffect(null)
        }}
        onClose={() => setConfiguringEffect(null)}
      />
      <PresetForm
        open={presetFormOpen}
        onOpenChange={(open) => { setPresetFormOpen(open); if (!open) setEditingPreset(null) }}
        preset={editingPreset}
        onSave={handleSavePreset}
        isSaving={isCreatingPreset || isSavingPreset}
        defaultFixtureType={editingPreset ? undefined : commonFixtureType}
        onDelete={editingPreset ? handleDeletePreset : undefined}
        isDeleting={isDeletingPreset}
      />
      <FixtureDetailModal
        fixtureKey={detailFixtureKey}
        onClose={() => setDetailFixtureKey(null)}
      />
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
  computePresence,
  toggleEffect,
  defaultBeatDivision,
  onBeatDivisionChange,
  propertyButtons,
  computePropertyPresence,
  togglePropertyEffect,
  getActivePropertyValue,
  setEditingEffect,
  setConfiguringEffect,
  presets,
  onApplyPreset,
  computePresetPresence,
  currentProjectId,
  onCreatePreset,
  onEditPreset,
  headerContent,
}: {
  selectedTargets: BuskingTarget[]
  targetEffectsData: TargetEffectsData[]
  effectsByCategory: Record<string, EffectLibraryEntry[]>
  computePresence: (effectName: string, data: TargetEffectsData[]) => EffectPresence
  toggleEffect: (effect: EffectLibraryEntry, presence: EffectPresence, data: TargetEffectsData[]) => Promise<void>
  defaultBeatDivision: number
  onBeatDivisionChange: (value: number) => void
  propertyButtons: PropertyButton[]
  computePropertyPresence: (button: PropertyButton, data: TargetEffectsData[]) => EffectPresence
  togglePropertyEffect: (button: PropertyButton, presence: EffectPresence, data: TargetEffectsData[], settingLevel?: number) => Promise<void>
  getActivePropertyValue: (button: PropertyButton, data: TargetEffectsData[]) => string | null
  setEditingEffect: (ctx: ActiveEffectContext | null) => void
  setConfiguringEffect: (effect: EffectLibraryEntry | null) => void
  presets: FxPreset[]
  onApplyPreset: (preset: FxPreset) => Promise<void>
  computePresetPresence: (preset: FxPreset, data: TargetEffectsData[]) => EffectPresence
  currentProjectId: number | undefined
  onCreatePreset: () => void
  onEditPreset: (preset: FxPreset) => void
  headerContent?: React.ReactNode
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
      // Effect not active on any target — open configure sheet
      setConfiguringEffect(effect)
    },
    [targetEffectsData, setEditingEffect, setConfiguringEffect],
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

  const getPresetPresence = useCallback(
    (preset: FxPreset): EffectPresence => {
      return computePresetPresence(preset, targetEffectsData)
    },
    [computePresetPresence, targetEffectsData],
  )

  return (
    <EffectPad
      effectsByCategory={effectsByCategory}
      getPresence={getPresence}
      onToggle={handleToggle}
      onLongPress={handleLongPress}
      hasSelection={selectedTargets.length > 0}
      headerContent={headerContent}
      presets={presets}
      onApplyPreset={onApplyPreset}
      getPresetPresence={getPresetPresence}
      currentProjectId={currentProjectId}
      defaultBeatDivision={defaultBeatDivision}
      onBeatDivisionChange={onBeatDivisionChange}
      propertyButtons={propertyButtons}
      getPropertyPresence={getPropertyPresence}
      onPropertyToggle={handlePropertyToggle}
      onPropertyLongPress={handlePropertyLongPress}
      getPropertyValue={getPropertyValue}
      onCreatePreset={onCreatePreset}
      onEditPreset={onEditPreset}
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
