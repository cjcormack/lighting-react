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
import type { Fixture } from '@/store/fixtures'
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

  // Multi-head fixtures have per-head capabilities in elementGroupProperties
  const isMultiHead = (fixture.elementGroupProperties?.length ?? 0) > 0

  // Collect all available property names from both fixture-level and element-group properties.
  // Multi-head fixtures have their per-head capabilities (colour, position, etc.) exposed
  // via elementGroupProperties, not in the top-level properties array.
  const allPropertyNames = useMemo(() => {
    const names = new Set<string>()
    fixture.properties?.forEach((p) => names.add(p.name))
    fixture.elementGroupProperties?.forEach((p) => names.add(p.name))
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

  // Resolve the target property name for the selected effect
  const targetPropertyName = useMemo((): string | null => {
    if (!selectedEffect) return null
    return (
      selectedEffect.compatibleProperties.find((name) => allPropertyNames.has(name)) ?? null
    )
  }, [selectedEffect, allPropertyNames])

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
