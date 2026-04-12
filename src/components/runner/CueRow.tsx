import { Check, Play, Circle, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatMs } from '@/lib/formatMs'

const CURVE_LABELS: Record<string, string> = {
  LINEAR: 'LIN',
  EASE_IN_OUT: 'SINE',
  SINE_IN_OUT: 'SINE',
  CUBIC_IN_OUT: 'CUB',
  EASE_IN: '\u2191',
  EASE_OUT: '\u2193',
}

interface CueRowProps {
  cueNumber: string | null
  name: string
  fadeDurationMs: number | null
  fadeCurve: string
  autoAdvance: boolean
  notes: string | null
  isActive: boolean
  isStandby: boolean
  isDone: boolean
  isEditing: boolean
  isTheatre: boolean
  fadeProgress: number
  autoProgress: number | null
  onClick: () => void
}

export function CueRow({
  cueNumber,
  name,
  fadeDurationMs,
  fadeCurve,
  autoAdvance,
  notes,
  isActive,
  isStandby,
  isDone,
  isEditing,
  isTheatre,
  fadeProgress,
  autoProgress,
  onClick,
}: CueRowProps) {
  const showFadeBar = isActive && fadeProgress > 0 && autoProgress == null
  const showAutoBar = isActive && autoProgress != null

  let statusIcon = null
  if (isDone) {
    statusIcon = <Check className="size-3 text-muted-foreground" />
  } else if (isActive && autoProgress != null) {
    statusIcon = <Circle className="size-2.5 fill-blue-500 text-blue-500 animate-pulse" />
  } else if (isActive) {
    statusIcon = <Play className="size-3.5 fill-amber-400 text-amber-400" />
  } else if (isStandby) {
    statusIcon = <Circle className="size-3 fill-green-500 text-green-500" />
  }

  const fadeText =
    fadeDurationMs != null && fadeDurationMs > 0
      ? `${formatMs(fadeDurationMs)} ${CURVE_LABELS[fadeCurve] ?? ''}`
      : 'SNAP'

  return (
    <div
      className={cn(
        'relative flex items-center h-10 px-4 border-b border-l-[3px] border-l-transparent cursor-pointer transition-colors overflow-hidden hover:bg-muted/50',
        isDone && 'opacity-40',
        isActive && 'border-l-amber-500 bg-amber-500/[0.055]',
        isStandby && !isActive && 'border-l-green-500 bg-green-500/[0.04]',
        isEditing && !isActive && 'border-l-blue-500 bg-blue-500/[0.05]',
      )}
      onClick={onClick}
    >
      {/* Fade progress bar */}
      {showFadeBar && (
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-amber-700 to-amber-400 shadow-[0_0_8px_rgba(240,160,48,0.55)]"
          style={{ width: `${(fadeProgress * 100).toFixed(2)}%` }}
        />
      )}
      {/* Auto-advance progress bar */}
      {showAutoBar && (
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-blue-700 to-blue-400 shadow-[0_0_8px_rgba(88,144,240,0.55)]"
          style={{ width: `${((autoProgress ?? 0) * 100).toFixed(2)}%` }}
        />
      )}

      {/* Status */}
      <div className="w-8 px-2 shrink-0 flex items-center justify-center">{statusIcon}</div>

      {/* Q-number (theatre only) */}
      {isTheatre && (
        <div className="w-14 px-2 shrink-0 font-mono text-xs text-muted-foreground">
          {cueNumber ? `Q${cueNumber}` : ''}
        </div>
      )}

      {/* Name */}
      <div
        className={cn(
          'flex-1 px-2 text-sm font-medium text-foreground truncate min-w-0',
          isActive && 'text-amber-300 font-semibold',
          isStandby && !isActive && 'text-green-400 font-semibold',
        )}
      >
        {name}
      </div>

      {/* Fade */}
      <div className="w-24 shrink-0 text-right font-mono text-xs text-muted-foreground px-2">
        {fadeText}
      </div>

      {/* Auto pill */}
      <div className="w-12 shrink-0 text-center px-2">
        {autoAdvance && (
          <Badge
            variant="outline"
            className="text-xs border-blue-500/30 text-blue-500 bg-blue-500/10 rounded-sm px-1.5 py-0"
          >
            Auto
          </Badge>
        )}
      </div>

      {/* Notes (theatre only) */}
      {isTheatre && (
        <div className="w-[200px] shrink-0 text-xs text-muted-foreground truncate border-l border-border px-2 italic">
          {notes ?? ''}
        </div>
      )}

      {/* Edit icon */}
      <div className="w-10 shrink-0 flex items-center justify-center">
        <Pencil
          className={cn(
            'size-3.5 text-muted-foreground/50 transition-colors',
            'group-hover:text-muted-foreground',
            isEditing && 'text-blue-500',
          )}
        />
      </div>
    </div>
  )
}
