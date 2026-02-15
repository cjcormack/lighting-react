import { Crosshair } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EFFECT_CATEGORY_INFO } from '@/components/fixtures/fx/fxConstants'
import { EffectPadButton } from './EffectPadButton'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { EffectPresence } from './buskingTypes'

const CATEGORY_ORDER = ['dimmer', 'colour', 'position'] as const

interface EffectPadProps {
  effectsByCategory: Record<string, EffectLibraryEntry[]>
  activeCategory: string
  onCategoryChange: (category: string) => void
  getPresence: (effectName: string) => EffectPresence
  onToggle: (effect: EffectLibraryEntry) => void
  onLongPress: (effect: EffectLibraryEntry) => void
  hasSelection: boolean
}

export function EffectPad({
  effectsByCategory,
  activeCategory,
  onCategoryChange,
  getPresence,
  onToggle,
  onLongPress,
  hasSelection,
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
    <Tabs value={activeCategory} onValueChange={onCategoryChange} className="flex flex-col h-full">
      <TabsList className="mx-2 mt-2 w-auto self-start">
        {CATEGORY_ORDER.map((cat) => {
          const info = EFFECT_CATEGORY_INFO[cat]
          if (!info) return null
          const Icon = info.icon
          const count = effectsByCategory[cat]?.length ?? 0
          return (
            <TabsTrigger key={cat} value={cat} disabled={count === 0} className="gap-1.5">
              <Icon className="size-4" />
              <span>{info.label}</span>
              {count > 0 && (
                <span className="text-[10px] text-muted-foreground ml-0.5">({count})</span>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>

      {CATEGORY_ORDER.map((cat) => (
        <TabsContent key={cat} value={cat} className="flex-1 overflow-y-auto px-2 pb-2 mt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-2">
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
    </Tabs>
  )
}
