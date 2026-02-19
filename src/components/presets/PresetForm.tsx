import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
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
import { Plus, Loader2, ChevronRight, ChevronLeft, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useEffectLibraryQuery } from '@/store/fixtureFx'
import { useFixtureTypeListQuery, useFixtureListQuery } from '@/store/fixtures'
import type { SettingPropertyDescriptor, SliderPropertyDescriptor } from '@/store/fixtures'
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
import { buildFixtureTypeHierarchy, resolveFixtureTypeLabel } from '@/api/fxPresetsApi'
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

/** Which view is showing inside the Sheet */
type SheetView = 'form' | 'add-effect' | 'edit-effect' | 'fixture-type' | 'confirm-delete'

interface PresetFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset: FxPreset | null
  onSave: (input: FxPresetInput) => Promise<void>
  isSaving: boolean
  /** Open with a specific effect's edit dialog shown */
  initialEditEffectIndex?: number | null
  /** Pre-populate fixture type when creating a new preset */
  defaultFixtureType?: string | null
  /** If provided, shows a Delete button when editing an existing preset */
  onDelete?: () => void
  isDeleting?: boolean
}

export function PresetForm({ open, onOpenChange, preset, onSave, isSaving, initialEditEffectIndex, defaultFixtureType, onDelete, isDeleting }: PresetFormProps) {
  const { data: library } = useEffectLibraryQuery()
  const { data: fixtureTypes } = useFixtureTypeListQuery()
  const { data: fixtureList } = useFixtureListQuery()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fixtureType, setFixtureType] = useState<string | null>(null)
  const [effects, setEffects] = useState<FxPresetEffect[]>([])

  // Current view inside the sheet (replaces separate Dialog open states)
  const [view, setView] = useState<SheetView>('form')

  // Add Effect state
  const [addEffectStep, setAddEffectStep] = useState<'category' | 'effect' | 'configure'>('category')
  const [addEffectCategory, setAddEffectCategory] = useState<string | null>(null)
  const [addEffectEntry, setAddEffectEntry] = useState<EffectLibraryEntry | null>(null)
  const [addBeatDivision, setAddBeatDivision] = useState(1.0)
  const [addBlendMode, setAddBlendMode] = useState('OVERRIDE')
  const [addPhaseOffset, setAddPhaseOffset] = useState(0)
  const [addDistribution, setAddDistribution] = useState('LINEAR')
  const [addParameters, setAddParameters] = useState<Record<string, string>>({})
  const [addSelectedSettingProp, setAddSelectedSettingProp] = useState<string | null>(null)
  const [addSelectedSliderProp, setAddSelectedSliderProp] = useState<string | null>(null)
  const [addElementMode, setAddElementMode] = useState('PER_FIXTURE')
  const [addElementFilter, setAddElementFilter] = useState('ALL')
  const [addStepTiming, setAddStepTiming] = useState(false)

  // Edit Effect state
  const [editEffectIndex, setEditEffectIndex] = useState<number | null>(null)
  const [editEffectEntry, setEditEffectEntry] = useState<EffectLibraryEntry | null>(null)
  const [editBeatDivision, setEditBeatDivision] = useState(1.0)
  const [editBlendMode, setEditBlendMode] = useState('OVERRIDE')
  const [editPhaseOffset, setEditPhaseOffset] = useState(0)
  const [editDistribution, setEditDistribution] = useState('LINEAR')
  const [editParameters, setEditParameters] = useState<Record<string, string>>({})
  const [editSelectedSettingProp, setEditSelectedSettingProp] = useState<string | null>(null)
  const [editSelectedSliderProp, setEditSelectedSliderProp] = useState<string | null>(null)
  const [editElementMode, setEditElementMode] = useState('PER_FIXTURE')
  const [editElementFilter, setEditElementFilter] = useState('ALL')
  const [editStepTiming, setEditStepTiming] = useState(false)

  // Build hierarchy from all known fixture types
  const hierarchy = useMemo<FixtureTypeHierarchy | null>(() => {
    if (!fixtureTypes) return null
    return buildFixtureTypeHierarchy(fixtureTypes)
  }, [fixtureTypes])

  // Count configured fixtures per typeKey
  const fixtureCounts = useMemo<FixtureCountMap>(() => {
    const counts: FixtureCountMap = new Map()
    if (!fixtureList) return counts
    for (const f of fixtureList) {
      counts.set(f.typeKey, (counts.get(f.typeKey) ?? 0) + 1)
    }
    return counts
  }, [fixtureList])

  // Detect whether the selected fixture type is multi-head (has element group properties)
  const isMultiHeadType = useMemo(() => {
    if (!fixtureType || !fixtureTypes) return false
    const typeInfo = fixtureTypes.find((t) => t.typeKey === fixtureType)
    return (typeInfo?.elementGroupProperties?.length ?? 0) > 0
  }, [fixtureType, fixtureTypes])

  // Show element mode when no fixture type selected (preset may apply to groups with
  // multi-head fixtures) or when the selected fixture type is itself multi-head.
  const showElementMode = !fixtureType || isMultiHeadType

  // Reset form when the sheet opens or the preset changes
  useEffect(() => {
    if (open) {
      setName(preset?.name ?? '')
      setDescription(preset?.description ?? '')
      setFixtureType(preset?.fixtureType ?? defaultFixtureType ?? null)
      setEffects(preset?.effects ?? [])
      setView('form')
    }
  }, [open, preset, defaultFixtureType])

  // Group library by category
  const libraryByCategory = useMemo(() => {
    if (!library) return {}
    const grouped: Record<string, EffectLibraryEntry[]> = {}
    for (const entry of library) {
      if (!grouped[entry.category]) grouped[entry.category] = []
      grouped[entry.category].push(entry)
    }
    return grouped
  }, [library])

  // Library lookup by normalized name, with category-qualified keys for disambiguation
  const libraryMap = useMemo(() => {
    if (!library) return new Map<string, EffectLibraryEntry>()
    const map = new Map<string, EffectLibraryEntry>()
    for (const entry of library) {
      const normalized = entry.name.toLowerCase().replace(/[\s_]/g, '')
      map.set(`${entry.category}:${normalized}`, entry)
      // Name-only key as fallback (last entry wins if duplicates exist)
      map.set(normalized, entry)
    }
    return map
  }, [library])

  const findLibraryEntry = useCallback((effectType: string, category?: string): EffectLibraryEntry | undefined => {
    const normalized = effectType.toLowerCase().replace(/[\s_]/g, '')
    if (category) {
      const qualified = libraryMap.get(`${category}:${normalized}`)
      if (qualified) return qualified
    }
    return libraryMap.get(normalized)
  }, [libraryMap])

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

  // Compute effectsByCategory filtered by fixture type capabilities (for EffectCategoryPicker)
  const effectsByCategory = useMemo(() => {
    const filtered: Record<string, EffectLibraryEntry[]> = {}
    for (const cat of CATEGORY_ORDER) {
      const entries = libraryByCategory[cat]
      if (!entries || entries.length === 0) continue
      if (cat === 'controls' && !hasControls) continue
      if (fixtureTypeCapabilities) {
        const requiredCap = CATEGORY_TO_REQUIRED_CAPABILITY[cat]
        if (requiredCap && !fixtureTypeCapabilities.includes(requiredCap)) continue
      }
      filtered[cat] = entries
    }
    return filtered
  }, [libraryByCategory, fixtureTypeCapabilities, hasControls])

  // Setting-type properties on the selected fixture type (for configure step)
  const settingProperties = useMemo(() => {
    if (!selectedFixtureTypeMode) return [] as SettingPropertyDescriptor[]
    return selectedFixtureTypeMode.properties.filter((p) => p.type === 'setting') as SettingPropertyDescriptor[]
  }, [selectedFixtureTypeMode])

  // Non-dimmer/non-UV slider properties on the selected fixture type
  const extraSliderProperties = useMemo(() => {
    if (!selectedFixtureTypeMode) return [] as SliderPropertyDescriptor[]
    return selectedFixtureTypeMode.properties.filter(
      (p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv'
    ) as SliderPropertyDescriptor[]
  }, [selectedFixtureTypeMode])

  // Extended colour channels from selected fixture type (or all if no type selected)
  const extendedChannels = useMemo(() => {
    if (!selectedFixtureTypeMode) {
      // No fixture type selected — show all extended channels so user can configure them
      return { white: true, amber: true, uv: true }
    }
    return detectExtendedChannels([selectedFixtureTypeMode.properties])
  }, [selectedFixtureTypeMode])

  // Resolve the target property name for the effect being added
  const addTargetPropertyName = useMemo((): string | null => {
    if (!addEffectEntry || !selectedFixtureTypeMode) return null
    const allPropNames = new Set(selectedFixtureTypeMode.properties.map((p) => p.name))
    if (selectedFixtureTypeMode.properties.some((p) => p.type === 'setting')) allPropNames.add('setting')
    if (selectedFixtureTypeMode.properties.some((p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv')) allPropNames.add('slider')

    const matched = addEffectEntry.compatibleProperties.find((name) => allPropNames.has(name)) ?? null
    if (matched === 'setting') {
      if (addSelectedSettingProp && settingProperties.some((sp) => sp.name === addSelectedSettingProp)) {
        return addSelectedSettingProp
      }
      return settingProperties[0]?.name ?? null
    }
    if (matched === 'slider') {
      if (addSelectedSliderProp && extraSliderProperties.some((sp) => sp.name === addSelectedSliderProp)) {
        return addSelectedSliderProp
      }
      return extraSliderProperties[0]?.name ?? null
    }
    return matched
  }, [addEffectEntry, selectedFixtureTypeMode, settingProperties, addSelectedSettingProp, extraSliderProperties, addSelectedSliderProp])

  // Setting options for the currently-targeted setting property in the add view
  const addSettingOptions = useMemo(() => {
    if (!addEffectEntry?.compatibleProperties.includes('setting') || !addTargetPropertyName) return undefined
    const settingProp = settingProperties.find((sp) => sp.name === addTargetPropertyName)
    return settingProp?.options
  }, [addEffectEntry, addTargetPropertyName, settingProperties])

  // Edit effect: resolve target property name (mirrors addTargetPropertyName)
  const editTargetPropertyName = useMemo((): string | null => {
    if (!editEffectEntry || !selectedFixtureTypeMode) return null
    const allPropNames = new Set(selectedFixtureTypeMode.properties.map((p) => p.name))
    if (selectedFixtureTypeMode.properties.some((p) => p.type === 'setting')) allPropNames.add('setting')
    if (selectedFixtureTypeMode.properties.some((p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv')) allPropNames.add('slider')

    const matched = editEffectEntry.compatibleProperties.find((name) => allPropNames.has(name)) ?? null
    if (matched === 'setting') {
      if (editSelectedSettingProp && settingProperties.some((sp) => sp.name === editSelectedSettingProp)) {
        return editSelectedSettingProp
      }
      return settingProperties[0]?.name ?? null
    }
    if (matched === 'slider') {
      if (editSelectedSliderProp && extraSliderProperties.some((sp) => sp.name === editSelectedSliderProp)) {
        return editSelectedSliderProp
      }
      return extraSliderProperties[0]?.name ?? null
    }
    return matched
  }, [editEffectEntry, selectedFixtureTypeMode, settingProperties, editSelectedSettingProp, extraSliderProperties, editSelectedSliderProp])

  // Edit effect: setting options for the currently-targeted setting property
  const editSettingOptions = useMemo(() => {
    if (!editEffectEntry?.compatibleProperties.includes('setting') || !editTargetPropertyName) return undefined
    const settingProp = settingProperties.find((sp) => sp.name === editTargetPropertyName)
    return settingProp?.options
  }, [editEffectEntry, editTargetPropertyName, settingProperties])

  const handleAddEffect = () => {
    if (!addEffectEntry) return

    const newEffect: FxPresetEffect = {
      effectType: addEffectEntry.name,
      category: addEffectEntry.category,
      propertyName: addTargetPropertyName,
      beatDivision: addBeatDivision,
      blendMode: addBlendMode,
      distribution: addDistribution,
      phaseOffset: addPhaseOffset,
      elementMode: showElementMode ? addElementMode : null,
      elementFilter: addElementFilter !== 'ALL' ? addElementFilter : null,
      stepTiming: addStepTiming || null,
      parameters: { ...addParameters },
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

  // Add Effect handlers
  const handleOpenAddEffect = () => {
    setAddEffectStep('category')
    setAddEffectCategory(null)
    setAddEffectEntry(null)
    setAddBeatDivision(1.0)
    setAddBlendMode('OVERRIDE')
    setAddPhaseOffset(0)
    setAddDistribution('LINEAR')
    setAddElementMode('PER_FIXTURE')
    setAddElementFilter('ALL')
    setAddStepTiming(false)
    setAddParameters({})
    setAddSelectedSettingProp(null)
    setAddSelectedSliderProp(null)
    setView('add-effect')
  }

  const handleSelectCategory = (cat: string) => {
    setAddEffectCategory(cat)
    setAddEffectStep('effect')
  }

  const handleSelectEffect = (entry: EffectLibraryEntry) => {
    setAddEffectEntry(entry)
    const defaults: Record<string, string> = {}
    entry.parameters.forEach((p) => {
      defaults[p.name] = p.defaultValue
    })
    setAddParameters(defaults)
    setAddEffectStep('configure')
  }

  const handleConfirmAddEffect = () => {
    handleAddEffect()
    setView('form')
  }

  // Edit Effect handlers
  const handleOpenEditEffect = useCallback((index: number) => {
    const effect = effects[index]
    if (!effect) return
    const entry = findLibraryEntry(effect.effectType, effect.category)
    setEditEffectIndex(index)
    setEditEffectEntry(entry ?? null)
    setEditBeatDivision(effect.beatDivision)
    setEditBlendMode(effect.blendMode)
    setEditPhaseOffset(effect.phaseOffset)
    setEditDistribution(effect.distribution)
    setEditElementMode(effect.elementMode ?? 'PER_FIXTURE')
    setEditElementFilter(effect.elementFilter ?? 'ALL')
    setEditStepTiming(effect.stepTiming ?? false)
    setEditParameters({ ...effect.parameters })
    setEditSelectedSettingProp(effect.propertyName)
    setEditSelectedSliderProp(effect.propertyName)
    setView('edit-effect')
  }, [effects, findLibraryEntry])

  const handleConfirmEditEffect = () => {
    if (editEffectIndex === null || !editEffectEntry) return
    const updated: FxPresetEffect = {
      effectType: editEffectEntry.name,
      category: editEffectEntry.category,
      propertyName: editTargetPropertyName,
      beatDivision: editBeatDivision,
      blendMode: editBlendMode,
      distribution: editDistribution,
      phaseOffset: editPhaseOffset,
      elementMode: showElementMode ? editElementMode : null,
      elementFilter: editElementFilter !== 'ALL' ? editElementFilter : null,
      stepTiming: editStepTiming || null,
      parameters: { ...editParameters },
    }
    handleUpdateEffect(editEffectIndex, updated)
    setView('form')
  }

  const handleRemoveEditingEffect = () => {
    if (editEffectIndex === null) return
    handleRemoveEffect(editEffectIndex)
    setView('form')
  }

  // Open edit view for the initial effect index when the form opens (fire once)
  const initialEditConsumed = useRef(false)
  useEffect(() => {
    if (!open) {
      initialEditConsumed.current = false
      return
    }
    if (
      !initialEditConsumed.current &&
      initialEditEffectIndex != null &&
      effects.length > initialEditEffectIndex
    ) {
      initialEditConsumed.current = true
      handleOpenEditEffect(initialEditEffectIndex)
    }
  }, [open, initialEditEffectIndex, effects.length, handleOpenEditEffect])

  // Fixture type label for display
  const fixtureTypeLabel = useMemo(() => {
    if (!fixtureType || !hierarchy) return null
    return resolveFixtureTypeLabel(fixtureType, hierarchy)
  }, [fixtureType, hierarchy])

  // Validate each effect: effects that need a property picker must have a valid propertyName
  const effectErrors = useMemo<boolean[]>(() => {
    return effects.map((effect) => {
      const entry = findLibraryEntry(effect.effectType, effect.category)
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

  // Block sheet close when not on the main form view
  const handleSheetOpenChange = useCallback(
    (value: boolean) => {
      if (!value && view !== 'form') {
        // Back to form instead of closing
        setView('form')
        return
      }
      onOpenChange(value)
    },
    [onOpenChange, view],
  )

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col overflow-hidden"
      >
        {/* ===== Main form view ===== */}
        {view === 'form' && (
          <>
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

              {/* Fixture Type */}
              <div className="space-y-1.5 px-1">
                <Label>Fixture Type</Label>
                <button
                  type="button"
                  onClick={() => setView('fixture-type')}
                  className="flex items-center gap-2 w-full h-9 px-3 rounded-md border text-left text-sm hover:bg-accent/50 transition-colors"
                >
                  <span className={fixtureTypeLabel ? 'flex-1 truncate' : 'flex-1 truncate text-muted-foreground'}>
                    {fixtureTypeLabel ?? 'Any fixture type'}
                  </span>
                  {fixtureType && (
                    <X
                      className="size-4 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFixtureType(null)
                      }}
                    />
                  )}
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </button>
                <p className="text-[11px] text-muted-foreground">
                  Optionally restrict this preset to a specific fixture type.
                </p>
              </div>

              {/* Effects list */}
              <div className="space-y-2 px-1">
                <div className="flex items-center justify-between">
                  <Label>Effects ({effects.length})</Label>
                  <Button variant="outline" size="sm" className="h-8" onClick={handleOpenAddEffect}>
                    <Plus className="size-4 mr-1.5" />
                    Add Effect
                  </Button>
                </div>

                {effects.length === 0 && (
                  <div className="py-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                    No effects added yet. Use the button above to add effects.
                  </div>
                )}

                {effects.map((effect, index) => {
                  const entry = findLibraryEntry(effect.effectType, effect.category)
                  const catInfo = EFFECT_CATEGORY_INFO[effect.category]
                  const CatIcon = catInfo?.icon
                  const closestBeat = BEAT_DIVISION_OPTIONS.reduce((prev, curr) =>
                    Math.abs(curr.value - effect.beatDivision) < Math.abs(prev.value - effect.beatDivision) ? curr : prev,
                  )
                  const hasError = effectErrors[index]

                  // Resolve display value for static effects
                  let staticValueLabel: string | null = null
                  if (!hasError && entry) {
                    if (entry.compatibleProperties.includes('setting') && effect.propertyName) {
                      const settingProp = settingProperties.find((sp) => sp.name === effect.propertyName)
                      const level = effect.parameters['level']
                      if (settingProp && level != null) {
                        const opt = settingProp.options.find((o) => String(o.level) === level)
                        staticValueLabel = opt?.displayName ?? level
                      }
                    } else if (entry.compatibleProperties.includes('slider') && effect.propertyName) {
                      const paramName = entry.parameters.find((p) => p.type === 'ubyte')?.name ?? 'value'
                      const val = effect.parameters[paramName]
                      if (val != null) {
                        staticValueLabel = val
                      }
                    }
                  }

                  return (
                    <div
                      key={`${effect.effectType}-${index}`}
                      className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors ${hasError ? 'border-destructive' : ''}`}
                      onClick={() => handleOpenEditEffect(index)}
                    >
                      {CatIcon && <CatIcon className="size-4 text-muted-foreground shrink-0" />}
                      <span className="text-sm font-medium truncate">{effect.effectType}</span>
                      {effect.propertyName && !hasError && (
                        <span className="text-xs text-muted-foreground truncate">
                          &rarr; {effect.propertyName}
                          {staticValueLabel && ` = ${staticValueLabel}`}
                        </span>
                      )}
                      {hasError && (
                        <span className="text-xs text-destructive truncate">
                          {!selectedFixtureTypeMode
                            ? 'needs fixture type'
                            : effect.propertyName
                              ? `→ ${effect.propertyName} (invalid)`
                              : 'needs target property'}
                        </span>
                      )}
                      {!hasError && (
                        <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                          {entry
                            ? getEffectDescription(entry.name, entry.description)
                            : effect.category}
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
                            handleRemoveEffect(index)
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <SheetFooter className="border-t pt-4">
              {preset && onDelete && (
                <Button
                  variant="outline"
                  onClick={() => setView('confirm-delete')}
                  disabled={isSaving || isDeleting}
                  className="text-destructive hover:text-destructive"
                >
                  {isDeleting && <Loader2 className="size-4 mr-2 animate-spin" />}
                  Delete
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving || isDeleting}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!isValid || isSaving || isDeleting}>
                {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
                {preset ? 'Update' : 'Create'}
              </Button>
            </SheetFooter>
          </>
        )}

        {/* ===== Add Effect view (inline in sheet) ===== */}
        {view === 'add-effect' && (
          <>
            {addEffectStep !== 'configure' && (
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <button onClick={() => setView('form')} className="hover:bg-accent rounded p-0.5 -ml-1">
                    <ChevronLeft className="size-5" />
                  </button>
                  Add Effect
                </SheetTitle>
                <SheetDescription>
                  Choose an effect category and type to add to this preset.
                </SheetDescription>
              </SheetHeader>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto">
              {addEffectStep === 'category' && (
                <EffectCategoryPicker
                  effectsByCategory={effectsByCategory}
                  onSelect={handleSelectCategory}
                />
              )}

              {addEffectStep === 'effect' && addEffectCategory && (
                <EffectTypePicker
                  category={addEffectCategory}
                  effects={effectsByCategory[addEffectCategory] ?? []}
                  onSelect={handleSelectEffect}
                  onBack={() => setAddEffectStep('category')}
                />
              )}

              {addEffectStep === 'configure' && addEffectEntry && (
                <EffectParameterForm
                  effect={addEffectEntry}
                  beatDivision={addBeatDivision}
                  onBeatDivisionChange={setAddBeatDivision}
                  blendMode={addBlendMode}
                  onBlendModeChange={setAddBlendMode}
                  phaseOffset={addPhaseOffset}
                  onPhaseOffsetChange={setAddPhaseOffset}
                  startOnBeat={false}
                  onStartOnBeatChange={() => {}}
                  showStartOnBeat={false}
                  parameters={addParameters}
                  onParametersChange={setAddParameters}
                  targetPropertyName={addTargetPropertyName}
                  isEdit={false}
                  onBack={() => setAddEffectStep('effect')}
                  distributionStrategy={addDistribution}
                  onDistributionStrategyChange={setAddDistribution}
                  showDistribution
                  elementMode={addElementMode}
                  onElementModeChange={setAddElementMode}
                  showElementMode={showElementMode}
                  elementFilter={addElementFilter}
                  onElementFilterChange={setAddElementFilter}
                  showElementFilter
                  settingOptions={addSettingOptions}
                  settingProperties={addEffectEntry.compatibleProperties.includes('setting') ? settingProperties : undefined}
                  onSettingPropertyChange={setAddSelectedSettingProp}
                  sliderProperties={addEffectEntry.compatibleProperties.includes('slider') ? extraSliderProperties : undefined}
                  onSliderPropertyChange={setAddSelectedSliderProp}
                  extendedChannels={addEffectEntry.category === 'colour' ? extendedChannels : undefined}
                  stepTiming={addStepTiming}
                  onStepTimingChange={setAddStepTiming}
                />
              )}
            </div>

            {addEffectStep === 'configure' && (
              <div className="border-t px-4 pb-4 pt-2">
                <Button onClick={handleConfirmAddEffect} className="w-full">
                  Add Effect
                </Button>
              </div>
            )}
          </>
        )}

        {/* ===== Edit Effect view (inline in sheet) ===== */}
        {view === 'edit-effect' && editEffectEntry && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <EffectParameterForm
                effect={editEffectEntry}
                beatDivision={editBeatDivision}
                onBeatDivisionChange={setEditBeatDivision}
                blendMode={editBlendMode}
                onBlendModeChange={setEditBlendMode}
                phaseOffset={editPhaseOffset}
                onPhaseOffsetChange={setEditPhaseOffset}
                startOnBeat={false}
                onStartOnBeatChange={() => {}}
                showStartOnBeat={false}
                parameters={editParameters}
                onParametersChange={setEditParameters}
                targetPropertyName={editTargetPropertyName}
                isEdit={true}
                distributionStrategy={editDistribution}
                onDistributionStrategyChange={setEditDistribution}
                showDistribution
                elementMode={editElementMode}
                onElementModeChange={setEditElementMode}
                showElementMode={showElementMode}
                elementFilter={editElementFilter}
                onElementFilterChange={setEditElementFilter}
                showElementFilter
                settingOptions={editSettingOptions}
                settingProperties={editEffectEntry.compatibleProperties.includes('setting') ? settingProperties : undefined}
                onSettingPropertyChange={setEditSelectedSettingProp}
                sliderProperties={editEffectEntry.compatibleProperties.includes('slider') ? extraSliderProperties : undefined}
                onSliderPropertyChange={setEditSelectedSliderProp}
                extendedChannels={editEffectEntry.category === 'colour' ? extendedChannels : undefined}
                stepTiming={editStepTiming}
                onStepTimingChange={setEditStepTiming}
              />
            </div>
            <div className="flex gap-2 border-t px-4 pb-4 pt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveEditingEffect}
                className="mr-auto"
              >
                Remove
              </Button>
              <Button variant="outline" size="sm" onClick={() => setView('form')}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmEditEffect}>
                Update
              </Button>
            </div>
          </>
        )}

        {/* ===== Fixture Type picker view (inline in sheet) ===== */}
        {view === 'fixture-type' && (
          <FixtureTypePickerContent
            hierarchy={hierarchy}
            fixtureCounts={fixtureCounts}
            onSelect={(typeKey) => {
              setFixtureType(typeKey)
              setView('form')
            }}
            onClose={() => setView('form')}
          />
        )}

        {/* ===== Delete confirmation view (inline in sheet) ===== */}
        {view === 'confirm-delete' && (
          <>
            <SheetHeader>
              <SheetTitle>Delete Preset</SheetTitle>
              <SheetDescription>
                Are you sure you want to delete &ldquo;{preset?.name}&rdquo;? This action cannot be undone.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1" />
            <SheetFooter className="border-t pt-4">
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
