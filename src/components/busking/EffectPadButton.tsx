import { cn } from '@/lib/utils'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { EffectPresence } from './buskingTypes'
import { getEffectDescription } from '@/components/fixtures/fx/fxConstants'

interface EffectPadButtonProps {
  effect: EffectLibraryEntry
  presence: EffectPresence
  onToggle: () => void
  onLongPress: () => void
}

export function EffectPadButton({ effect, presence, onToggle, onLongPress }: EffectPadButtonProps) {
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  let didLongPress = false

  const handlePointerDown = () => {
    didLongPress = false
    pressTimer = setTimeout(() => {
      didLongPress = true
      if (presence !== 'none') {
        onLongPress()
      }
    }, 500)
  }

  const handlePointerUp = () => {
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
    if (!didLongPress) {
      onToggle()
    }
  }

  const handlePointerLeave = () => {
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
  }

  return (
    <button
      onPointerDown={handlePointerDown}
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
        {effect.name}
      </span>
      <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-1">
        {getEffectDescription(effect.name, effect.description)}
      </span>

      {/* Presence indicator dot */}
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
