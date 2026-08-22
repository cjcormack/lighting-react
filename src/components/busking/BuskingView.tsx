import { useState, useCallback, useMemo, useEffect } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useGroupActiveEffectsQuery } from '@/store/groups'
import { useFixtureEffectsQuery } from '@/store/fixtureFx'
import { useFixtureListQuery } from '@/store/fixtures'
import { useCurrentProjectQuery } from '@/store/projects'
import { useLookListQuery, useLookQuery, useCreateLookMutation, useSaveLookMutation, useDeleteLookMutation } from '@/store/looks'
import { TargetList } from './TargetList'
import { EffectPad } from './EffectPad'
import { SelectedTargetSummary } from './SelectedTargetSummary'
import { ActiveEffectSheet } from './ActiveEffectSheet'
import { ConfigureEffectSheet } from './ConfigureEffectSheet'
import { LookEditor } from '@/components/looks/LookEditor'
import { FixtureDetailModal } from '@/components/groups/FixtureDetailModal'
import { useBuskingState, type TargetEffectsData } from './useBuskingState'
import { programmerClearEntry, useProgrammerRevision } from '@/store/programmer'
import {
  type BuskingTarget,
  type PropertyButton,
  type ActiveEffectContext,
  type EffectPresence,
  targetKey,
  normalizeEffectName,
} from './buskingTypes'
import { detectExtendedChannels } from '@/components/fx/colourUtils'
import { toast } from 'sonner'
import { formatError } from '@/lib/formatError'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { LookInput, LookSummary } from '@/api/looksApi'

interface BuskingViewProps {
  /** Called whenever the set of selected targets changes, with control functions */
  onSelectionChange?: (targetNames: string[], controls: { clearSelection: () => void; openTargetPicker: () => void }) => void
}

