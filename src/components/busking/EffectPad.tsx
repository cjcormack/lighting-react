import React, { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crosshair, Bookmark, Plus, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { EFFECT_CATEGORY_INFO, BEAT_DIVISION_OPTIONS } from '@/components/fixtures/fx/fxConstants'
import { EffectPadButton } from './EffectPadButton'
import { PropertyPadButton } from './PropertyPadButton'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { EffectPresence, PropertyButton } from './buskingTypes'
import type { FxPreset } from '@/api/fxPresetsApi'

const CATEGORY_ORDER = ['presets', 'dimmer', 'colour', 'position', 'controls'] as const

interface EffectPadProps {
  effectsByCategory: Record<string, EffectLibraryEntry[]>
  getPresence: (effectName: string) => EffectPresence
  onToggle: (effect: EffectLibraryEntry) => void
  onLongPress: (effect: EffectLibraryEntry) => void
  hasSelection: boolean
  presets: FxPreset[]
  onApplyPreset: (preset: FxPreset) => Promise<void>
  getPresetPresence: (preset: FxPreset) => EffectPresence
  currentProjectId: number | undefined
  // Beat division
  defaultBeatDivision: number
  onBeatDivisionChange: (value: number) => void
  // Property buttons (settings & sliders)
  propertyButtons: PropertyButton[]
  getPropertyPresence: (button: PropertyButton) => EffectPresence
  onPropertyToggle: (button: PropertyButton, settingLevel?: number) => void
  onPropertyLongPress: (button: PropertyButton) => void
  getPropertyValue: (button: PropertyButton) => string | null
  onCreatePreset: () => void
  onEditPreset: (preset: FxPreset) => void
}

export function EffectPad({
  effectsByCategory,
  getPresence,
  onToggle,
  onLongPress,
  hasSelection,
  presets,
  onApplyPreset,
  getPresetPresence,
  currentProjectId,
  defaultBeatDivision,
  onBeatDivisionChange,
  propertyButtons,
  getPropertyPresence,
  onPropertyToggle,
  onPropertyLongPress,
  getPropertyValue,
  onCreatePreset,
  onEditPreset,
}: EffectPadProps) {
  if (!hasSelection) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-4">
        <Crosshair className="size-10 opacity-30" />
        <p className="text-sm text-center">Select a group or fixture to control effects</p>
      </div>
    )
  }

  return (
    <div className="@container flex flex-col h-full overflow-y-auto px-2 pb-2">
      {CATEGORY_ORDER.map((cat) => {
        if (cat === 'presets') {
          return (
            <CategorySection key={cat} label="Presets" icon={Bookmark}>
              <PresetGrid
                presets={presets}
                onApplyPreset={onApplyPreset}
                onEditPreset={onEditPreset}
                getPresetPresence={getPresetPresence}
                currentProjectId={currentProjectId}
                onCreatePreset={onCreatePreset}
              />
            </CategorySection>
          )
        }

        if (cat === 'dimmer') {
          // Render Time (beat division) strip before the effect categories
          const dimmerEffects = effectsByCategory[cat] ?? []
          const info = EFFECT_CATEGORY_INFO[cat]
          return (
            <React.Fragment key="dimmer-with-time">
              <hr className="border-border mt-3 mb-0" />
              <CategorySection label="Time" icon={Clock}>
                <ToggleGroup
                  type="single"
                  value={String(defaultBeatDivision)}
                  onValueChange={(v) => {
                    if (v) onBeatDivisionChange(parseFloat(v))
                  }}
                  className="gap-0.5 flex-wrap justify-start"
                >
                  {BEAT_DIVISION_OPTIONS.map((opt) => (
                    <ToggleGroupItem
                      key={opt.value}
                      value={String(opt.value)}
                      size="sm"
                      className="text-xs px-2 h-7"
                    >
                      {opt.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </CategorySection>
              {dimmerEffects.length > 0 && info && (
                <CategorySection label={info.label} icon={info.icon}>
                  <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
                    {dimmerEffects.map((effect) => (
                      <EffectPadButton
                        key={effect.name}
                        effect={effect}
                        presence={getPresence(effect.name)}
                        onToggle={() => onToggle(effect)}
                        onLongPress={() => onLongPress(effect)}
                      />
                    ))}
                  </div>
                </CategorySection>
              )}
            </React.Fragment>
          )
        }

        if (cat === 'controls') {
          if (propertyButtons.length === 0) return null
          const info = EFFECT_CATEGORY_INFO[cat]
          if (!info) return null
          return (
            <CategorySection key={cat} label={info.label} icon={info.icon}>
              <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
                {propertyButtons.map((btn) => (
                  <PropertyPadButton
                    key={`${btn.kind}:${btn.propertyName}`}
                    button={btn}
                    presence={getPropertyPresence(btn)}
                    activeValue={getPropertyValue(btn)}
                    onToggle={(level) => onPropertyToggle(btn, level)}
                    onLongPress={() => onPropertyLongPress(btn)}
                  />
                ))}
              </div>
            </CategorySection>
          )
        }

        // Effect categories: dimmer, colour, position
        const effects = effectsByCategory[cat] ?? []
        if (effects.length === 0) return null
        const info = EFFECT_CATEGORY_INFO[cat]
        if (!info) return null

        return (
          <CategorySection key={cat} label={info.label} icon={info.icon}>
            <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
              {effects.map((effect) => (
                <EffectPadButton
                  key={effect.name}
                  effect={effect}
                  presence={getPresence(effect.name)}
                  onToggle={() => onToggle(effect)}
                  onLongPress={() => onLongPress(effect)}
                />
              ))}
            </div>
          </CategorySection>
        )
      })}
    </div>
  )
}

function CategorySection({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="mt-3 first:mt-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <Icon className="size-3.5" />
        {label}
      </div>
      {children}
    </div>
  )
}

const MOVE_THRESHOLD = 10

function PresetGrid({
  presets,
  onApplyPreset,
  onEditPreset,
  getPresetPresence,
  currentProjectId,
  onCreatePreset,
}: {
  presets: FxPreset[]
  onApplyPreset: (preset: FxPreset) => Promise<void>
  onEditPreset: (preset: FxPreset) => void
  getPresetPresence: (preset: FxPreset) => EffectPresence
  currentProjectId: number | undefined
  onCreatePreset: () => void
}) {
  const navigate = useNavigate()

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
        {presets.map((preset) => (
          <PresetPadButton
            key={preset.id}
            preset={preset}
            presence={getPresetPresence(preset)}
            onToggle={() => onApplyPreset(preset)}
            onLongPress={() => onEditPreset(preset)}
          />
        ))}
        {currentProjectId && (
          <button
            onClick={onCreatePreset}
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border border-dashed px-2 py-3 text-center transition-all',
              'min-h-[64px] select-none touch-manipulation',
              'border-border hover:bg-accent/50 hover:border-muted-foreground/50',
              'active:scale-95',
            )}
          >
            <Plus className="size-5 text-muted-foreground mb-0.5" />
            <span className="text-xs text-muted-foreground">New Preset</span>
          </button>
        )}
      </div>
      {currentProjectId && presets.length > 0 && (
        <div className="text-center pt-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/projects/${currentProjectId}/presets`)}
          >
            Manage presets →
          </button>
        </div>
      )}
    </div>
  )
}

