import { useState, useMemo, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import type { SearchableSelectOption } from '@/components/ui/searchable-select'
import { Plus, Loader2 } from 'lucide-react'
import { useEffectLibraryQuery } from '@/store/fixtureFx'
import { useFixtureTypeListQuery } from '@/store/fixtures'
import { EFFECT_CATEGORY_INFO, getEffectDescription } from '@/components/fixtures/fx/fxConstants'
import { PresetEffectRow } from './PresetEffectRow'
import { buildFixtureTypeHierarchy } from '@/api/fxPresetsApi'
import type { FxPreset, FxPresetEffect, FxPresetInput, FixtureTypeHierarchy } from '@/api/fxPresetsApi'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

const CATEGORY_ORDER = ['dimmer', 'colour', 'position', 'controls'] as const

// Maps UI categories to the fixture capability required to show them
const CATEGORY_TO_REQUIRED_CAPABILITY: Record<string, string | null> = {
  dimmer: 'dimmer',
  colour: 'colour',
  position: 'position',
  controls: null, // always available
}

// Sentinel values for Select components (which don't support null values)
const NONE = '__none__'

interface PresetFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset: FxPreset | null
  onSave: (input: FxPresetInput) => Promise<void>
  isSaving: boolean
}

export function PresetForm({ open, onOpenChange, preset, onSave, isSaving }: PresetFormProps) {
  const { data: library } = useEffectLibraryQuery()
  const { data: fixtureTypes } = useFixtureTypeListQuery()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fixtureType, setFixtureType] = useState<string | null>(null)
  const [effects, setEffects] = useState<FxPresetEffect[]>([])

  // Cascading selector state
  const [selManufacturer, setSelManufacturer] = useState<string | null>(null)
  const [selModel, setSelModel] = useState<string | null>(null)

  // Build hierarchy from all known fixture types
  const hierarchy = useMemo<FixtureTypeHierarchy | null>(() => {
    if (!fixtureTypes) return null
    return buildFixtureTypeHierarchy(fixtureTypes)
  }, [fixtureTypes])

  // Derive dropdown options from hierarchy and current selections
  const manufacturerOptions = useMemo<SearchableSelectOption[]>(() => {
    if (!hierarchy) return []
    return [...hierarchy.manufacturers.entries()]
      .filter(([m]) => m !== '')
      .map(([mfr, models]) => ({
        value: mfr,
        label: mfr,
        dimmed: !models.some((m) => m.isRegistered),
      }))
      .sort((a, b) => {
        if (a.dimmed !== b.dimmed) return a.dimmed ? 1 : -1
        return a.label.localeCompare(b.label)
      })
  }, [hierarchy])

  const modelOptions = useMemo(() => {
    if (!hierarchy) return []
    if (selManufacturer !== null) {
      return hierarchy.manufacturers.get(selManufacturer) ?? []
    }
    return hierarchy.models
  }, [hierarchy, selManufacturer])

  const modelSelectOptions = useMemo<SearchableSelectOption[]>(() => {
    return modelOptions.map((m) => ({
      value: m.model,
      label: !selManufacturer && m.manufacturer ? `${m.model} (${m.manufacturer})` : m.model,
      dimmed: !m.isRegistered,
    }))
  }, [modelOptions, selManufacturer])

  const modeOptions = useMemo(() => {
    if (!selModel) return []
    const model = modelOptions.find((m) => m.model === selModel)
    if (!model || model.modes.length <= 1) return []
    return model.modes
  }, [modelOptions, selModel])

  // Sync cascading selectors -> fixtureType
  useEffect(() => {
    if (!selModel) {
      setFixtureType(null)
      return
    }
    const model = modelOptions.find((m) => m.model === selModel)
    if (!model) {
      setFixtureType(null)
      return
    }
    if (model.modes.length === 1) {
      setFixtureType(model.modes[0].typeKey)
    }
    // If multiple modes, fixtureType is set from the mode dropdown separately
  }, [selModel, modelOptions])

  // Reset form when the sheet opens or the preset changes
  useEffect(() => {
    if (open) {
      setName(preset?.name ?? '')
      setDescription(preset?.description ?? '')
      const typeKey = preset?.fixtureType ?? null
      setFixtureType(typeKey)
      setEffects(preset?.effects ?? [])

      // Resolve typeKey back to cascading selector state
      if (typeKey && hierarchy) {
        const info = hierarchy.typeKeyToModel.get(typeKey)
        if (info) {
          setSelManufacturer(info.manufacturer)
          setSelModel(info.model)
          return
        }
      }
      setSelManufacturer(null)
      setSelModel(null)
    }
  }, [open, preset, hierarchy])

  // Group library by category, with a virtual "controls" category for settings + sliders
  const libraryByCategory = useMemo(() => {
    if (!library) return {}
    const grouped: Record<string, EffectLibraryEntry[]> = {}
    const controls: EffectLibraryEntry[] = []
    for (const entry of library) {
      if (!grouped[entry.category]) grouped[entry.category] = []
      grouped[entry.category].push(entry)

      // Build virtual "controls" category: setting effects + slider-compatible dimmer effects
      if (entry.category === 'setting') {
        controls.push(entry)
      } else if (entry.compatibleProperties.includes('slider')) {
        controls.push(entry)
      }
    }
    if (controls.length > 0) {
      grouped['controls'] = controls
    }
    return grouped
  }, [library])

  // Library lookup by normalized name
  const libraryMap = useMemo(() => {
    if (!library) return new Map<string, EffectLibraryEntry>()
    const map = new Map<string, EffectLibraryEntry>()
    for (const entry of library) {
      map.set(entry.name.toLowerCase().replace(/[\s_]/g, ''), entry)
    }
    return map
  }, [library])

  const findLibraryEntry = useCallback((effectType: string): EffectLibraryEntry | undefined => {
    return libraryMap.get(effectType.toLowerCase().replace(/[\s_]/g, ''))
  }, [libraryMap])

  const handleAddEffect = (entry: EffectLibraryEntry) => {
    const defaults: Record<string, string> = {}
    entry.parameters.forEach((p) => {
      defaults[p.name] = p.defaultValue
    })

    const newEffect: FxPresetEffect = {
      effectType: entry.name,
      category: entry.category,
      propertyName: null,
      beatDivision: 1.0,
      blendMode: 'OVERRIDE',
      distribution: 'LINEAR',
      phaseOffset: 0,
      elementMode: null,
      parameters: defaults,
    }
    setEffects([...effects, newEffect])
  }

  const handleUpdateEffect = (index: number, updated: FxPresetEffect) => {
    const next = [...effects]
    next[index] = updated
    setEffects(next)
  }

  const handleRemoveEffect = (index: number) => {
    setEffects(effects.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    await onSave({
      name: name.trim(),
      description: description.trim() || null,
      fixtureType,
      effects,
    })
    onOpenChange(false)
  }

  // Resolve the selected fixture type mode (for capabilities + property info)
  const selectedFixtureTypeMode = useMemo(() => {
    if (!fixtureType || !hierarchy) return null
    const info = hierarchy.typeKeyToModel.get(fixtureType)
    return info?.mode ?? null
  }, [fixtureType, hierarchy])

  // Resolve capabilities for the selected fixture type (null = show all categories)
  const fixtureTypeCapabilities = selectedFixtureTypeMode?.capabilities ?? null

  // Determine if Controls category should show for the selected fixture type
  const hasControls = useMemo(() => {
    if (!fixtureType || !hierarchy) return true // no fixture type = show all
    const info = hierarchy.typeKeyToModel.get(fixtureType)
    if (!info) return true
    return info.mode.properties.some(
      (p) => p.type === 'setting' || (p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv'),
    )
  }, [fixtureType, hierarchy])

  // Validate each effect: effects that need a property picker must have a valid propertyName
  const effectErrors = useMemo<boolean[]>(() => {
    return effects.map((effect) => {
      const entry = findLibraryEntry(effect.effectType)
      if (!entry) return false
      const needsProp = entry.compatibleProperties.includes('setting') ||
        entry.compatibleProperties.includes('slider')
      if (!needsProp) return false
      // No fixture type selected — can't resolve a target property
      if (!selectedFixtureTypeMode) return true
      if (!effect.propertyName) return true // needs a property but none selected
      // Check the property still exists on the current fixture type
      const propExists = selectedFixtureTypeMode.properties.some((p) => {
        if (p.name !== effect.propertyName) return false
        if (entry.compatibleProperties.includes('setting') && p.type === 'setting') return true
        if (entry.compatibleProperties.includes('slider') && p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv') return true
        if (entry.compatibleProperties.includes(p.name)) return true
        return false
      })
      return !propExists
    })
  }, [effects, selectedFixtureTypeMode, findLibraryEntry])

  const hasEffectErrors = effectErrors.some(Boolean)

  const isValid = name.trim().length > 0 && effects.length > 0 && !hasEffectErrors

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col overflow-hidden"
      >
        <SheetHeader>
          <SheetTitle>{preset ? 'Edit Preset' : 'New Preset'}</SheetTitle>
          <SheetDescription>
            {preset
              ? 'Update the preset name, description, and effects.'
              : 'Create a new FX preset with one or more effects.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Name */}
          <div className="space-y-1.5 px-1">
            <Label htmlFor="preset-name">Name *</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Preset"
              className="h-9"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5 px-1">
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

          {/* Fixture Type — cascading manufacturer / model / mode */}
          <div className="space-y-1.5 px-1">
            <Label>Fixture Type</Label>
            <div className="flex flex-wrap gap-1.5">
              {/* Manufacturer */}
              {manufacturerOptions.length > 0 && (
                <SearchableSelect
                  options={manufacturerOptions}
                  value={selManufacturer}
                  onValueChange={(v) => {
                    setSelManufacturer(v)
                    setSelModel(null)
                    setFixtureType(null)
                  }}
                  placeholder="Manufacturer"
                  emptyLabel="Any manufacturer"
                  className="flex-1 min-w-[120px]"
                />
              )}

              {/* Model */}
              <SearchableSelect
                options={modelSelectOptions}
                value={selModel}
                onValueChange={(v) => {
                  setSelModel(v)
                  if (!v) setFixtureType(null)
                }}
                placeholder="Model"
                emptyLabel="Any model"
                className="flex-1 min-w-[140px]"
              />

              {/* Mode (only shown when model has multiple modes) */}
              {modeOptions.length > 0 && (
                <Select
                  value={fixtureType ?? NONE}
                  onValueChange={(v) => {
                    setFixtureType(v === NONE ? null : v)
                  }}
                >
                  <SelectTrigger className="h-9 flex-1 min-w-[100px]">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Any mode</SelectItem>
                    {modeOptions.map((mode) => (
                      <SelectItem key={mode.typeKey} value={mode.typeKey}>
                        {mode.modeName ?? mode.typeKey}
                        {mode.channelCount != null && (
                          <span className="text-muted-foreground ml-1 text-[10px]">
                            ({mode.channelCount}ch)
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Optionally restrict this preset to a specific fixture type.
            </p>
          </div>

          {/* Effects list */}
          <div className="space-y-2 px-1">
            <div className="flex items-center justify-between">
              <Label>Effects ({effects.length})</Label>
              <AddEffectPicker
                libraryByCategory={libraryByCategory}
                fixtureTypeCapabilities={fixtureTypeCapabilities}
                hasControls={hasControls}
                onAdd={handleAddEffect}
              />
            </div>

            {effects.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                No effects added yet. Use the button above to add effects.
              </div>
            )}

            {effects.map((effect, index) => (
              <PresetEffectRow
                key={`${effect.effectType}-${index}`}
                effect={effect}
                libraryEntry={findLibraryEntry(effect.effectType)}
                fixtureTypeMode={selectedFixtureTypeMode}
                hasError={effectErrors[index]}
                onChange={(updated) => handleUpdateEffect(index, updated)}
                onRemove={() => handleRemoveEffect(index)}
              />
            ))}
          </div>
        </div>

        <SheetFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
            {preset ? 'Update' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function AddEffectPicker({
  libraryByCategory,
  fixtureTypeCapabilities,
  hasControls,
  onAdd,
}: {
  libraryByCategory: Record<string, EffectLibraryEntry[]>
  fixtureTypeCapabilities: string[] | null
  hasControls: boolean
  onAdd: (entry: EffectLibraryEntry) => void
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedEffect, setSelectedEffect] = useState<string>('')

  const categories = CATEGORY_ORDER.filter((cat) => {
    if ((libraryByCategory[cat]?.length ?? 0) === 0) return false
    if (cat === 'controls') return hasControls
    if (!fixtureTypeCapabilities) return true
    const requiredCap = CATEGORY_TO_REQUIRED_CAPABILITY[cat]
    return !requiredCap || fixtureTypeCapabilities.includes(requiredCap)
  })
  const effectsInCategory = selectedCategory ? libraryByCategory[selectedCategory] ?? [] : []

  // Reset selection if selected category is no longer visible
  useEffect(() => {
    if (selectedCategory && !(categories as string[]).includes(selectedCategory)) {
      setSelectedCategory('')
      setSelectedEffect('')
    }
  }, [categories, selectedCategory])

  const handleAdd = () => {
    const entry = effectsInCategory.find((e) => e.name === selectedEffect)
    if (entry) {
      onAdd(entry)
      setSelectedEffect('')
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setSelectedEffect('') }}>
        <SelectTrigger className="h-8 text-xs w-[100px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((cat) => {
            const info = EFFECT_CATEGORY_INFO[cat]
            return (
              <SelectItem key={cat} value={cat} className="text-xs">
                {info?.label ?? cat}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      <Select value={selectedEffect} onValueChange={setSelectedEffect} disabled={!selectedCategory}>
        <SelectTrigger className="h-8 text-xs w-[140px]">
          <SelectValue placeholder="Effect" />
        </SelectTrigger>
        <SelectContent>
          {effectsInCategory.map((entry) => (
            <SelectItem key={entry.name} value={entry.name} className="text-xs">
              <span>{entry.name}</span>
              <span className="text-muted-foreground ml-1 text-[10px]">
                {getEffectDescription(entry.name, entry.description).slice(0, 30)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="icon"
        className="size-8 shrink-0"
        disabled={!selectedEffect}
        onClick={handleAdd}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
