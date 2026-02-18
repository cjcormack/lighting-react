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
import {
  useApplyGroupFxMutation,
  useUpdateGroupFxMutation,
} from '@/store/groups'
import { useFixtureListQuery, type SettingPropertyDescriptor, type SliderPropertyDescriptor } from '@/store/fixtures'
import type { Fixture } from '@/store/fixtures'
import type { GroupSummary, GroupActiveEffect, BlendMode, DistributionStrategy, ElementMode } from '@/api/groupsApi'
import { EffectCategoryPicker } from './EffectCategoryPicker'
import { EffectTypePicker } from './EffectTypePicker'
import { EffectParameterForm } from './EffectParameterForm'
import { detectExtendedChannels } from './colourUtils'

// ─── Target discriminated union ────────────────────────────────────────────

export type FxTarget =
  | { type: 'fixture'; fixture: Fixture }
  | { type: 'group'; group: GroupSummary }

type EditEffect = FixtureDirectEffect | GroupActiveEffect

export type SheetMode =
  | { mode: 'add' }
  | { mode: 'edit'; effectId: number; effect: EditEffect }

interface AddEditFxSheetProps {
  target: FxTarget
  mode: SheetMode | undefined
  onClose: () => void
}

type Step = 'category' | 'effect' | 'configure'

