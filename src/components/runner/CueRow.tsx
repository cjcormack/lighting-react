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
    statusIcon = <Check className="size-3 text-muted-foreground/30" />
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
        'relative flex items-center h-9 px-0 pl-4 border-l-[3px] border-transparent cursor-pointer transition-colors overflow-hidden hover:bg-muted/20',
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
      <div className="w-5 shrink-0 flex items-center justify-center">{statusIcon}</div>

      {/* Q-number (theatre only) */}
      {isTheatre && (
        <div className="w-12 shrink-0 font-mono text-[11px] font-semibold text-muted-foreground/30 pr-1">
          {cueNumber ? `Q${cueNumber}` : ''}
        </div>
      )}

      {/* Name */}
      <div
        className={cn(
          'flex-1 text-sm font-medium text-muted-foreground/60 truncate min-w-0 tracking-wide',
          isActive && 'text-amber-300 font-semibold',
          isStandby && !isActive && 'text-green-400 font-semibold',
        )}
      >
        {name}
      </div>

      {/* Fade */}
      <div className="w-[86px] shrink-0 text-right font-mono text-[11px] text-muted-foreground/25 pr-2">
        {fadeText}
      </div>

      {/* Auto pill */}
      <div className="w-9 shrink-0 text-center">
        {autoAdvance && (
          <Badge
            variant="outline"
            className="text-[9px] font-bold tracking-wider border-blue-500/20 text-blue-500/70 bg-blue-500/10 rounded-sm px-1.5 py-0"
          >
            AUTO
          </Badge>
        )}
      </div>

      {/* Notes (theatre only) */}
      {isTheatre && (
        <div className="w-[200px] shrink-0 text-[11px] text-muted-foreground/25 truncate border-l border-border/30 px-3 italic">
          {notes ?? ''}
        </div>
      )}

      {/* Edit icon */}
      <div className="w-[30px] shrink-0 flex items-center justify-center">
        <Pencil
          className={cn(
            'size-3.5 text-muted-foreground/10 transition-colors',
            'group-hover:text-muted-foreground/30',
            isEditing && 'text-blue-500',
          )}
        />
      </div>
    </div>
  )
}
