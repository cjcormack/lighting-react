import { useState, useMemo, useEffect } from 'react'
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
import { Plus, Loader2 } from 'lucide-react'
import { useEffectLibraryQuery } from '@/store/fixtureFx'
import { EFFECT_CATEGORY_INFO, getEffectDescription } from '@/components/fixtures/fx/fxConstants'
import { PresetEffectRow } from './PresetEffectRow'
import type { FxPreset, FxPresetEffect, FxPresetInput } from '@/api/fxPresetsApi'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

const CATEGORY_ORDER = ['dimmer', 'colour', 'position'] as const

interface PresetFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset: FxPreset | null
  onSave: (input: FxPresetInput) => Promise<void>
  isSaving: boolean
}

export function PresetForm({ open, onOpenChange, preset, onSave, isSaving }: PresetFormProps) {
  const { data: library } = useEffectLibraryQuery()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [effects, setEffects] = useState<FxPresetEffect[]>([])

  // Reset form when the sheet opens or the preset changes
  useEffect(() => {
    if (open) {
      setName(preset?.name ?? '')
      setDescription(preset?.description ?? '')
      setEffects(preset?.effects ?? [])
    }
  }, [open, preset])

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

  // Library lookup by normalized name
  const libraryMap = useMemo(() => {
    if (!library) return new Map<string, EffectLibraryEntry>()
    const map = new Map<string, EffectLibraryEntry>()
    for (const entry of library) {
      map.set(entry.name.toLowerCase().replace(/[\s_]/g, ''), entry)
    }
    return map
  }, [library])

  const findLibraryEntry = (effectType: string): EffectLibraryEntry | undefined => {
    return libraryMap.get(effectType.toLowerCase().replace(/[\s_]/g, ''))
  }

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
      effects,
    })
    onOpenChange(false)
  }

  const isValid = name.trim().length > 0 && effects.length > 0

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

          {/* Effects list */}
          <div className="space-y-2 px-1">
            <div className="flex items-center justify-between">
              <Label>Effects ({effects.length})</Label>
              <AddEffectPicker
                libraryByCategory={libraryByCategory}
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
  onAdd,
}: {
  libraryByCategory: Record<string, EffectLibraryEntry[]>
  onAdd: (entry: EffectLibraryEntry) => void
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedEffect, setSelectedEffect] = useState<string>('')

  const categories = CATEGORY_ORDER.filter((cat) => (libraryByCategory[cat]?.length ?? 0) > 0)
  const effectsInCategory = selectedCategory ? libraryByCategory[selectedCategory] ?? [] : []

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
