import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  AudioWaveform,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Palette,
  Plus,
  Sliders,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

import {
  useEffectLibraryQuery,
  buildEffectLibraryLookup,
  type EffectLibraryEntry,
} from '@/store/fixtureFx'
import { useFixtureTypeListQuery, useFixtureListQuery } from '@/store/fixtures'
import type {
  SettingPropertyDescriptor,
  SliderPropertyDescriptor,
} from '@/store/fixtures'
import { EditorContextProvider } from '@/components/lighting-editor/EditorContext'
import { FixtureContent } from '@/components/fixtures/FixtureContent'
import { CuePaletteEditor } from '@/components/cues/CuePaletteEditor'
import { EffectCategoryPicker } from '@/components/fx/EffectCategoryPicker'
import { EffectTypePicker } from '@/components/fx/EffectTypePicker'
import { EffectParameterForm } from '@/components/fx/EffectParameterForm'
import { detectExtendedChannels } from '@/components/fx/colourUtils'
import {
  BEAT_DIVISION_OPTIONS,
  EFFECT_CATEGORY_INFO,
  getEffectDescription,
} from '@/components/fx/fxConstants'
import { FixtureTypePickerContent, type FixtureCountMap } from './FixtureTypePicker'
import {
  buildFixtureTypeHierarchy,
  resolveFixtureTypeLabel,
} from '@/api/fxPresetsApi'
import type {
  FxPreset,
  FxPresetEffect,
  FxPresetInput,
  FxPresetPropertyAssignment,
  FixtureTypeHierarchy,
  FixtureTypeMode,
} from '@/api/fxPresetsApi'
import {
  PresetDraftProvider,
} from './PresetDraftContext'
import { buildSyntheticPresetFixture } from './syntheticFixture'
import { DeadPresetAssignmentsBanner } from './DeadPresetAssignmentsBanner'

const CATEGORY_ORDER = ['dimmer', 'colour', 'position', 'controls'] as const

// Maps UI categories to the fixture capability required to show them
const CATEGORY_TO_REQUIRED_CAPABILITY: Record<string, string | null> = {
  dimmer: 'dimmer',
  colour: 'colour',
  position: 'position',
  controls: null, // always available
}

type SheetView = 'form' | 'fixture-type' | 'add-effect' | 'edit-effect' | 'confirm-delete'

interface PresetEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset: FxPreset | null
  onSave: (input: FxPresetInput) => Promise<void>
  isSaving: boolean
  /** Pre-populate fixture type when creating a new preset */
  defaultFixtureType?: string | null
  /** If provided, shows a Delete button when editing an existing preset */
  onDelete?: () => void
  isDeleting?: boolean
}

/**
 * Preset authoring surface built on the fixture/group detail modal primitives. Mirrors
 * `CueEditor` shape without the per-target grid: a single synthetic fixture of the
 * preset's `fixtureType` drives `FixtureContent`, wrapped in an `EditorContext`
 * (`kind: 'preset'`) so property writes flow into the local draft instead of the stage.
 *
 * Required fields: name + fixtureType. Save disables until both are set; the backend
 * additionally 400s on blank fixtureType as a belt-and-braces check.
 */