export function BuskingView({ onSelectionChange }: BuskingViewProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [targetSheetOpen, setTargetSheetOpen] = useState(false)

  const {
    selectedTargets,
    selectTarget,
    toggleTarget,
    clearSelection,
    defaultBeatDivision,
    setDefaultBeatDivision,
    defaultSpeedMasterUuid,
    setDefaultSpeedMasterUuid,
    effectsByCategory,
    computePresence,
    toggleEffect,
    propertyButtons,
    computePropertyPresence,
    togglePropertyEffect,
    getActivePropertyValue,
    applyLook,
    computeLookPresence,
    applyEffectWithParams,
    editingEffect,
    setEditingEffect,
  } = useBuskingState()

  const [configuringEffect, setConfiguringEffect] = useState<EffectLibraryEntry | null>(null)
  const [lookFormOpen, setLookFormOpen] = useState(false)
  const [editingLookId, setEditingLookId] = useState<number | null>(null)
  const [detailFixtureKey, setDetailFixtureKey] = useState<string | null>(null)

  // Fetch looks for the current project
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: looks } = useLookListQuery(
    { projectId: currentProject?.id ?? 0 },
    { skip: !currentProject },
  )
  // The editor needs rows and effects, which the library list does not carry.
  const { data: editingLook } = useLookQuery(
    { projectId: currentProject?.id ?? 0, lookId: editingLookId ?? 0 },
    { skip: !currentProject || editingLookId == null },
  )
  const { data: fixtureList } = useFixtureListQuery()
  const [createLook, { isLoading: isCreatingLook }] = useCreateLookMutation()
  const [saveLook, { isLoading: isSavingLook }] = useSaveLookMutation()
  const [deleteLook, { isLoading: isDeletingLook }] = useDeleteLookMutation()

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

  /**
   * The Looks a pad can put on the current selection.
   *
   * **Deferred Looks only.** A bound Look names its own fixtures, so toggling it onto whatever
   * happens to be selected would apply rows meant for other heads; it reaches the stage through a
   * cue layer or Include instead. The toggle route offers only a Look's deferred rows for exactly
   * the same reason, so a bound Look on a pad would fire nothing at all.
   *
   * Filtering is by derived **family** and by `editorFixtureType`, both of which the summary
   * carries. It no longer checks extended colour channels (W/A/UV): that needs the effects'
   * parameters, which only the detail carries, and fetching every Look to draw a pad grid is not
   * worth it — the backend already skips a channel a fixture does not have.
   */
  const filteredLooks = useMemo(() => {
    const deferred = (looks ?? []).filter((look) => look.hasDeferredRows)
    if (selectedArray.length === 0) return deferred
    const targetCaps = new Set<string>()
    const targetTypeKeys = new Set<string>()
    for (const target of selectedArray) {
      if (target.type === 'group') {
        target.group.capabilities.forEach((c) => targetCaps.add(c))
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
    return deferred.filter((look) => {
      const requiredCaps: string[] = []
      for (const family of look.families) {
        if (family === 'INTENSITY') requiredCaps.push('dimmer')
        else if (family === 'COLOUR') requiredCaps.push('colour')
        else if (family === 'POSITION') requiredCaps.push('position')
        // BEAM has no single capability flag — a gobo wheel and a zoom are separate channels, and
        // the backend skips a property the fixture lacks. Nothing to filter on.
      }
      if (!requiredCaps.every((cap) => targetCaps.has(cap))) return false
      if (look.editorFixtureType && !targetTypeKeys.has(look.editorFixtureType)) return false
      return true
    })
  }, [looks, selectedArray, fixtureList])

  const handleApplyLook = useCallback(
    (look: LookSummary) => {
      return applyLook(look, 'none', targetEffectsData)
    },
    [applyLook, targetEffectsData],
  )

  // Determine common fixture type from selected targets, to pre-populate a new Look's editor hint
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

  const handleSaveLook = useCallback(
    async (input: LookInput) => {
      if (!currentProject) return
      if (editingLookId != null) {
        // The editor seeds itself from `editingLook`, so until that detail lands it is showing an
        // *empty* draft of an existing Look — and `input.rows` would then be `[]`, which a PUT
        // reads as "clear them". Throwing keeps the sheet open and shows the reason inline.
        if (editingLook == null) {
          throw new Error("This look hasn't finished loading yet — try again in a moment.")
        }
        await saveLook({ projectId: currentProject.id, lookId: editingLookId, ...input }).unwrap()
      } else {
        await createLook({ projectId: currentProject.id, ...input }).unwrap()
      }
    },
    [currentProject, createLook, saveLook, editingLookId, editingLook],
  )

  const handleEditLook = useCallback((look: LookSummary) => {
    setEditingLookId(look.id)
    setLookFormOpen(true)
  }, [])

  const handleDeleteLook = useCallback(async () => {
    if (!currentProject || editingLookId == null) return
    // LookEditor invokes onDelete fire-and-forget, so nothing downstream catches this — and
    // `deleteLook` is in `SILENT_ENDPOINTS`, so nothing toasts for it either. Report it here and
    // leave the editor open on a delete that didn't land.
    try {
      await deleteLook({ projectId: currentProject.id, lookId: editingLookId }).unwrap()
    } catch (err) {
      toast.error(formatError(err))
      return
    }
    setLookFormOpen(false)
    setEditingLookId(null)
  }, [currentProject, editingLookId, deleteLook])

  return (
    <div className="flex flex-col h-full">
      {isDesktop ? (
        <div className="flex-1 flex min-h-0">
          <div className="w-52 lg:w-72 border-r overflow-y-auto shrink-0">
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
              defaultSpeedMasterUuid={defaultSpeedMasterUuid}
              onSpeedMasterChange={setDefaultSpeedMasterUuid}
              propertyButtons={propertyButtons}
              computePropertyPresence={computePropertyPresence}
              togglePropertyEffect={togglePropertyEffect}
              getActivePropertyValue={getActivePropertyValue}
              setEditingEffect={setEditingEffect}
              setConfiguringEffect={setConfiguringEffect}
              looks={filteredLooks}
              onApplyLook={handleApplyLook}
              computeLookPresence={computeLookPresence}
              currentProjectId={currentProject?.id}
              onCreateLook={() => { setEditingLookId(null); setLookFormOpen(true) }}
              onEditLook={handleEditLook}
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
            defaultSpeedMasterUuid={defaultSpeedMasterUuid}
            onSpeedMasterChange={setDefaultSpeedMasterUuid}
            propertyButtons={propertyButtons}
            computePropertyPresence={computePropertyPresence}
            togglePropertyEffect={togglePropertyEffect}
            getActivePropertyValue={getActivePropertyValue}
            setEditingEffect={setEditingEffect}
            setConfiguringEffect={setConfiguringEffect}
            looks={filteredLooks}
            onApplyLook={handleApplyLook}
            computeLookPresence={computeLookPresence}
            currentProjectId={currentProject?.id}
            onCreateLook={() => { setEditingLookId(null); setLookFormOpen(true) }}
            onEditLook={handleEditLook}
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
              <div className="overflow-y-auto flex-1">
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
        defaultSpeedMasterUuid={defaultSpeedMasterUuid}
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
      <LookEditor
        open={lookFormOpen}
        onOpenChange={(open) => { setLookFormOpen(open); if (!open) setEditingLookId(null) }}
        look={editingLookId == null ? null : (editingLook ?? null)}
        onSave={handleSaveLook}
        isSaving={isCreatingLook || isSavingLook}
        defaultEditorFixtureType={editingLookId == null ? commonFixtureType : undefined}
        onDelete={editingLookId != null ? handleDeleteLook : undefined}
        isDeleting={isDeletingLook}
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
  defaultSpeedMasterUuid,
  onSpeedMasterChange,
  propertyButtons,
  computePropertyPresence,
  togglePropertyEffect,
  getActivePropertyValue,
  setEditingEffect,
  setConfiguringEffect,
  looks,
  onApplyLook,
  computeLookPresence,
  currentProjectId,
  onCreateLook,
  onEditLook,
  headerContent,
}: {
  selectedTargets: BuskingTarget[]
  targetEffectsData: TargetEffectsData[]
  effectsByCategory: Record<string, EffectLibraryEntry[]>
  computePresence: (effectName: string, data: TargetEffectsData[]) => EffectPresence
  toggleEffect: (effect: EffectLibraryEntry, presence: EffectPresence, data: TargetEffectsData[]) => Promise<void>
  defaultBeatDivision: number
  onBeatDivisionChange: (value: number) => void
  defaultSpeedMasterUuid: string | null
  onSpeedMasterChange: (masterUuid: string) => void
  propertyButtons: PropertyButton[]
  computePropertyPresence: (button: PropertyButton, data: TargetEffectsData[]) => EffectPresence
  togglePropertyEffect: (button: PropertyButton, presence: EffectPresence, data: TargetEffectsData[], settingLevel?: number) => Promise<void>
  getActivePropertyValue: (button: PropertyButton, data: TargetEffectsData[]) => string | null
  setEditingEffect: (ctx: ActiveEffectContext | null) => void
  setConfiguringEffect: (effect: EffectLibraryEntry | null) => void
  looks: LookSummary[]
  onApplyLook: (look: LookSummary) => Promise<void>
  computeLookPresence: (look: LookSummary, data: TargetEffectsData[]) => EffectPresence
  currentProjectId: number | undefined
  onCreateLook: () => void
  onEditLook: (look: LookSummary) => void
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

  // Property button bound callbacks.
  //
  // Property pads read the programmer directly (their values stopped being FX instances when
  // plain statics became programmer values), so they need a subscription to know when to look
  // again — the RTK Query summary only tracks counters, and re-setting a pad to a different
  // level leaves the count alone. Subscribing here is enough: EffectPad is not memoised, so a
  // re-render of this component recomputes every pad's presence and value from live state.
  useProgrammerRevision()

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

  /**
   * Long-press a property pad to release it.
   *
   * This used to open the underlying `StaticValue` / `StaticSetting` effect's parameter
   * sheet. Those instances no longer exist — a plain pad write is a programmer value now —
   * and the sheet's controls (blend mode, beat division, phase) never meant anything for a
   * flat value anyway. Releasing is the gesture the pad was missing.
   */
  const handlePropertyLongPress = useCallback(
    (button: PropertyButton) => {
      for (const data of targetEffectsData) {
        const target =
          data.target.type === 'group'
            ? ({ type: 'group', key: data.target.name } as const)
            : ({ type: 'fixture', key: data.target.key } as const)
        programmerClearEntry(target.type, target.key, button.propertyName)
      }
    },
    [targetEffectsData],
  )

  const getPropertyValue = useCallback(
    (button: PropertyButton): string | null => {
      return getActivePropertyValue(button, targetEffectsData)
    },
    [getActivePropertyValue, targetEffectsData],
  )

  const getLookPresence = useCallback(
    (look: LookSummary): EffectPresence => {
      return computeLookPresence(look, targetEffectsData)
    },
    [computeLookPresence, targetEffectsData],
  )

  return (
    <EffectPad
      effectsByCategory={effectsByCategory}
      getPresence={getPresence}
      onToggle={handleToggle}
      onLongPress={handleLongPress}
      hasSelection={selectedTargets.length > 0}
      headerContent={headerContent}
      looks={looks}
      onApplyLook={onApplyLook}
      getLookPresence={getLookPresence}
      currentProjectId={currentProjectId}
      defaultBeatDivision={defaultBeatDivision}
      onBeatDivisionChange={onBeatDivisionChange}
      defaultSpeedMasterUuid={defaultSpeedMasterUuid}
      onSpeedMasterChange={onSpeedMasterChange}
      propertyButtons={propertyButtons}
      getPropertyPresence={getPropertyPresence}
      onPropertyToggle={handlePropertyToggle}
      onPropertyLongPress={handlePropertyLongPress}
      getPropertyValue={getPropertyValue}
      onCreateLook={onCreateLook}
      onEditLook={onEditLook}
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
