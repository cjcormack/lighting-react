import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { BEAT_DIVISION_OPTIONS, BLEND_MODE_OPTIONS, DISTRIBUTION_STRATEGY_OPTIONS, ELEMENT_MODE_OPTIONS, ELEMENT_FILTER_OPTIONS, getEffectDescription } from './fxConstants'
import type { EffectLibraryEntry, EffectParameterDef } from '@/store/fixtureFx'
import type { SettingOption, SettingPropertyDescriptor, SliderPropertyDescriptor } from '@/store/fixtures'
import { FxColourPicker } from './FxColourPicker'
import { FxColourListPicker } from './FxColourListPicker'

interface EffectParameterFormProps {
  effect: EffectLibraryEntry
  beatDivision: number
  onBeatDivisionChange: (v: number) => void
  blendMode: string
  onBlendModeChange: (v: string) => void
  phaseOffset: number
  onPhaseOffsetChange: (v: number) => void
  startOnBeat: boolean
  onStartOnBeatChange: (v: boolean) => void
  parameters: Record<string, string>
  onParametersChange: (v: Record<string, string>) => void
  targetPropertyName: string | null
  isEdit: boolean
  onBack?: () => void
  distributionStrategy?: string
  onDistributionStrategyChange?: (v: string) => void
  showDistribution?: boolean
  showStartOnBeat?: boolean
  elementMode?: string
  onElementModeChange?: (v: string) => void
  showElementMode?: boolean
  elementFilter?: string
  onElementFilterChange?: (v: string) => void
  showElementFilter?: boolean
  settingOptions?: SettingOption[]
  /** All setting properties available on the fixture (for choosing which setting to target) */
  settingProperties?: SettingPropertyDescriptor[]
  /** Called when user picks a different setting property */
  onSettingPropertyChange?: (propertyName: string) => void
  /** Non-dimmer/non-UV slider properties available on the fixture */
  sliderProperties?: SliderPropertyDescriptor[]
  /** Called when user picks a different slider property */
  onSliderPropertyChange?: (propertyName: string) => void
  /** Extended colour channels available on the target fixture (for colour effects) */
  extendedChannels?: { white?: boolean; amber?: boolean; uv?: boolean }
}