export function PresetEditor({
  open,
  onOpenChange,
  preset,
  onSave,
  isSaving,
  defaultFixtureType,
  onDelete,
  isDeleting,
}: PresetEditorProps) {
  const { data: fixtureTypes } = useFixtureTypeListQuery()
  const { data: fixtureList } = useFixtureListQuery()
  const { data: library } = useEffectLibraryQuery()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fixtureType, setFixtureType] = useState<string | null>(null)
  const [palette, setPalette] = useState<string[]>([])
  const [effects, setEffects] = useState<FxPresetEffect[]>([])
  const [propertyAssignments, setPropertyAssignments] = useState<FxPresetPropertyAssignment[]>([])

  const [view, setView] = useState<SheetView>('form')

  const [effectStep, setEffectStep] = useState<'category' | 'effect' | 'configure'>('category')
  const [effectCategory, setEffectCategory] = useState<string | null>(null)
  const [effectEntry, setEffectEntry] = useState<EffectLibraryEntry | null>(null)
  const [effectIndex, setEffectIndex] = useState<number | null>(null)
  const [effectDraft, setEffectDraft] = useState<FxPresetEffect | null>(null)

  useEffect(() => {
    if (!open) return
    setName(preset?.name ?? '')
    setDescription(preset?.description ?? '')
    setFixtureType(preset?.fixtureType ?? defaultFixtureType ?? null)
    setPalette(preset?.palette ?? [])
    setEffects(preset?.effects ?? [])
    setPropertyAssignments(preset?.propertyAssignments ?? [])
    setView('form')
    setEffectStep('category')
    setEffectCategory(null)
    setEffectEntry(null)
    setEffectIndex(null)
    setEffectDraft(null)
  }, [open, preset, defaultFixtureType])

  const hierarchy = useMemo<FixtureTypeHierarchy | null>(
    () => (fixtureTypes ? buildFixtureTypeHierarchy(fixtureTypes) : null),
    [fixtureTypes],
  )

  const fixtureTypeLabel = useMemo(() => {
    if (!fixtureType || !hierarchy) return null
    return resolveFixtureTypeLabel(fixtureType, hierarchy)
  }, [fixtureType, hierarchy])

  const fixtureCounts = useMemo<FixtureCountMap>(() => {
    const counts: FixtureCountMap = new Map()
    if (!fixtureList) return counts
    for (const f of fixtureList) counts.set(f.typeKey, (counts.get(f.typeKey) ?? 0) + 1)
    return counts
  }, [fixtureList])

  const selectedMode = useMemo<FixtureTypeMode | null>(() => {
    if (!fixtureType || !hierarchy) return null
    return hierarchy.typeKeyToModel.get(fixtureType)?.mode ?? null
  }, [fixtureType, hierarchy])

  const syntheticFixture = useMemo(
    () => (selectedMode ? buildSyntheticPresetFixture(selectedMode) : null),
    [selectedMode],
  )

  const fixtureTypeCapabilities = selectedMode?.capabilities ?? null
  const isMultiHead =
    ((fixtureTypes ?? []).find((t) => t.typeKey === fixtureType)?.elementGroupProperties?.length ?? 0) > 0

  const libraryByCategory = useMemo(() => {
    if (!library) return {} as Record<string, EffectLibraryEntry[]>
    const grouped: Record<string, EffectLibraryEntry[]> = {}
    for (const entry of library) {
      if (!grouped[entry.category]) grouped[entry.category] = []
      grouped[entry.category].push(entry)
    }
    return grouped
  }, [library])

  const hasControlsTarget = useMemo(() => {
    if (!selectedMode) return false
    return selectedMode.properties.some(
      (p) => p.type === 'setting' || (p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv'),
    )
  }, [selectedMode])

  const effectsByCategory = useMemo(() => {
    const filtered: Record<string, EffectLibraryEntry[]> = {}
    for (const cat of CATEGORY_ORDER) {
      const entries = libraryByCategory[cat]
      if (!entries || entries.length === 0) continue
      if (cat === 'controls' && !hasControlsTarget) continue
      if (fixtureTypeCapabilities) {
        const requiredCap = CATEGORY_TO_REQUIRED_CAPABILITY[cat]
        if (requiredCap && !fixtureTypeCapabilities.includes(requiredCap)) continue
      }
      filtered[cat] = entries
    }
    return filtered
  }, [libraryByCategory, fixtureTypeCapabilities, hasControlsTarget])

  const findLibraryEntry = useMemo(() => buildEffectLibraryLookup(library), [library])

  const settingProperties = useMemo(() => {
    if (!selectedMode) return [] as SettingPropertyDescriptor[]
    return selectedMode.properties.filter((p) => p.type === 'setting') as SettingPropertyDescriptor[]
  }, [selectedMode])

  const extraSliderProperties = useMemo(() => {
    if (!selectedMode) return [] as SliderPropertyDescriptor[]
    return selectedMode.properties.filter(
      (p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv',
    ) as SliderPropertyDescriptor[]
  }, [selectedMode])

  const extendedChannels = useMemo(() => {
    if (!selectedMode) return { white: false, amber: false, uv: false }
    return detectExtendedChannels([selectedMode.properties])
  }, [selectedMode])

  const effectErrors = useMemo<boolean[]>(() => {
    return effects.map((effect) => {
      const entry = findLibraryEntry(effect.effectType, effect.category)
      if (!entry) return false
      const needsProp =
        entry.compatibleProperties.includes('setting') ||
        entry.compatibleProperties.includes('slider')
      if (!needsProp) return false
      if (!selectedMode) return true
      if (!effect.propertyName) return true
      return !selectedMode.properties.some((p) => {
        if (p.name !== effect.propertyName) return false
        if (entry.compatibleProperties.includes('setting') && p.type === 'setting') return true
        if (
          entry.compatibleProperties.includes('slider') &&
          p.type === 'slider' &&
          p.category !== 'dimmer' &&
          p.category !== 'uv'
        )
          return true
        if (entry.compatibleProperties.includes(p.name)) return true
        return false
      })
    })
  }, [effects, selectedMode, findLibraryEntry])

  const hasEffectErrors = effectErrors.some(Boolean)
  const isValid = name.trim().length > 0 && !!fixtureType && !hasEffectErrors

  // `id: 0` for new-draft sessions — the discriminator needs a number, but routing
  // never keys off it (all writes land in PresetDraftContext).
  const editorContextValue = useMemo(
    () => ({ kind: 'preset' as const, id: preset?.id ?? 0 }),
    [preset?.id],
  )

  const handleSave = async () => {
    if (!isValid) return
    await onSave({
      name: name.trim(),
      description: description.trim() || null,
      fixtureType,
      palette,
      effects,
      propertyAssignments,
    })
    onOpenChange(false)
  }

  const openAddEffect = () => {
    setEffectStep('category')
    setEffectCategory(null)
    setEffectEntry(null)
    setEffectIndex(null)
    setEffectDraft(null)
    setView('add-effect')
  }

  const handleSelectCategory = (cat: string) => {
    setEffectCategory(cat)
    setEffectStep('effect')
  }

  const handleSelectEffect = (entry: EffectLibraryEntry) => {
    setEffectEntry(entry)
    const defaults: Record<string, string> = {}
    entry.parameters.forEach((p) => {
      defaults[p.name] = p.defaultValue
    })
    const targetPropertyName = resolveTargetPropertyName(
      entry,
      selectedMode,
      settingProperties,
      extraSliderProperties,
    )
    setEffectDraft({
      effectType: entry.name,
      category: entry.category,
      propertyName: targetPropertyName,
      beatDivision: 1.0,
      blendMode: 'OVERRIDE',
      distribution: 'LINEAR',
      phaseOffset: 0,
      elementMode: isMultiHead ? 'PER_FIXTURE' : null,
      elementFilter: null,
      stepTiming: null,
      parameters: defaults,
    })
    setEffectStep('configure')
  }

  const openEditEffect = (index: number) => {
    const effect = effects[index]
    if (!effect) return
    const entry = findLibraryEntry(effect.effectType, effect.category)
    setEffectCategory(effect.category)
    setEffectEntry(entry ?? null)
    setEffectIndex(index)
    setEffectDraft({ ...effect })
    setEffectStep('configure')
    setView('edit-effect')
  }

  const confirmEffect = () => {
    if (!effectDraft) return
    const resolved: FxPresetEffect = { ...effectDraft }
    if (effectIndex == null) {
      setEffects((prev) => [...prev, resolved])
    } else {
      setEffects((prev) => {
        const next = [...prev]
        next[effectIndex] = resolved
        return next
      })
    }
    setView('form')
  }

  const removeEffect = (index: number) => {
    setEffects((prev) => prev.filter((_, i) => i !== index))
  }

  const removeEditingEffect = () => {
    if (effectIndex == null) return
    removeEffect(effectIndex)
    setView('form')
  }

  // Sheet close from within a sub-view pops back to the form instead of dismissing,
  // so the user's partially-filled effect or fixture-type pick isn't lost on stray clicks.
  const handleSheetOpenChange = useCallback(
    (value: boolean) => {
      if (!value && view !== 'form') {
        setView('form')
        return
      }
      onOpenChange(value)
    },
    [onOpenChange, view],
  )

  const formView = (
    <EditorContextProvider value={editorContextValue}>
      <PresetDraftProvider assignments={propertyAssignments} onChange={setPropertyAssignments}>
        <SheetHeader>
          <SheetTitle>{preset ? 'Edit Preset' : 'New Preset'}</SheetTitle>
          <SheetDescription>
            Author a reusable effect bundle scoped to a single fixture type. Property
            assignments set base values; effects animate on top.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-1.5">
            <Label htmlFor="preset-name">Name *</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Preset"
              className="h-9"
              autoFocus={!preset}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preset-description">Description</Label>
            <Textarea
              id="preset-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Fixture Type *</Label>
            <button
              type="button"
              onClick={() => setView('fixture-type')}
              className={cn(
                'flex items-center gap-2 w-full h-9 px-3 rounded-md border text-left text-sm hover:bg-accent/50 transition-colors',
                !fixtureType && 'border-destructive/60',
              )}
            >
              <span
                className={
                  fixtureTypeLabel
                    ? 'flex-1 truncate'
                    : 'flex-1 truncate text-muted-foreground'
                }
              >
                {fixtureTypeLabel ?? 'Pick a fixture type…'}
              </span>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </button>
            <p className="text-[11px] text-muted-foreground">
              Required — property descriptors are resolved from the fixture type.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="size-3.5" />
              Palette
              {palette.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                  {palette.length}
                </Badge>
              )}
            </Label>
            <CuePaletteEditor palette={palette} onChange={setPalette} />
          </div>

          <DeadPresetAssignmentsBanner
            assignments={propertyAssignments}
            onRemove={(index) =>
              setPropertyAssignments((prev) => prev.filter((_, i) => i !== index))
            }
          />

          <Tabs defaultValue="properties">
            <TabsList>
              <TabsTrigger value="properties">
                <Sliders className="size-3.5 mr-1.5" />
                Properties
                {propertyAssignments.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                    {propertyAssignments.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="effects">
                <AudioWaveform className="size-3.5 mr-1.5" />
                Effects
                {effects.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                    {effects.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="properties" className="pt-3">
              {syntheticFixture ? (
                <FixtureContent fixture={syntheticFixture} isEditing viewMode="properties" />
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Pick a fixture type above to edit property values.
                </p>
              )}
            </TabsContent>

            <TabsContent value="effects" className="pt-3 space-y-2">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={openAddEffect}
                  disabled={!selectedMode}
                >
                  <Plus className="size-3" /> Add Effect
                </Button>
              </div>
              {effects.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No effects yet. Add one to animate a property over time.
                </p>
              )}
              {effects.map((effect, index) => {
                const entry = findLibraryEntry(effect.effectType, effect.category)
                const catInfo = EFFECT_CATEGORY_INFO[effect.category]
                const CatIcon = catInfo?.icon
                const closestBeat = BEAT_DIVISION_OPTIONS.reduce((prev, curr) =>
                  Math.abs(curr.value - effect.beatDivision) < Math.abs(prev.value - effect.beatDivision)
                    ? curr
                    : prev,
                )
                const hasError = effectErrors[index]
                return (
                  <div
                    key={`${effect.effectType}-${index}`}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors',
                      hasError && 'border-destructive',
                    )}
                    onClick={() => openEditEffect(index)}
                  >
                    {CatIcon && <CatIcon className="size-4 text-muted-foreground shrink-0" />}
                    <span className="text-sm font-medium truncate">{effect.effectType}</span>
                    {effect.propertyName && !hasError && (
                      <span className="text-xs text-muted-foreground truncate">
                        &rarr; {effect.propertyName}
                      </span>
                    )}
                    {hasError && (
                      <span className="text-xs text-destructive truncate">
                        {!selectedMode
                          ? 'needs fixture type'
                          : effect.propertyName
                            ? `→ ${effect.propertyName} (invalid)`
                            : 'needs target property'}
                      </span>
                    )}
                    {!hasError && entry && (
                      <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                        {getEffectDescription(entry.name, entry.description)}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {closestBeat.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeEffect(index)
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </TabsContent>
          </Tabs>
        </SheetBody>

        <SheetFooter className="flex-row justify-end gap-2">
          {preset && onDelete && (
            <Button
              variant="outline"
              onClick={() => setView('confirm-delete')}
              disabled={isSaving || isDeleting}
              className="text-destructive hover:text-destructive mr-auto"
            >
              {isDeleting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Delete
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isDeleting}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving || isDeleting}>
            {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
            {preset ? 'Update' : 'Create'}
          </Button>
        </SheetFooter>
      </PresetDraftProvider>
    </EditorContextProvider>
  )

  const effectFormView = effectDraft && (
    <>
      {effectStep !== 'configure' && (
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <button onClick={() => setView('form')} className="hover:bg-accent rounded p-0.5 -ml-1">
              <ChevronLeft className="size-5" />
            </button>
            {view === 'add-effect' ? 'Add Effect' : 'Edit Effect'}
          </SheetTitle>
        </SheetHeader>
      )}
      <SheetBody className="space-y-0 p-0">
        {view === 'add-effect' && effectStep === 'category' && (
          <EffectCategoryPicker
            effectsByCategory={effectsByCategory}
            onSelect={handleSelectCategory}
          />
        )}
        {view === 'add-effect' && effectStep === 'effect' && effectCategory && (
          <EffectTypePicker
            category={effectCategory}
            effects={effectsByCategory[effectCategory] ?? []}
            onSelect={handleSelectEffect}
            onBack={() => setEffectStep('category')}
          />
        )}
        {effectStep === 'configure' && effectEntry && (
          <EffectParameterForm
            effect={effectEntry}
            beatDivision={effectDraft.beatDivision}
            onBeatDivisionChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, beatDivision: v } : d))
            }
            blendMode={effectDraft.blendMode}
            onBlendModeChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, blendMode: v } : d))
            }
            phaseOffset={effectDraft.phaseOffset}
            onPhaseOffsetChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, phaseOffset: v } : d))
            }
            startOnBeat={false}
            onStartOnBeatChange={() => {}}
            showStartOnBeat={false}
            parameters={effectDraft.parameters}
            onParametersChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, parameters: v } : d))
            }
            targetPropertyName={effectDraft.propertyName}
            isEdit={view === 'edit-effect'}
            onBack={view === 'add-effect' ? () => setEffectStep('effect') : undefined}
            distributionStrategy={effectDraft.distribution}
            onDistributionStrategyChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, distribution: v } : d))
            }
            showDistribution
            elementMode={effectDraft.elementMode ?? 'PER_FIXTURE'}
            onElementModeChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, elementMode: v } : d))
            }
            showElementMode={isMultiHead}
            elementFilter={effectDraft.elementFilter ?? 'ALL'}
            onElementFilterChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, elementFilter: v === 'ALL' ? null : v } : d))
            }
            showElementFilter
            settingOptions={
              effectEntry.compatibleProperties.includes('setting') && effectDraft.propertyName
                ? settingProperties.find((sp) => sp.name === effectDraft.propertyName)?.options
                : undefined
            }
            settingProperties={
              effectEntry.compatibleProperties.includes('setting') ? settingProperties : undefined
            }
            onSettingPropertyChange={(n) =>
              setEffectDraft((d) => (d ? { ...d, propertyName: n } : d))
            }
            sliderProperties={
              effectEntry.compatibleProperties.includes('slider') ? extraSliderProperties : undefined
            }
            onSliderPropertyChange={(n) =>
              setEffectDraft((d) => (d ? { ...d, propertyName: n } : d))
            }
            extendedChannels={effectEntry.category === 'colour' ? extendedChannels : undefined}
            stepTiming={effectDraft.stepTiming ?? false}
            onStepTimingChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, stepTiming: v || null } : d))
            }
            palette={palette}
          />
        )}
      </SheetBody>
      {effectStep === 'configure' && (
        <SheetFooter
          className={view === 'edit-effect' ? 'flex-row justify-between' : 'flex-row justify-end gap-2'}
        >
          {view === 'edit-effect' ? (
            <>
              <Button variant="destructive" size="sm" onClick={removeEditingEffect}>
                Remove
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setView('form')}>
                  Cancel
                </Button>
                <Button onClick={confirmEffect}>Update</Button>
              </div>
            </>
          ) : (
            <Button onClick={confirmEffect} className="w-full">
              Add Effect
            </Button>
          )}
        </SheetFooter>
      )}
    </>
  )

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-2xl">
        {view === 'form' && formView}
        {(view === 'add-effect' || view === 'edit-effect') && effectFormView}
        {view === 'fixture-type' && (
          <FixtureTypePickerContent
            hierarchy={hierarchy}
            fixtureCounts={fixtureCounts}
            onSelect={(typeKey) => {
              setFixtureType(typeKey)
              setView('form')
            }}
            onClose={() => setView('form')}
            options={{
              subtitle: 'Required — property descriptors are resolved from the fixture type.',
            }}
          />
        )}
        {view === 'confirm-delete' && (
          <>
            <SheetHeader>
              <SheetTitle>Delete Preset</SheetTitle>
              <SheetDescription>
                Are you sure you want to delete &ldquo;{preset?.name}&rdquo;? This action cannot
                be undone.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1" />
            <SheetFooter className="flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => setView('form')}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setView('form')
                  onDelete?.()
                }}
              >
                Delete
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function resolveTargetPropertyName(
  entry: EffectLibraryEntry,
  mode: FixtureTypeMode | null,
  settingProperties: SettingPropertyDescriptor[],
  sliderProperties: SliderPropertyDescriptor[],
): string | null {
  if (!mode) return null
  const allPropNames = new Set(mode.properties.map((p) => p.name))
  if (mode.properties.some((p) => p.type === 'setting')) allPropNames.add('setting')
  if (
    mode.properties.some(
      (p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv',
    )
  ) {
    allPropNames.add('slider')
  }
  const matched = entry.compatibleProperties.find((n) => allPropNames.has(n)) ?? null
  if (matched === 'setting') return settingProperties[0]?.name ?? null
  if (matched === 'slider') return sliderProperties[0]?.name ?? null
  return matched
}