function PresetPadButton({
  preset,
  presence,
  onToggle,
  onLongPress,
}: {
  preset: FxPreset
  presence: EffectPresence
  onToggle: () => void
  onLongPress: () => void
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const didMove = useRef(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    didLongPress.current = false
    didMove.current = false
    startPos.current = { x: e.clientX, y: e.clientY }
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true
      if (!didMove.current) {
        onLongPress()
      }
    }, 500)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (startPos.current && !didMove.current) {
      const dx = e.clientX - startPos.current.x
      const dy = e.clientY - startPos.current.y
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
        didMove.current = true
        if (pressTimer.current) {
          clearTimeout(pressTimer.current)
          pressTimer.current = null
        }
      }
    }
  }

  const handlePointerUp = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    if (!didLongPress.current && !didMove.current) {
      onToggle()
    }
    startPos.current = null
  }

  const handlePointerLeave = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    startPos.current = null
  }

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-center transition-all',
        'min-h-[64px] select-none touch-manipulation',
        'active:scale-95',
        presence === 'none' && 'border-border bg-card hover:bg-accent/50',
        presence === 'some' && 'border-primary/40 bg-primary/10 hover:bg-primary/15',
        presence === 'all' && 'border-primary bg-primary/20 ring-1 ring-primary/50 hover:bg-primary/25',
      )}
    >
      <span
        className={cn(
          'text-sm font-medium leading-tight',
          presence !== 'none' ? 'text-primary' : 'text-foreground',
        )}
      >
        {preset.name}
      </span>
      {preset.description && (
        <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-1">
          {preset.description}
        </span>
      )}
      <Badge variant="secondary" className="mt-1 text-[9px] px-1.5 py-0 leading-tight">
        {preset.effects.length} {preset.effects.length === 1 ? 'effect' : 'effects'}
      </Badge>
      {presence !== 'none' && (
        <div
          className={cn(
            'absolute top-1.5 right-1.5 size-2 rounded-full',
            presence === 'all' ? 'bg-primary' : 'bg-primary/50',
          )}
        />
      )}
    </button>
  )
}