export function EffectParameterForm({
  effect,
  beatDivision,
  onBeatDivisionChange,
  blendMode,
  onBlendModeChange,
  phaseOffset,
  onPhaseOffsetChange,
  startOnBeat,
  onStartOnBeatChange,
  parameters,
  onParametersChange,
  targetPropertyName,
  isEdit,
  onBack,
  distributionStrategy,
  onDistributionStrategyChange,
  showDistribution,
  showStartOnBeat = true,
  elementMode,
  onElementModeChange,
  showElementMode,
  elementFilter,
  onElementFilterChange,
  showElementFilter,
  settingOptions,
  settingProperties,
  onSettingPropertyChange,
  sliderProperties,
  onSliderPropertyChange,
  extendedChannels,
}: EffectParameterFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleParameterChange = (name: string, value: string) => {
    onParametersChange({ ...parameters, [name]: value })
  }

  // Find the closest beat division value for the toggle group
  const closestBeatDivision = BEAT_DIVISION_OPTIONS.reduce((prev, curr) =>
    Math.abs(curr.value - beatDivision) < Math.abs(prev.value - beatDivision) ? curr : prev,
  )

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header with back button */}
      <div className="flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onBack}>
            <ChevronLeft className="size-4" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium">{effect.name}</div>
          <div className="text-xs text-muted-foreground">
            {getEffectDescription(effect.name, effect.description)}
          </div>
        </div>
        {targetPropertyName && (
          <Badge variant="secondary" className="text-xs shrink-0">
            {targetPropertyName}
          </Badge>
        )}
      </div>

      {/* Speed selector */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Speed</Label>
        <ToggleGroup
          type="single"
          value={String(closestBeatDivision.value)}
          onValueChange={(v) => v && onBeatDivisionChange(Number(v))}
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

      {/* Distribution strategy (multi-head fixtures only) */}
      {showDistribution && distributionStrategy && onDistributionStrategyChange && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Distribution</Label>
          <Select value={distributionStrategy} onValueChange={onDistributionStrategyChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISTRIBUTION_STRATEGY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  <span>{option.label}</span>
                  <span className="text-muted-foreground ml-2">{option.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Element mode (groups with multi-element fixtures only) */}
      {showElementMode && elementMode && onElementModeChange && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Element Mode</Label>
          <Select value={elementMode} onValueChange={onElementModeChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELEMENT_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  <span>{option.label}</span>
                  <span className="text-muted-foreground ml-2">{option.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Element filter (multi-head fixtures) */}
      {showElementFilter && elementFilter && onElementFilterChange && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Element Filter</Label>
          <Select value={elementFilter} onValueChange={onElementFilterChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELEMENT_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  <span>{option.label}</span>
                  <span className="text-muted-foreground ml-2">{option.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Setting property picker (when fixture has multiple settings) */}
      {settingProperties && settingProperties.length > 1 && targetPropertyName && onSettingPropertyChange && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Target Setting</Label>
          <Select value={targetPropertyName} onValueChange={onSettingPropertyChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {settingProperties.map((sp) => (
                <SelectItem key={sp.name} value={sp.name} className="text-xs">
                  {sp.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Slider property picker (when fixture has extra slider properties like pumpControl, fanSpeed) */}
      {sliderProperties && sliderProperties.length > 0 && targetPropertyName && onSliderPropertyChange && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Target Property</Label>
          <Select value={targetPropertyName} onValueChange={onSliderPropertyChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sliderProperties.map((sp) => (
                <SelectItem key={sp.name} value={sp.name} className="text-xs">
                  {sp.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Setting options dropdown (for StaticSetting with known options) */}
      {settingOptions && settingOptions.length > 0 && effect.parameters.some((p) => p.name === 'level') && (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Setting Option</Label>
          <Select
            value={parameters['level'] ?? '0'}
            onValueChange={(v) => handleParameterChange('level', v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {settingOptions.map((opt) => (
                <SelectItem key={opt.level} value={String(opt.level)} className="text-xs">
                  <span className="flex items-center gap-2">
                    {opt.colourPreview && (
                      <span
                        className="inline-block size-3 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: opt.colourPreview }}
                      />
                    )}
                    {opt.displayName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Effect-specific parameters (skip 'level' when setting options are shown) */}
      {effect.parameters.length > 0 && (
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">Parameters</Label>
          {effect.parameters
            .filter((param) => !(settingOptions && settingOptions.length > 0 && param.name === 'level'))
            .map((param) => (
            <ParameterInput
              key={param.name}
              param={param}
              value={parameters[param.name] ?? param.defaultValue}
              onChange={(v) => handleParameterChange(param.name, v)}
              extendedChannels={extendedChannels}
            />
          ))}
        </div>
      )}

      {/* Advanced toggle */}
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        Advanced
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-2 border-l-2 border-muted">
          {/* Blend mode */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Blend Mode</Label>
            <Select value={blendMode} onValueChange={onBlendModeChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLEND_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    <span>{option.label}</span>
                    <span className="text-muted-foreground ml-2">{option.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Phase offset */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Phase Offset: {phaseOffset.toFixed(2)}
            </Label>
            <Slider
              value={[phaseOffset]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) => onPhaseOffsetChange(v)}
            />
          </div>

          {/* Start on beat (add mode only, hidden for groups) */}
          {!isEdit && showStartOnBeat && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={startOnBeat}
                onChange={(e) => onStartOnBeatChange(e.target.checked)}
                className="rounded border-input"
              />
              <span>Start on beat</span>
              <span className="text-muted-foreground">Quantize to beat grid</span>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

function ParameterInput({
  param,
  value,
  onChange,
  extendedChannels,
}: {
  param: EffectParameterDef
  value: string
  onChange: (v: string) => void
  extendedChannels?: { white?: boolean; amber?: boolean; uv?: boolean }
}) {
  const paramType = param.type.toLowerCase()

  // UByte → slider 0-255
  if (paramType === 'ubyte') {
    const numVal = Number(value) || 0
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs">{formatParamName(param.name)}</span>
          <span className="text-xs text-muted-foreground">{numVal}</span>
        </div>
        {param.description && (
          <p className="text-[11px] text-muted-foreground mb-1">{param.description}</p>
        )}
        <Slider
          value={[numVal]}
          min={0}
          max={255}
          step={1}
          onValueChange={([v]) => onChange(String(v))}
        />
      </div>
    )
  }

  // Double/Float → slider with appropriate range
  if (paramType === 'double' || paramType === 'float') {
    const numVal = Number(value) || 0
    // Heuristic: if default <= 1.0, treat as 0-1 ratio; otherwise 0-10 range
    const max = Number(param.defaultValue) <= 1.0 ? 1.0 : 10.0
    const step = max <= 1.0 ? 0.01 : 0.1
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs">{formatParamName(param.name)}</span>
          <span className="text-xs text-muted-foreground">{numVal.toFixed(2)}</span>
        </div>
        {param.description && (
          <p className="text-[11px] text-muted-foreground mb-1">{param.description}</p>
        )}
        <Slider
          value={[numVal]}
          min={0}
          max={max}
          step={step}
          onValueChange={([v]) => onChange(String(v))}
        />
      </div>
    )
  }

  // Int → slider with sensible range
  if (paramType === 'int') {
    const numVal = Number(value) || 0
    const max = Math.max(255, numVal * 2)
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs">{formatParamName(param.name)}</span>
          <span className="text-xs text-muted-foreground">{numVal}</span>
        </div>
        {param.description && (
          <p className="text-[11px] text-muted-foreground mb-1">{param.description}</p>
        )}
        <Slider
          value={[numVal]}
          min={0}
          max={max}
          step={1}
          onValueChange={([v]) => onChange(String(v))}
        />
      </div>
    )
  }

  // Boolean → checkbox
  if (paramType === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(String(e.target.checked))}
          className="rounded border-input"
        />
        <span>{formatParamName(param.name)}</span>
        {param.description && (
          <span className="text-muted-foreground">{param.description}</span>
        )}
      </label>
    )
  }

  // EasingCurve → select
  if (paramType === 'easingcurve') {
    const curves = [
      'LINEAR',
      'SINE_IN',
      'SINE_OUT',
      'SINE_IN_OUT',
      'QUAD_IN',
      'QUAD_OUT',
      'QUAD_IN_OUT',
      'EXPO_IN',
      'EXPO_OUT',
      'EXPO_IN_OUT',
    ]
    return (
      <div>
        <Label className="text-xs mb-1.5 block">{formatParamName(param.name)}</Label>
        {param.description && (
          <p className="text-[11px] text-muted-foreground mb-1">{param.description}</p>
        )}
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {curves.map((curve) => (
              <SelectItem key={curve} value={curve} className="text-xs">
                {curve.toLowerCase().replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  // Colour → colour picker
  if (paramType === 'colour') {
    return (
      <FxColourPicker
        value={value}
        onChange={onChange}
        label={formatParamName(param.name)}
        description={param.description}
        extendedChannels={extendedChannels}
      />
    )
  }

  // ColourList → multi-colour picker with drag-to-reorder
  if (paramType === 'colourlist') {
    return (
      <FxColourListPicker
        value={value}
        onChange={onChange}
        label={formatParamName(param.name)}
        description={param.description}
        extendedChannels={extendedChannels}
      />
    )
  }

  // Default: text input
  return (
    <div>
      <Label className="text-xs mb-1.5 block">{formatParamName(param.name)}</Label>
      {param.description && (
        <p className="text-[11px] text-muted-foreground mb-1">{param.description}</p>
      )}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
        placeholder={param.defaultValue}
      />
    </div>
  )
}

function formatParamName(name: string): string {
  // camelCase → Title Case with spaces
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}