export function AddEditFxSheet({ target, mode, onClose }: AddEditFxSheetProps) {
  const isOpen = mode !== undefined
  const isEdit = mode?.mode === 'edit'

  const { data: library } = useEffectLibraryQuery(undefined, { skip: !isOpen })
  const { data: fixtureList } = useFixtureListQuery(undefined, {
    skip: target.type !== 'group',
  })

  // Fixture mutations
  const [addFixtureFx] = useAddFixtureFxMutation()
  const [updateFixtureFx] = useUpdateFxMutation()

  // Group mutations
  const [applyGroupFx] = useApplyGroupFxMutation()
  const [updateGroupFx] = useUpdateGroupFxMutation()

  const [step, setStep] = useState<Step>('category')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedEffect, setSelectedEffect] = useState<EffectLibraryEntry | null>(null)

  const [beatDivision, setBeatDivision] = useState(1.0)
  const [blendMode, setBlendMode] = useState('OVERRIDE')
  const [phaseOffset, setPhaseOffset] = useState(0)
  const [startOnBeat, setStartOnBeat] = useState(true)
  const [parameters, setParameters] = useState<Record<string, string>>({})
  const [distributionStrategy, setDistributionStrategy] = useState('LINEAR')
  const [elementMode, setElementMode] = useState<ElementMode>('PER_FIXTURE')
  const [selectedSettingProp, setSelectedSettingProp] = useState<string | null>(null)
  const [selectedSliderProp, setSelectedSliderProp] = useState<string | null>(null)

  // ─── Derived target info ───────────────────────────────────────────────

  const targetLabel = target.type === 'fixture' ? target.fixture.name : target.group.name

  // Member fixtures (groups only)
  const memberFixtures = useMemo(() => {
    if (target.type !== 'group' || !fixtureList) return []
    return fixtureList.filter((f) => f.groups.includes(target.group.name))
  }, [target, fixtureList])

  // Multi-head detection
  const isMultiHead = useMemo(() => {
    if (target.type === 'fixture') {
      return (target.fixture.elementGroupProperties?.length ?? 0) > 0
    }
    // Group: always show distribution; check for multi-element members for elementMode
    return true
  }, [target])

  const hasMultiElementMembers = useMemo(() => {
    if (target.type === 'fixture') return false
    return memberFixtures.some((f) => f.elements && f.elements.length > 1)
  }, [target, memberFixtures])

  const showStartOnBeat = target.type === 'fixture'

  // Extended colour channels (W/A/UV) available on the target
  const extendedChannels = useMemo(() => {
    const fixtures =
      target.type === 'fixture' ? [target.fixture] : memberFixtures
    return detectExtendedChannels(fixtures.map((f) => f.properties ?? []))
  }, [target, memberFixtures])

  // ─── Property computation ──────────────────────────────────────────────

  const allPropertyNames = useMemo(() => {
    const names = new Set<string>()

    if (target.type === 'fixture') {
      target.fixture.properties?.forEach((p) => names.add(p.name))
      target.fixture.elementGroupProperties?.forEach((p) => names.add(p.name))
      if (target.fixture.properties?.some((p) => p.type === 'setting')) {
        names.add('setting')
      }
      if (target.fixture.properties?.some((p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv')) {
        names.add('slider')
      }
    } else {
      for (const cap of target.group.capabilities) names.add(cap)
      for (const fixture of memberFixtures) {
        fixture.properties?.forEach((p) => names.add(p.name))
        fixture.elementGroupProperties?.forEach((p) => names.add(p.name))
      }
      if (memberFixtures.some((f) => f.properties?.some((p) => p.type === 'setting'))) {
        names.add('setting')
      }
      if (memberFixtures.some((f) => f.properties?.some((p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv'))) {
        names.add('slider')
      }
    }

    return names
  }, [target, memberFixtures])

  const compatibleEffects = useMemo(() => {
    if (!library) return []
    return library.filter((effect) =>
      effect.compatibleProperties.some((propName) => allPropertyNames.has(propName)),
    )
  }, [library, allPropertyNames])

  const effectsByCategory = useMemo(() => {
    const grouped: Record<string, EffectLibraryEntry[]> = {}
    for (const effect of compatibleEffects) {
      const cat = effect.category
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(effect)
    }
    return grouped
  }, [compatibleEffects])

  // Setting and slider properties
  const settingProperties = useMemo(() => {
    if (target.type === 'fixture') {
      return (target.fixture.properties?.filter((p) => p.type === 'setting') ?? []) as SettingPropertyDescriptor[]
    }
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
  }, [target, memberFixtures])

  const extraSliderProperties = useMemo(() => {
    if (target.type === 'fixture') {
      return (target.fixture.properties?.filter(
        (p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv'
      ) ?? []) as SliderPropertyDescriptor[]
    }
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
  }, [target, memberFixtures])

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

  const settingOptions = useMemo(() => {
    if (!selectedEffect?.compatibleProperties.includes('setting') || !targetPropertyName) return undefined
    const settingProp = settingProperties.find((sp) => sp.name === targetPropertyName)
    return settingProp?.options
  }, [selectedEffect, targetPropertyName, settingProperties])

  // ─── State management ──────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return

    if (isEdit && mode.mode === 'edit') {
      setStep('configure')
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
      setSelectedSettingProp(mode.effect.propertyName ?? null)
      setSelectedSliderProp(mode.effect.propertyName ?? null)

      if (target.type === 'group' && 'distribution' in mode.effect) {
        setDistributionStrategy(mode.effect.distribution)
        setElementMode((mode.effect as GroupActiveEffect).elementMode ?? 'PER_FIXTURE')
      } else {
        setDistributionStrategy((mode.effect as FixtureDirectEffect).distributionStrategy ?? 'LINEAR')
      }
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
      setElementMode('PER_FIXTURE')
      setSelectedSettingProp(null)
      setSelectedSliderProp(null)
    }
  }, [isOpen, mode, library, isEdit, target.type])

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
    if (target.type === 'fixture') {
      const fixture = target.fixture
      const fixtureIsMultiHead = (fixture.elementGroupProperties?.length ?? 0) > 0

      if (isEdit && mode?.mode === 'edit') {
        await updateFixtureFx({
          id: mode.effectId,
          fixtureKey: fixture.key,
          body: {
            effectType: selectedEffect?.name,
            beatDivision,
            blendMode,
            phaseOffset,
            parameters,
            ...(fixtureIsMultiHead ? { distributionStrategy } : {}),
          },
        })
      } else if (selectedEffect && targetPropertyName) {
        await addFixtureFx({
          effectType: selectedEffect.name,
          fixtureKey: fixture.key,
          propertyName: targetPropertyName,
          beatDivision,
          blendMode: blendMode as BlendMode,
          startOnBeat,
          phaseOffset,
          parameters,
          ...(fixtureIsMultiHead ? { distributionStrategy } : {}),
        })
      }
    } else {
      const group = target.group

      if (isEdit && mode?.mode === 'edit') {
        await updateGroupFx({
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
        await applyGroupFx({
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
    }
    onClose()
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Effect' : 'Add Effect'}</SheetTitle>
          <SheetDescription>{targetLabel}</SheetDescription>
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
              showStartOnBeat={showStartOnBeat}
              elementMode={elementMode}
              onElementModeChange={(v) => setElementMode(v as ElementMode)}
              showElementMode={hasMultiElementMembers}
              settingOptions={settingOptions}
              settingProperties={selectedEffect?.compatibleProperties.includes('setting') ? settingProperties : undefined}
              onSettingPropertyChange={setSelectedSettingProp}
              sliderProperties={selectedEffect?.compatibleProperties.includes('slider') ? extraSliderProperties : undefined}
              onSliderPropertyChange={setSelectedSliderProp}
              extendedChannels={selectedEffect?.category === 'colour' ? extendedChannels : undefined}
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
