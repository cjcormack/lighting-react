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
  useAddFixtureFxMutation,
  useUpdateFxMutation,
  type EffectLibraryEntry,
  type FixtureDirectEffect,
} from '@/store/fixtureFx'
import type { BlendMode } from '@/api/groupsApi'
import type { Fixture, SettingPropertyDescriptor, SliderPropertyDescriptor } from '@/store/fixtures'
import { EffectCategoryPicker } from './EffectCategoryPicker'
import { EffectTypePicker } from './EffectTypePicker'
import { EffectParameterForm } from './EffectParameterForm'

type SheetMode =
  | { mode: 'add' }
  | { mode: 'edit'; effectId: number; effect: FixtureDirectEffect }

interface AddEditFxSheetProps {
  fixture: Fixture
  mode: SheetMode | undefined
  onClose: () => void
}

type Step = 'category' | 'effect' | 'configure'

export function AddEditFxSheet({ fixture, mode, onClose }: AddEditFxSheetProps) {
  const isOpen = mode !== undefined
  const isEdit = mode?.mode === 'edit'

  const { data: library } = useEffectLibraryQuery(undefined, { skip: !isOpen })
  const [addFx] = useAddFixtureFxMutation()
  const [updateFx] = useUpdateFxMutation()

  const [step, setStep] = useState<Step>('category')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedEffect, setSelectedEffect] = useState<EffectLibraryEntry | null>(null)

  const [beatDivision, setBeatDivision] = useState(1.0)
  const [blendMode, setBlendMode] = useState('OVERRIDE')
  const [phaseOffset, setPhaseOffset] = useState(0)
  const [startOnBeat, setStartOnBeat] = useState(true)
  const [parameters, setParameters] = useState<Record<string, string>>({})
  const [distributionStrategy, setDistributionStrategy] = useState('LINEAR')
  const [selectedSettingProp, setSelectedSettingProp] = useState<string | null>(null)
  const [selectedSliderProp, setSelectedSliderProp] = useState<string | null>(null)

  // Multi-head fixtures have per-head capabilities in elementGroupProperties
  const isMultiHead = (fixture.elementGroupProperties?.length ?? 0) > 0

  // Collect all available property names from both fixture-level and element-group properties.
  // Multi-head fixtures have their per-head capabilities (colour, position, etc.) exposed
  // via elementGroupProperties, not in the top-level properties array.
  const allPropertyNames = useMemo(() => {
    const names = new Set<string>()
    fixture.properties?.forEach((p) => names.add(p.name))
    fixture.elementGroupProperties?.forEach((p) => names.add(p.name))
    // Add sentinel "setting" if fixture has any setting-type properties
    if (fixture.properties?.some((p) => p.type === 'setting')) {
      names.add('setting')
    }
    // Add sentinel "slider" if fixture has non-dimmer/non-UV slider properties
    if (fixture.properties?.some((p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv')) {
      names.add('slider')
    }
    return names
  }, [fixture.properties, fixture.elementGroupProperties])

  // Filter library by all fixture capabilities (fixture-level + element-group)
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

  // All setting-type properties on this fixture
  const settingProperties = useMemo(() => {
    return (fixture.properties?.filter((p) => p.type === 'setting') ?? []) as SettingPropertyDescriptor[]
  }, [fixture.properties])

  // All non-dimmer/non-UV slider properties on this fixture
  const extraSliderProperties = useMemo(() => {
    return (fixture.properties?.filter(
      (p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv'
    ) ?? []) as SliderPropertyDescriptor[]
  }, [fixture.properties])

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
      setDistributionStrategy(mode.effect.distributionStrategy ?? 'LINEAR')
      // When editing a setting/slider effect, pre-select the property it targets
      setSelectedSettingProp(mode.effect.propertyName ?? null)
      setSelectedSliderProp(mode.effect.propertyName ?? null)
    } else {
      setStep('category')
      setSelectedCategory(null)
      setSelectedEffect(null)
      setBeatDivision(1.0)
      setBlendMode('OVERRIDE')
      setPhaseOffset(0)
      setStartOnBeat(true)
      setParameters({})
      setDistributionStrategy('LINEAR')
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
        fixtureKey: fixture.key,
        body: {
          effectType: selectedEffect?.name,
          beatDivision,
          blendMode,
          phaseOffset,
          parameters,
          ...(isMultiHead ? { distributionStrategy } : {}),
        },
      })
    } else if (selectedEffect && targetPropertyName) {
      await addFx({
        effectType: selectedEffect.name,
        fixtureKey: fixture.key,
        propertyName: targetPropertyName,
        beatDivision,
        blendMode: blendMode as BlendMode,
        startOnBeat,
        phaseOffset,
        parameters,
        ...(isMultiHead ? { distributionStrategy } : {}),
      })
    }
    onClose()
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Effect' : 'Add Effect'}</SheetTitle>
          <SheetDescription>{fixture.name}</SheetDescription>
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
              startOnBeat={startOnBeat}
              onStartOnBeatChange={setStartOnBeat}
              parameters={parameters}
              onParametersChange={setParameters}
              targetPropertyName={targetPropertyName}
              isEdit={isEdit}
              onBack={isEdit ? undefined : () => setStep('effect')}
              distributionStrategy={distributionStrategy}
              onDistributionStrategyChange={setDistributionStrategy}
              showDistribution={isMultiHead}
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
