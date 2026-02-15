import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import type { EffectLibraryEntry, EffectParameterDef } from '@/store/fixtureFx'

interface PresetEffectRowProps {
  effect: FxPresetEffect
  libraryEntry: EffectLibraryEntry | undefined
  onChange: (updated: FxPresetEffect) => void
  onRemove: () => void
}

export function PresetEffectRow({ effect, libraryEntry, onChange, onRemove }: PresetEffectRowProps) {
  const [expanded, setExpanded] = useState(false)

  const categoryInfo = EFFECT_CATEGORY_INFO[effect.category]
  const CategoryIcon = categoryInfo?.icon

  const closestBeatDivision = BEAT_DIVISION_OPTIONS.reduce((prev, curr) =>
    Math.abs(curr.value - effect.beatDivision) < Math.abs(prev.value - effect.beatDivision)
      ? curr
      : prev,
  )

  return (
    <div className="border rounded-lg">
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
        <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
          {libraryEntry
            ? getEffectDescription(libraryEntry.name, libraryEntry.description)
            : effect.category}
        </span>
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
        <div className="px-3 pb-3 space-y-3 border-t">
          {/* Speed */}
          <div className="pt-3">
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

          {/* Blend Mode */}
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

          {/* Effect-specific parameters */}
          {libraryEntry && libraryEntry.parameters.length > 0 && (
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
        </div>
      )}
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
