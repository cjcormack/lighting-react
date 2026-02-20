import { useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { useEffectLibraryQuery, type EffectLibraryEntry } from '@/store/fixtureFx'
import { useGroupListQuery } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import { CueTargetPicker } from './CueTargetPicker'
import { EffectCategoryPicker } from '@/components/fx/EffectCategoryPicker'
import { EffectTypePicker } from '@/components/fx/EffectTypePicker'
import { EffectParameterForm } from '@/components/fx/EffectParameterForm'
import type { CueTarget, CueAdHocEffect } from '@/api/cuesApi'

const CATEGORY_ORDER = ['dimmer', 'colour', 'position', 'controls'] as const

// Maps UI categories to the fixture capability required to show them
const CATEGORY_TO_REQUIRED_CAPABILITY: Record<string, string | null> = {
  dimmer: 'dimmer',
  colour: 'colour',
  position: 'position',
  controls: null, // always available
}

type AddStep = 'targets' | 'category' | 'effect' | 'configure'

interface CueEffectFlowProps {
  /** Add mode: called with one CueAdHocEffect per selected target */
  onConfirm: (effects: CueAdHocEffect[]) => void
  onCancel: () => void

  /** Edit mode: pre-populated effect (skip target selection) */
  existingEffect?: CueAdHocEffect | null
  /** Edit mode: called with the updated single effect */
  onUpdate?: (effect: CueAdHocEffect) => void
  /** Edit mode: remove the effect */
  onRemove?: () => void
  /** Override palette for colour pickers (e.g. cue palette). */
  palette?: string[]
}

export function CueEffectFlow({
  onConfirm,
  onCancel,
  existingEffect,
  onUpdate,
  onRemove,
  palette,
}: CueEffectFlowProps) {
  const { data: library } = useEffectLibraryQuery()
  const { data: groups } = useGroupListQuery()
  const { data: fixtures } = useFixtureListQuery()

  const isEdit = !!existingEffect

  // ── Target selection state (add mode only) ──
  const [selectedTargets, setSelectedTargets] = useState<CueTarget[]>([])

  // ── Flow step state ──
  const [step, setStep] = useState<AddStep>(isEdit ? 'configure' : 'targets')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    existingEffect?.category ?? null,
  )
  const [selectedEntry, setSelectedEntry] = useState<EffectLibraryEntry | null>(null)

  // ── Effect parameter state ──
  const [beatDivision, setBeatDivision] = useState(existingEffect?.beatDivision ?? 1.0)
  const [blendMode, setBlendMode] = useState(existingEffect?.blendMode ?? 'OVERRIDE')
  const [phaseOffset, setPhaseOffset] = useState(existingEffect?.phaseOffset ?? 0)
  const [distribution, setDistribution] = useState(existingEffect?.distribution ?? 'LINEAR')
  const [elementMode, setElementMode] = useState(existingEffect?.elementMode ?? 'PER_FIXTURE')
  const [elementFilter, setElementFilter] = useState(existingEffect?.elementFilter ?? 'ALL')
  const [stepTiming, setStepTiming] = useState(existingEffect?.stepTiming ?? false)
  const [parameters, setParameters] = useState<Record<string, string>>(
    existingEffect?.parameters ?? {},
  )

  // ── Library lookup ──
  const libraryMap = useMemo(() => {
    if (!library) return new Map<string, EffectLibraryEntry>()
    const map = new Map<string, EffectLibraryEntry>()
    for (const entry of library) {
      const normalized = entry.name.toLowerCase().replace(/[\s_]/g, '')
      map.set(`${entry.category}:${normalized}`, entry)
      map.set(normalized, entry)
    }
    return map
  }, [library])

  const findLibraryEntry = useCallback(
    (effectType: string, category?: string): EffectLibraryEntry | undefined => {
      const normalized = effectType.toLowerCase().replace(/[\s_]/g, '')
      if (category) {
        const qualified = libraryMap.get(`${category}:${normalized}`)
        if (qualified) return qualified
      }
      return libraryMap.get(normalized)
    },
    [libraryMap],
  )

  // Resolve the library entry for edit mode (on first render)
  const editEntry = useMemo(() => {
    if (!existingEffect) return null
    return findLibraryEntry(existingEffect.effectType, existingEffect.category) ?? null
  }, [existingEffect, findLibraryEntry])

  // The "active" entry is either the one being added or the one being edited
  const activeEntry = selectedEntry ?? editEntry

  // Group library by category
  const libraryByCategory = useMemo(() => {
    if (!library) return {} as Record<string, EffectLibraryEntry[]>
    const grouped: Record<string, EffectLibraryEntry[]> = {}
    for (const entry of library) {
      if (!grouped[entry.category]) grouped[entry.category] = []
      grouped[entry.category].push(entry)
    }
    return grouped
  }, [library])

  // Set of capabilities required by any available effect category (for disabling targets)
  const requiredCaps = useMemo(() => {
    const caps = new Set<string>()
    for (const cat of CATEGORY_ORDER) {
      if (!libraryByCategory[cat] || libraryByCategory[cat].length === 0) continue
      const req = CATEGORY_TO_REQUIRED_CAPABILITY[cat]
      if (req) caps.add(req)
    }
    return caps
  }, [libraryByCategory])

  // Compute disabled keys: targets whose capabilities have NO overlap with required caps
  const disabledKeys = useMemo(() => {
    const disabled = new Map<string, string>()
    if (requiredCaps.size === 0) return disabled

    if (groups) {
      for (const group of groups) {
        const hasAny = group.capabilities.some((c) => requiredCaps.has(c))
        // Also keep targets available if they have controls capability (always-available category)
        if (!hasAny && group.capabilities.length > 0) {
          disabled.set(`group:${group.name}`, 'no effects')
        }
      }
    }
    if (fixtures) {
      for (const fixture of fixtures) {
        const hasAny = fixture.capabilities.some((c) => requiredCaps.has(c))
        if (!hasAny && fixture.capabilities.length > 0) {
          disabled.set(`fixture:${fixture.key}`, 'no effects')
        }
      }
    }
    return disabled
  }, [groups, fixtures, requiredCaps])

  // ── Capability-aware filtering ──
  // Compute intersection of capabilities from selected targets
  const targetCapabilities = useMemo(() => {
    const targets = isEdit
      ? [{ type: existingEffect!.targetType, key: existingEffect!.targetKey }]
      : selectedTargets

    if (targets.length === 0) return null

    const capSets: Set<string>[] = []
    for (const target of targets) {
      if (target.type === 'group') {
        const group = groups?.find((g) => g.name === target.key)
        if (group) capSets.push(new Set(group.capabilities))
      } else {
        const fixture = fixtures?.find((f) => f.key === target.key)
        if (fixture) capSets.push(new Set(fixture.capabilities))
      }
    }

    if (capSets.length === 0) return null

    // Intersection: keep only capabilities present in ALL targets
    const intersection = new Set(capSets[0])
    for (let i = 1; i < capSets.length; i++) {
      for (const cap of intersection) {
        if (!capSets[i].has(cap)) intersection.delete(cap)
      }
    }
    return intersection
  }, [selectedTargets, groups, fixtures, isEdit, existingEffect])

  // Check if any selected target is a group (affects element mode visibility)
  const hasGroupTarget = useMemo(() => {
    if (isEdit) return existingEffect!.targetType === 'group'
    return selectedTargets.some((t) => t.type === 'group')
  }, [selectedTargets, isEdit, existingEffect])

  // Filter library by capabilities
  const effectsByCategory = useMemo(() => {
    const filtered: Record<string, EffectLibraryEntry[]> = {}
    for (const cat of CATEGORY_ORDER) {
      const entries = libraryByCategory[cat]
      if (!entries || entries.length === 0) continue
      if (targetCapabilities) {
        const requiredCap = CATEGORY_TO_REQUIRED_CAPABILITY[cat]
        if (requiredCap && !targetCapabilities.has(requiredCap)) continue
      }
      // Controls: only show if capabilities suggest it (skip for mixed selections)
      if (cat === 'controls' && targetCapabilities && !hasControlsCapability(targetCapabilities)) {
        continue
      }
      filtered[cat] = entries
    }
    return filtered
  }, [libraryByCategory, targetCapabilities])

  // ── Handlers ──

  const handleTargetsNext = () => {
    setStep('category')
  }

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat)
    setStep('effect')
  }

  const handleSelectEffect = (entry: EffectLibraryEntry) => {
    setSelectedEntry(entry)
    const defaults: Record<string, string> = {}
    entry.parameters.forEach((p) => {
      defaults[p.name] = p.defaultValue
    })
    setParameters(defaults)
    setStep('configure')
  }

  const handleConfirmAdd = () => {
    if (!activeEntry) return

    // Build one CueAdHocEffect per selected target
    const effects: CueAdHocEffect[] = selectedTargets.map((target) => ({
      targetType: target.type,
      targetKey: target.key,
      effectType: activeEntry.name,
      category: activeEntry.category,
      propertyName: null, // backend auto-resolves
      beatDivision,
      blendMode,
      distribution,
      phaseOffset,
      elementMode: hasGroupTarget ? elementMode : null,
      elementFilter: elementFilter !== 'ALL' ? elementFilter : null,
      stepTiming: stepTiming || null,
      parameters: { ...parameters },
    }))

    onConfirm(effects)
  }

  const handleConfirmEdit = () => {
    if (!activeEntry || !existingEffect || !onUpdate) return

    onUpdate({
      ...existingEffect,
      effectType: activeEntry.name,
      category: activeEntry.category,
      beatDivision,
      blendMode,
      distribution,
      phaseOffset,
      elementMode: hasGroupTarget ? elementMode : null,
      elementFilter: elementFilter !== 'ALL' ? elementFilter : null,
      stepTiming: stepTiming || null,
      parameters: { ...parameters },
    })
  }

  const handleBack = () => {
    switch (step) {
      case 'targets':
        onCancel()
        break
      case 'category':
        setStep('targets')
        break
      case 'effect':
        setStep('category')
        break
      case 'configure':
        if (isEdit) {
          onCancel()
        } else {
          setStep('effect')
        }
        break
    }
  }

  // ── Render ──

  return (
    <div className="flex flex-col h-full">
      {/* ═══ Step 1: Target Selection ═══ */}
      {step === 'targets' && (
        <>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <button onClick={onCancel} className="hover:bg-accent rounded p-0.5 -ml-1">
              <ChevronLeft className="size-5" />
            </button>
            <div>
              <h3 className="font-medium text-sm">Select Targets</h3>
              <p className="text-xs text-muted-foreground">
                Choose which fixtures or groups to apply the effect to.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <CueTargetPicker
              selectedTargets={selectedTargets}
              onChange={setSelectedTargets}
              disabledKeys={disabledKeys}
            />
          </div>

          <div className="border-t px-4 pb-4 pt-2">
            <Button
              onClick={handleTargetsNext}
              disabled={selectedTargets.length === 0}
              className="w-full"
            >
              Next — Choose Effect
              {selectedTargets.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {selectedTargets.length} target{selectedTargets.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </Button>
          </div>
        </>
      )}

      {/* ═══ Step 2: Category Selection ═══ */}
      {step === 'category' && (
        <>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <button onClick={handleBack} className="hover:bg-accent rounded p-0.5 -ml-1">
              <ChevronLeft className="size-5" />
            </button>
            <div>
              <h3 className="font-medium text-sm">Choose Category</h3>
              <p className="text-xs text-muted-foreground">
                {selectedTargets.length} target{selectedTargets.length !== 1 ? 's' : ''} selected.
                Pick an effect category.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <EffectCategoryPicker
              effectsByCategory={effectsByCategory}
              onSelect={handleSelectCategory}
            />
          </div>
        </>
      )}

      {/* ═══ Step 3: Effect Selection ═══ */}
      {step === 'effect' && selectedCategory && (
        <>
          <div className="flex-1 overflow-y-auto">
            <EffectTypePicker
              category={selectedCategory}
              effects={effectsByCategory[selectedCategory] ?? []}
              onSelect={handleSelectEffect}
              onBack={handleBack}
            />
          </div>
        </>
      )}

      {/* ═══ Step 4: Configure ═══ */}
      {step === 'configure' && activeEntry && (
        <>
          <div className="flex-1 overflow-y-auto">
            <EffectParameterForm
              effect={activeEntry}
              beatDivision={beatDivision}
              onBeatDivisionChange={setBeatDivision}
              blendMode={blendMode}
              onBlendModeChange={setBlendMode}
              phaseOffset={phaseOffset}
              onPhaseOffsetChange={setPhaseOffset}
              startOnBeat={false}
              onStartOnBeatChange={() => {}}
              showStartOnBeat={false}
              parameters={parameters}
              onParametersChange={setParameters}
              targetPropertyName={null}
              isEdit={isEdit}
              onBack={handleBack}
              distributionStrategy={distribution}
              onDistributionStrategyChange={setDistribution}
              showDistribution={hasGroupTarget}
              elementMode={elementMode}
              onElementModeChange={setElementMode}
              showElementMode={hasGroupTarget}
              elementFilter={elementFilter}
              onElementFilterChange={setElementFilter}
              showElementFilter={hasGroupTarget}
              stepTiming={stepTiming}
              onStepTimingChange={setStepTiming}
              // Extended channels: show all since targets may be mixed
              extendedChannels={{ white: true, amber: true, uv: true }}
              palette={palette}
            />
          </div>

          <div className="border-t px-4 pb-4 pt-2 flex gap-2">
            {isEdit && onRemove && (
              <Button variant="destructive" size="sm" onClick={onRemove} className="gap-1">
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            )}
            <div className="flex-1" />
            <Button
              onClick={isEdit ? handleConfirmEdit : handleConfirmAdd}
            >
              {isEdit ? 'Save Changes' : 'Add Effect'}
              {!isEdit && selectedTargets.length > 1 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  x{selectedTargets.length}
                </Badge>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/** Check if the capability set suggests "controls" effects are useful. */
function hasControlsCapability(capabilities: Set<string>): boolean {
  // Controls category covers settings and non-dimmer sliders.
  // If any capability beyond basic dimmer/colour/position is present, show it.
  for (const cap of capabilities) {
    if (cap !== 'dimmer' && cap !== 'colour' && cap !== 'position') {
      return true
    }
  }
  return false
}
