import { useRef } from 'react'
import { cn } from '@/lib/utils'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { EffectPresence } from './buskingTypes'
import { getEffectDescription } from '@/components/fixtures/fx/fxConstants'

const MOVE_THRESHOLD = 10

interface EffectPadButtonProps {
  effect: EffectLibraryEntry
  presence: EffectPresence
  onToggle: () => void
  onLongPress: () => void
}

export function EffectPadButton({ effect, presence, onToggle, onLongPress }: EffectPadButtonProps) {
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
