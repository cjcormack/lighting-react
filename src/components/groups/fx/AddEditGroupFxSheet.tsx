import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  useEffectLibraryQuery,
  type EffectLibraryEntry,
} from '@/store/fixtureFx'
import {
  useApplyGroupFxMutation,
  useUpdateGroupFxMutation,
} from '@/store/groups'
import { useFixtureListQuery, type SettingPropertyDescriptor, type SliderPropertyDescriptor } from '@/store/fixtures'
import type { GroupSummary, GroupActiveEffect, BlendMode, DistributionStrategy, ElementMode } from '@/api/groupsApi'
import { EffectCategoryPicker } from '../../fixtures/fx/EffectCategoryPicker'
import { EffectTypePicker } from '../../fixtures/fx/EffectTypePicker'
import { EffectParameterForm } from '../../fixtures/fx/EffectParameterForm'

type SheetMode =
  | { mode: 'add' }
  | { mode: 'edit'; effectId: number; effect: GroupActiveEffect }

interface AddEditGroupFxSheetProps {
  group: GroupSummary
  mode: SheetMode | undefined
  onClose: () => void
}

type Step = 'category' | 'effect' | 'configure'

export function AddEditGroupFxSheet({ group, mode, onClose }: AddEditGroupFxSheetProps) {
  const isOpen = mode !== undefined
  const isEdit = mode?.mode === 'edit'

  const { data: library } = useEffectLibraryQuery(undefined, { skip: !isOpen })
  const { data: fixtureList } = useFixtureListQuery()
  const [applyFx] = useApplyGroupFxMutation()
  const [updateFx] = useUpdateGroupFxMutation()

  const [step, setStep] = useState<Step>('category')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedEffect, setSelectedEffect] = useState<EffectLibraryEntry | null>(null)

  const [beatDivision, setBeatDivision] = useState(1.0)
  const [blendMode, setBlendMode] = useState('OVERRIDE')
  const [phaseOffset, setPhaseOffset] = useState(0)
  const [parameters, setParameters] = useState<Record<string, string>>({})
  const [distributionStrategy, setDistributionStrategy] = useState('LINEAR')
  const [elementMode, setElementMode] = useState<ElementMode>('PER_FIXTURE')
  const [selectedSettingProp, setSelectedSettingProp] = useState<string | null>(null)
  const [selectedSliderProp, setSelectedSliderProp] = useState<string | null>(null)

  // Find member fixtures for this group
  const memberFixtures = useMemo(() => {
    if (!fixtureList) return []
    return fixtureList.filter((f) => f.groups.includes(group.name))
  }, [fixtureList, group.name])

  // Detect if the group has any multi-element members (fixtures with elements array)
  const hasMultiElementMembers = useMemo(() => {
    return memberFixtures.some((f) => f.elements && f.elements.length > 1)
  }, [memberFixtures])

  // Collect all property names from group capabilities AND member fixture properties.
  // Multi-head fixtures expose per-head capabilities (colour, position, etc.) via
  // elementGroupProperties which may not be reflected in group.capabilities.
  const allPropertyNames = useMemo(() => {
    const names = new Set(group.capabilities)
    for (const fixture of memberFixtures) {
      fixture.properties?.forEach((p) => names.add(p.name))
      fixture.elementGroupProperties?.forEach((p) => names.add(p.name))
    }
    // Add sentinel "setting" if any member fixture has setting-type properties
    if (memberFixtures.some((f) => f.properties?.some((p) => p.type === 'setting'))) {
      names.add('setting')
    }
    // Add sentinel "slider" if any member has non-dimmer/non-UV slider properties
    if (memberFixtures.some((f) => f.properties?.some((p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv'))) {
      names.add('slider')
    }
    return names
  }, [group.capabilities, memberFixtures])

  // Filter library by all available property names
  const compatibleEffects = useMemo(() => {
    if (!library) return []
    return library.filter((effect) =>
      effect.compatibleProperties.some((propName) => allPropertyNames.has(propName)),
    )
  }, [library, allPropertyNames])

  // Group compatible effects by category
  const effectsByCategory = useMemo(() => {
    const grouped: Record<string, EffectLibraryEntry[]> = {}
    for (const effect of compatibleEffects) {
      const cat = effect.category
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(effect)
    }
    return grouped
  }, [compatibleEffects])

  // All setting-type properties across member fixtures (deduplicated by name)
  const settingProperties = useMemo(() => {
    const seen = new Set<string>()
    const result: SettingPropertyDescriptor[] = []
    for (const fixture of memberFixtures) {
      for (const p of fixture.properties ?? []) {
        if (p.type === 'setting' && !seen.has(p.name)) {
          seen.add(p.name)
          result.push(p as SettingPropertyDescriptor)
        }
      }
    }
    return result
  }, [memberFixtures])

  // All non-dimmer/non-UV slider properties across member fixtures (deduplicated by name)
  const extraSliderProperties = useMemo(() => {
    const seen = new Set<string>()
    const result: SliderPropertyDescriptor[] = []
    for (const fixture of memberFixtures) {
      for (const p of fixture.properties ?? []) {
        if (p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv' && !seen.has(p.name)) {
          seen.add(p.name)
          result.push(p as SliderPropertyDescriptor)
        }
      }
    }
    return result
  }, [memberFixtures])

  // Resolve the target property name for the selected effect.
  // For setting effects, use the user-chosen setting property (or default to first).
  // For slider effects matched via "slider" sentinel, use the user-chosen slider property.
  const targetPropertyName = useMemo((): string | null => {
    if (!selectedEffect) return null
    const matched = selectedEffect.compatibleProperties.find((name) => allPropertyNames.has(name)) ?? null
    if (matched === 'setting') {
      if (selectedSettingProp && settingProperties.some((sp) => sp.name === selectedSettingProp)) {
        return selectedSettingProp
      }
      return settingProperties[0]?.name ?? null
    }
    if (matched === 'slider') {
      if (selectedSliderProp && extraSliderProperties.some((sp) => sp.name === selectedSliderProp)) {
        return selectedSliderProp
      }
      return extraSliderProperties[0]?.name ?? null
    }
    return matched
  }, [selectedEffect, allPropertyNames, settingProperties, selectedSettingProp, extraSliderProperties, selectedSliderProp])

  // Get setting options for the currently-targeted setting property
  const settingOptions = useMemo(() => {
    if (!selectedEffect?.compatibleProperties.includes('setting') || !targetPropertyName) return undefined
    const settingProp = settingProperties.find((sp) => sp.name === targetPropertyName)
    return settingProp?.options
  }, [selectedCategory, targetPropertyName, settingProperties])

  // Reset state when opening/closing
  useEffect(() => {
    if (!isOpen) return

    if (isEdit && mode.mode === 'edit') {
      setStep('configure')
      // Library names use CamelCase (e.g. "ColourCycle") while the API returns
      // spaced names (e.g. "Colour Cycle"). Normalize both for matching.
      const normalize = (s: string) => s.toLowerCase().replace(/[\s_]/g, '')
      const entry = library?.find(
        (e) => normalize(e.name) === normalize(mode.effect.effectType),
      )
      setSelectedEffect(entry ?? null)
      setSelectedCategory(entry?.category ?? null)
      setBeatDivision(mode.effect.beatDivision)
      setBlendMode(mode.effect.blendMode)
      setPhaseOffset(mode.effect.phaseOffset)
      setParameters({ ...mode.effect.parameters })
      setDistributionStrategy(mode.effect.distribution)
      setElementMode(mode.effect.elementMode ?? 'PER_FIXTURE')
      setSelectedSettingProp(mode.effect.propertyName ?? null)
      setSelectedSliderProp(mode.effect.propertyName ?? null)
    } else {
      setStep('category')
      setSelectedCategory(null)
      setSelectedEffect(null)
      setBeatDivision(1.0)
      setBlendMode('OVERRIDE')
      setPhaseOffset(0)
      setParameters({})
      setDistributionStrategy('LINEAR')
      setElementMode('PER_FIXTURE')
      setSelectedSettingProp(null)
      setSelectedSliderProp(null)
    }
  }, [isOpen, mode, library, isEdit])

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat)
    setStep('effect')
  }

  const handleSelectEffect = (effect: EffectLibraryEntry) => {
    setSelectedEffect(effect)
    const defaults: Record<string, string> = {}
    effect.parameters.forEach((p) => {
      defaults[p.name] = p.defaultValue
    })
    setParameters(defaults)
    setStep('configure')
  }

  const handleApply = async () => {
    if (isEdit && mode?.mode === 'edit') {
      await updateFx({
        id: mode.effectId,
        groupName: group.name,
        body: {
          effectType: selectedEffect?.name,
          beatDivision,
          blendMode,
          phaseOffset,
          parameters,
          distributionStrategy,
          ...(hasMultiElementMembers ? { elementMode } : {}),
        },
      })
    } else if (selectedEffect && targetPropertyName) {
      await applyFx({
        groupName: group.name,
        effectType: selectedEffect.name as never,
        propertyName: targetPropertyName,
        beatDivision,
        blendMode: blendMode as BlendMode,
        distribution: distributionStrategy as DistributionStrategy,
        phaseOffset,
        parameters,
        ...(hasMultiElementMembers ? { elementMode } : {}),
      })
    }
    onClose()
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Effect' : 'Add Effect'}</SheetTitle>
          <SheetDescription>{group.name}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {step === 'category' && (
            <EffectCategoryPicker
              effectsByCategory={effectsByCategory}
              onSelect={handleSelectCategory}
            />
          )}

          {step === 'effect' && selectedCategory && (
            <EffectTypePicker
              category={selectedCategory}
              effects={effectsByCategory[selectedCategory] ?? []}
              onSelect={handleSelectEffect}
              onBack={() => setStep('category')}
            />
          )}

          {step === 'configure' && selectedEffect && (
            <EffectParameterForm
              effect={selectedEffect}
              beatDivision={beatDivision}
              onBeatDivisionChange={setBeatDivision}
              blendMode={blendMode}
              onBlendModeChange={setBlendMode}
              phaseOffset={phaseOffset}
              onPhaseOffsetChange={setPhaseOffset}
              startOnBeat={false}
              onStartOnBeatChange={() => {}}
              parameters={parameters}
              onParametersChange={setParameters}
              targetPropertyName={targetPropertyName}
              isEdit={isEdit}
              onBack={isEdit ? undefined : () => setStep('effect')}
              distributionStrategy={distributionStrategy}
              onDistributionStrategyChange={setDistributionStrategy}
              showDistribution
              showStartOnBeat={false}
              elementMode={elementMode}
              onElementModeChange={(v) => setElementMode(v as ElementMode)}
              showElementMode={hasMultiElementMembers}
              settingOptions={settingOptions}
              settingProperties={selectedEffect?.compatibleProperties.includes('setting') ? settingProperties : undefined}
              onSettingPropertyChange={setSelectedSettingProp}
              sliderProperties={selectedEffect?.compatibleProperties.includes('slider') ? extraSliderProperties : undefined}
              onSliderPropertyChange={setSelectedSliderProp}
            />
          )}
        </div>

        {step === 'configure' && (
          <SheetFooter>
            <Button onClick={handleApply} className="w-full">
              {isEdit ? 'Update Effect' : 'Apply Effect'}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
