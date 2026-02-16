import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import {
  BEAT_DIVISION_OPTIONS,
  BLEND_MODE_OPTIONS,
  DISTRIBUTION_STRATEGY_OPTIONS,
  EFFECT_CATEGORY_INFO,
  getEffectDescription,
} from '@/components/fixtures/fx/fxConstants'
import type { FxPresetEffect } from '@/api/fxPresetsApi'
import type { FixtureTypeMode } from '@/api/fxPresetsApi'
import type { EffectLibraryEntry, EffectParameterDef } from '@/store/fixtureFx'
import type { PropertyDescriptor, SettingPropertyDescriptor, SliderPropertyDescriptor } from '@/store/fixtures'

// Sentinel for Select components that need a "none" option
const NONE = '__none__'

interface PresetEffectRowProps {
  effect: FxPresetEffect
  libraryEntry: EffectLibraryEntry | undefined
  fixtureTypeMode: FixtureTypeMode | null
  hasError?: boolean
  onChange: (updated: FxPresetEffect) => void
  onRemove: () => void
}

export function PresetEffectRow({ effect, libraryEntry, fixtureTypeMode, hasError, onChange, onRemove }: PresetEffectRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const categoryInfo = EFFECT_CATEGORY_INFO[effect.category]
  const CategoryIcon = categoryInfo?.icon

  const closestBeatDivision = BEAT_DIVISION_OPTIONS.reduce((prev, curr) =>
    Math.abs(curr.value - effect.beatDivision) < Math.abs(prev.value - effect.beatDivision)
      ? curr
      : prev,
  )

  // Determine if this effect needs a target property picker
  // StaticSetting targets setting-type properties; StaticValue targets slider-type properties
  const needsPropertyPicker = libraryEntry != null && (
    libraryEntry.compatibleProperties.includes('setting') ||
    libraryEntry.compatibleProperties.includes('slider')
  )

  // Build list of compatible properties from the fixture type
  const compatibleProperties = useMemo<PropertyDescriptor[]>(() => {
    if (!needsPropertyPicker || !libraryEntry || !fixtureTypeMode) return []
    return fixtureTypeMode.properties.filter((p) => {
      if (libraryEntry.compatibleProperties.includes('setting') && p.type === 'setting') return true
      if (libraryEntry.compatibleProperties.includes('slider') && p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv') return true
      // Also match direct property names (e.g., "dimmer", "uv")
      if (libraryEntry.compatibleProperties.includes(p.name)) return true
      return false
    })
  }, [needsPropertyPicker, libraryEntry, fixtureTypeMode])

  // Get the selected property descriptor (for showing setting options / slider range)
  const selectedProperty = useMemo<PropertyDescriptor | undefined>(() => {
    if (!effect.propertyName || !fixtureTypeMode) return undefined
    return fixtureTypeMode.properties.find((p) => p.name === effect.propertyName)
  }, [effect.propertyName, fixtureTypeMode])

  // For display in the collapsed header
  const propertyLabel = selectedProperty?.displayName ?? effect.propertyName

  return (
    <div className={`border rounded-lg ${hasError ? 'border-destructive' : ''}`}>
      {/* Collapsed header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <button className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        {CategoryIcon && <CategoryIcon className="size-4 text-muted-foreground shrink-0" />}
        <span className="text-sm font-medium truncate">{effect.effectType}</span>
        {propertyLabel && !hasError && (
          <span className="text-xs text-muted-foreground truncate">→ {propertyLabel}</span>
        )}
        {hasError ? (
          <span className="text-xs text-destructive truncate">
            {!fixtureTypeMode
              ? 'needs fixture type'
              : effect.propertyName
                ? `→ ${effect.propertyName} (invalid)`
                : 'needs target property'}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
            {libraryEntry
              ? getEffectDescription(libraryEntry.name, libraryEntry.description)
              : effect.category}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {closestBeatDivision.label}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded parameters */}
      {expanded && (
        <div className="px-3 pt-3 pb-3 space-y-3 border-t">
          {/* Target property picker (for StaticSetting / StaticValue / slider-compatible effects) */}
          {needsPropertyPicker && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Target Property</label>
              {compatibleProperties.length > 0 ? (
                <Select
                  value={effect.propertyName ?? NONE}
                  onValueChange={(v) =>
                    onChange({ ...effect, propertyName: v === NONE ? null : v })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select property…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} className="text-xs">Not specified</SelectItem>
                    {compatibleProperties.map((p) => (
                      <SelectItem key={p.name} value={p.name} className="text-xs">
                        {p.displayName}
                        <span className="text-muted-foreground ml-1 text-[10px]">({p.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {fixtureTypeMode
                    ? 'No compatible properties on this fixture type.'
                    : 'Select a fixture type to pick a target property.'}
                </p>
              )}
            </div>
          )}

          {/* Setting option picker (for StaticSetting with a selected setting property) */}
          {selectedProperty?.type === 'setting' && (
            <SettingLevelPicker
              property={selectedProperty as SettingPropertyDescriptor}
              value={effect.parameters['level'] ?? '0'}
              onChange={(v) =>
                onChange({
                  ...effect,
                  parameters: { ...effect.parameters, level: v },
                })
              }
            />
          )}

          {/* Slider value picker (for effects targeting a slider property) */}
          {selectedProperty?.type === 'slider' && needsPropertyPicker && libraryEntry && (
            <SliderValuePicker
              property={selectedProperty as SliderPropertyDescriptor}
              paramName={libraryEntry.parameters.find((p) => p.type === 'ubyte')?.name ?? 'value'}
              value={effect.parameters[libraryEntry.parameters.find((p) => p.type === 'ubyte')?.name ?? 'value'] ?? '128'}
              onChange={(paramName, v) =>
                onChange({
                  ...effect,
                  parameters: { ...effect.parameters, [paramName]: v },
                })
              }
            />
          )}

          {/* Effect-specific parameters (for effects that don't need special pickers) */}
          {libraryEntry && libraryEntry.parameters.length > 0 && !needsPropertyPicker && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Parameters</label>
              {libraryEntry.parameters.map((param) => (
                <SimpleParamInput
                  key={param.name}
                  param={param}
                  value={effect.parameters[param.name] ?? param.defaultValue}
                  onChange={(v) =>
                    onChange({
                      ...effect,
                      parameters: { ...effect.parameters, [param.name]: v },
                    })
                  }
                />
              ))}
            </div>
          )}

          {/* Speed */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Speed</label>
            <ToggleGroup
              type="single"
              value={String(closestBeatDivision.value)}
              onValueChange={(v) =>
                v && onChange({ ...effect, beatDivision: Number(v) })
              }
              className="flex flex-wrap gap-1"
            >
              {BEAT_DIVISION_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={String(option.value)}
                  className="text-xs px-2 h-7"
                  title={option.description}
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Distribution */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Distribution</label>
            <Select
              value={effect.distribution}
              onValueChange={(v) => onChange({ ...effect, distribution: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISTRIBUTION_STRATEGY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide advanced' : 'Advanced…'}
          </button>

          {/* Blend Mode (advanced) */}
          {showAdvanced && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Blend Mode</label>
              <Select
                value={effect.blendMode}
                onValueChange={(v) => onChange({ ...effect, blendMode: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLEND_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SettingLevelPicker({
  property,
  value,
  onChange,
}: {
  property: SettingPropertyDescriptor
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">
        {property.displayName} Value
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select option…" />
        </SelectTrigger>
        <SelectContent>
          {property.options.map((opt) => (
            <SelectItem key={opt.name} value={String(opt.level)} className="text-xs">
              <span className="flex items-center gap-2">
                {opt.colourPreview && (
                  <span
                    className="inline-block size-3 rounded-full border shrink-0"
                    style={{ backgroundColor: opt.colourPreview }}
                  />
                )}
                {opt.displayName}
                <span className="text-muted-foreground text-[10px]">({opt.level})</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function SliderValuePicker({
  property,
  paramName,
  value,
  onChange,
}: {
  property: SliderPropertyDescriptor
  paramName: string
  value: string
  onChange: (paramName: string, v: string) => void
}) {
  const numValue = Number(value) || 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-muted-foreground">{property.displayName} Value</label>
        <span className="text-xs text-muted-foreground">{numValue}</span>
      </div>
      <Slider
        min={property.min}
        max={property.max}
        value={[numValue]}
        onValueChange={([v]) => onChange(paramName, String(v))}
      />
    </div>
  )
}

function SimpleParamInput({
  param,
  value,
  onChange,
}: {
  param: EffectParameterDef
  value: string
  onChange: (v: string) => void
}) {
  const paramType = param.type.toLowerCase()
  const formattedName = param.name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()

  if (paramType === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(String(e.target.checked))}
          className="rounded border-input"
        />
        <span>{formattedName}</span>
      </label>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs">{formattedName}</span>
        <span className="text-xs text-muted-foreground">{value}</span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-7 px-2 text-xs border rounded-md bg-background"
        placeholder={param.defaultValue}
      />
    </div>
  )
}
