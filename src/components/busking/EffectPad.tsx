import { useNavigate } from 'react-router-dom'
import { Crosshair, Bookmark, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { EFFECT_CATEGORY_INFO } from '@/components/fixtures/fx/fxConstants'
import { EffectPadButton } from './EffectPadButton'
import { PropertyPadButton } from './PropertyPadButton'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { EffectPresence, PropertyButton } from './buskingTypes'
import type { FxPreset } from '@/api/fxPresetsApi'

const CATEGORY_ORDER = ['dimmer', 'colour', 'position'] as const

interface EffectPadProps {
  effectsByCategory: Record<string, EffectLibraryEntry[]>
  activeCategory: string
  onCategoryChange: (category: string) => void
  getPresence: (effectName: string) => EffectPresence
  onToggle: (effect: EffectLibraryEntry) => void
  onLongPress: (effect: EffectLibraryEntry) => void
  hasSelection: boolean
  presets: FxPreset[]
  onApplyPreset: (preset: FxPreset) => Promise<void>
  getPresetPresence: (preset: FxPreset) => EffectPresence
  currentProjectId: number | undefined
  // Property buttons (settings & sliders)
  propertyButtons: PropertyButton[]
  getPropertyPresence: (button: PropertyButton) => EffectPresence
  onPropertyToggle: (button: PropertyButton, settingLevel?: number) => void
  onPropertyLongPress: (button: PropertyButton) => void
  getPropertyValue: (button: PropertyButton) => string | null
}

export function EffectPad({
  effectsByCategory,
  activeCategory,
  onCategoryChange,
  getPresence,
  onToggle,
  onLongPress,
  hasSelection,
  presets,
  onApplyPreset,
  getPresetPresence,
  currentProjectId,
  propertyButtons,
  getPropertyPresence,
  onPropertyToggle,
  onPropertyLongPress,
  getPropertyValue,
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
    <div className="@container flex flex-col h-full">
      <Tabs value={activeCategory} onValueChange={onCategoryChange} className="flex flex-col h-full">
        <TabsList className="mx-2 mt-2 w-auto self-start shrink-0 max-w-[calc(100%-1rem)] overflow-x-auto scrollbar-none h-9">
          {CATEGORY_ORDER.map((cat) => {
            const info = EFFECT_CATEGORY_INFO[cat]
            if (!info) return null
            const Icon = info.icon
            const count = effectsByCategory[cat]?.length ?? 0
            return (
              <TabsTrigger key={cat} value={cat} disabled={count === 0} className="gap-1 @[38rem]:gap-1.5 px-2 @[38rem]:px-3">
                <Icon className="size-4" />
                <span className="hidden @[38rem]:inline">{info.label}</span>
                {count > 0 && (
                  <span className="text-[10px] text-muted-foreground ml-0.5 hidden @[38rem]:inline">({count})</span>
                )}
              </TabsTrigger>
            )
          })}
          <TabsTrigger value="controls" disabled={propertyButtons.length === 0} className="gap-1 @[38rem]:gap-1.5 px-2 @[38rem]:px-3">
            <SlidersHorizontal className="size-4" />
            <span className="hidden @[38rem]:inline">Controls</span>
            {propertyButtons.length > 0 && (
              <span className="text-[10px] text-muted-foreground ml-0.5 hidden @[38rem]:inline">({propertyButtons.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="presets" className="gap-1 @[38rem]:gap-1.5 px-2 @[38rem]:px-3">
            <Bookmark className="size-4" />
            <span className="hidden @[38rem]:inline">Presets</span>
            {presets.length > 0 && (
              <span className="text-[10px] text-muted-foreground ml-0.5 hidden @[38rem]:inline">({presets.length})</span>
            )}
          </TabsTrigger>
        </TabsList>

        {CATEGORY_ORDER.map((cat) => (
          <TabsContent key={cat} value={cat} className="flex-1 overflow-y-auto px-2 pb-2 mt-0">
            <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2 pt-2">
              {(effectsByCategory[cat] ?? []).map((effect) => (
                <EffectPadButton
                  key={effect.name}
                  effect={effect}
                  presence={getPresence(effect.name)}
                  onToggle={() => onToggle(effect)}
                  onLongPress={() => onLongPress(effect)}
                />
              ))}
            </div>
            {(effectsByCategory[cat]?.length ?? 0) === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No compatible {EFFECT_CATEGORY_INFO[cat]?.label.toLowerCase()} effects
              </div>
            )}
          </TabsContent>
        ))}

        <TabsContent value="controls" className="flex-1 overflow-y-auto px-2 pb-2 mt-0">
          {propertyButtons.length > 0 ? (
            <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2 pt-2">
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
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No settings or slider controls for the selected targets
            </div>
          )}
        </TabsContent>

        <TabsContent value="presets" className="flex-1 overflow-y-auto px-2 pb-2 mt-0">
          <PresetGrid
            presets={presets}
            onApplyPreset={onApplyPreset}
            getPresetPresence={getPresetPresence}
            currentProjectId={currentProjectId}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PresetGrid({
  presets,
  onApplyPreset,
  getPresetPresence,
  currentProjectId,
}: {
  presets: FxPreset[]
  onApplyPreset: (preset: FxPreset) => Promise<void>
  getPresetPresence: (preset: FxPreset) => EffectPresence
  currentProjectId: number | undefined
}) {
  const navigate = useNavigate()

  if (presets.length === 0) {
    return (
      <div className="py-8 text-center space-y-2">
        <Bookmark className="size-10 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No compatible presets for selected targets.</p>
        {currentProjectId && (
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => navigate(`/projects/${currentProjectId}/presets`)}
          >
            Manage presets →
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 pt-2">
      <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
        {presets.map((preset) => {
          const presence = getPresetPresence(preset)
          return (
            <button
              key={preset.id}
              onClick={() => onApplyPreset(preset)}
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
        })}
      </div>
      {currentProjectId && (
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
