import { useState, useCallback, useMemo, useEffect } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useGroupActiveEffectsQuery } from '@/store/groups'
import { useFixtureEffectsQuery } from '@/store/fixtureFx'
import { useFixtureListQuery } from '@/store/fixtures'
import { useCurrentProjectQuery } from '@/store/projects'
import { useLookListQuery } from '@/store/looks'
import { useTemplateListQuery, useToggleTemplateMutation } from '@/store/templates'
import { useNavigate } from 'react-router'
import { FAMILY_LABELS } from '@/lib/attributeFamily'
import { templateLayerPresence } from './lookPresence'
import { useProgrammerLayersQuery } from '@/store/programmer'
import { describeLookContents, type PadItem } from './EffectPad'
import type { AttributeFamily } from '@/lib/attributeFamily'
import type { CueTarget } from '@/api/cuesApi'
import { TargetList } from './TargetList'
import { EffectPad } from './EffectPad'
import { SelectedTargetSummary } from './SelectedTargetSummary'
import { ActiveEffectSheet } from './ActiveEffectSheet'
import { ConfigureEffectSheet } from './ConfigureEffectSheet'
import { FixtureDetailModal } from '@/components/groups/FixtureDetailModal'
import { useBuskingState, type TargetEffectsData } from './useBuskingState'
import { programmerClearEntry, useProgrammerRevision } from '@/store/programmer'
import {
  type BuskingTarget,
  type PropertyButton,
  type ActiveEffectContext,
  type EffectPresence,
  buskingTargetKey,
  normalizeEffectName,
} from './buskingTypes'
import { detectExtendedChannels } from '@/components/fx/colourUtils'
import { toast } from 'sonner'
import { formatError } from '@/lib/formatError'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

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
  const [detailFixtureKey, setDetailFixtureKey] = useState<string | null>(null)

  // Fetch looks for the current project
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: looks } = useLookListQuery(
    { projectId: currentProject?.id ?? 0 },
    { skip: !currentProject },
  )
  const { data: templates } = useTemplateListQuery(
    { projectId: currentProject?.id ?? 0 },
    { skip: !currentProject },
  )
  // The layer stack, because a template pad's ring can only be read from it: a template holds no
  // effects, so the running-effect presence a Look's ring uses has nothing to say about one.
  const { data: programmerLayers } = useProgrammerLayersQuery()
  const [toggleTemplate] = useToggleTemplateMutation()
  const navigate = useNavigate()
  // The editor needs rows and effects, which the library list does not carry.
  //
  // `currentData`, **not** `data` — see the same read in `routes/Looks.tsx`: `data` falls back to
  // the previous arg's result while a new one is in flight (and `isLoading` is false whenever it
  // does), so editing one Look then opening another would seed the editor from the first and let
  // Save write its rows into the second.
  const { data: fixtureList } = useFixtureListQuery()

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
   * The selection in the layer/toggle target shape, with the same group-name convention `applyLook`
   * sends: a group is named by its *name*, a fixture by its key.
   */
  const selectedCueTargets = useMemo<CueTarget[]>(
    () =>
      selectedArray.map((target) => ({
        type: target.type,
        key: target.type === 'group' ? target.name : target.key,
      })),
    [selectedArray],
  )

  /**
   * What the selection can actually take, in capability terms: the union over the selected targets.
   *
   * The **only** filter left. There used to be a second one on `editorFixtureType` — a Look was
   * refused unless it had been authored against one of the selected fixtures' types — and that gate
   * is precisely what made "Amber Key" a MAC Aura's colour rather than a colour (D6). It went with
   * the column.
   */
  const targetCapabilities = useMemo(() => {
    const caps = new Set<string>()
    for (const target of selectedArray) {
      if (target.type === 'group') target.group.capabilities.forEach((c) => caps.add(c))
      else target.fixture.capabilities.forEach((c) => caps.add(c))
    }
    return caps
  }, [selectedArray])

  /**
   * The pads: Looks with **deferred effects**, plus every template.
   *
   * Both belong here and for the same reason — a pad puts a named thing on whatever is selected, so
   * the thing has to be one that takes its targets from the press. For a Look that means a deferred
   * *effect* (a chase you point somewhere); its bound rows name their own heads and reach the stage
   * through a cue layer or Include instead. A template is target-less by definition, which is what
   * made a palette bank a pad grid in the first place.
   */
  const padItems = useMemo<PadItem[]>(() => {
    /**
     * Does every family this thing touches have a capability the selection can answer?
     *
     * BEAM is deliberately unfiltered: a gobo wheel and a zoom are separate channels with no single
     * capability flag, and the backend skips a property a fixture lacks. Nothing to filter on.
     */
    const familiesFit = (families: readonly AttributeFamily[]) => {
      if (selectedArray.length === 0) return true
      return families.every((family) => {
        if (family === 'INTENSITY') return targetCapabilities.has('dimmer')
        if (family === 'COLOUR') return targetCapabilities.has('colour')
        if (family === 'POSITION') return targetCapabilities.has('position')
        return true
      })
    }

    const lookPads: PadItem[] = (looks ?? [])
      .filter((look) => look.hasDeferredEffects)
      .filter((look) => familiesFit(look.families))
      .map((look) => ({
        key: `look-${look.id}`,
        name: look.name,
        notes: look.notes,
        detail: describeLookContents(look),
        kind: 'look' as const,
        presence: computeLookPresence(look, targetEffectsData),
        onToggle: () => void applyLook(look, 'none', targetEffectsData),
        onEdit: () => navigate(`/projects/${currentProject?.id ?? 0}/looks`),
      }))

    const templatePads: PadItem[] = (templates ?? [])
      .filter((t) => t.family == null || familiesFit([t.family]))
      .map((template) => ({
        key: `template-${template.id}`,
        name: template.name,
        notes: template.notes,
        detail: template.isGeneric
          ? (template.family != null ? FAMILY_LABELS[template.family].singular : 'value')
          : `${template.rows.length} heads`,
        kind: 'template' as const,
        // A template holds no effects, so the running-effect presence a Look's ring is read from
        // cannot answer for one. The layer stack can: `templateLayerPresence` asks whether a layer
        // applying this template covers the selection, which is the same question one press ago.
        presence: templateLayerPresence(programmerLayers ?? [], selectedCueTargets, template.id),
        onToggle: () => {
          if (currentProject == null) return
          void toggleTemplate({
            projectId: currentProject.id,
            templateId: template.id,
            targets: selectedCueTargets,
            propertyMask: template.family ?? undefined,
          })
            .unwrap()
            .catch((err) => toast.error(formatError(err)))
        },
        onEdit: () => navigate(`/projects/${currentProject?.id ?? 0}/templates`),
      }))

    return [...templatePads, ...lookPads]
  }, [
    looks,
    templates,
    targetCapabilities,
    selectedArray.length,
    computeLookPresence,
    targetEffectsData,
    applyLook,
    navigate,
    currentProject,
    programmerLayers,
    selectedCueTargets,
    toggleTemplate,
  ])

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
              padItems={padItems}
              currentProjectId={currentProject?.id}
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
            padItems={padItems}
            currentProjectId={currentProject?.id}
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
  padItems,
  currentProjectId,
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
  padItems: PadItem[]
  currentProjectId: number | undefined
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

  return (
    <EffectPad
      effectsByCategory={effectsByCategory}
      getPresence={getPresence}
      onToggle={handleToggle}
      onLongPress={handleLongPress}
      hasSelection={selectedTargets.length > 0}
      headerContent={headerContent}
      padItems={padItems}
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
      key: buskingTargetKey(target),
      target,
      groupEffects: isGroup ? groupEffects ?? [] : undefined,
      fixtureDirectEffects: isFixture ? fixtureEffects?.direct ?? [] : undefined,
    }
  }, [target, isGroup, isFixture, groupEffects, fixtureEffects])
}
