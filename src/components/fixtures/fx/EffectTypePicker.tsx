import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getEffectDescription, EFFECT_CATEGORY_INFO } from './fxConstants'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

interface EffectTypePickerProps {
  category: string
  effects: EffectLibraryEntry[]
  onSelect: (effect: EffectLibraryEntry) => void
  onBack: () => void
}

export function EffectTypePicker({
  category,
  effects,
  onSelect,
  onBack,
}: EffectTypePickerProps) {
  const categoryInfo = EFFECT_CATEGORY_INFO[category]

  return (
    <div className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onBack}>
          <ChevronLeft className="size-4" />
        </Button>
        <h3 className="font-medium">{categoryInfo?.label ?? category} Effects</h3>
      </div>

      <div className="flex flex-col gap-1">
        {effects.map((effect) => (
          <button
            key={effect.name}
            onClick={() => onSelect(effect)}
            className="flex items-center gap-2 p-3 rounded-md border text-left hover:bg-accent/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{effect.name}</div>
              <div className="text-xs text-muted-foreground">
                {getEffectDescription(effect.name, effect.description)}
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
