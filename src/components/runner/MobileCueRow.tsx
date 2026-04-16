import { cn } from '@/lib/utils'
import { formatFadeText } from '@/lib/cueUtils'
import { cueStatusIcon } from './cueStatusIcon'

interface MobileCueRowProps {
  cueNumber: string | null
  name: string
  fadeDurationMs: number | null
  fadeCurve: string
  autoAdvance: boolean
  isActive: boolean
  isStandby: boolean
  isDone: boolean
  isTheatre: boolean
  fadeProgress: number
  autoProgress: number | null
  onClick: () => void
}

export function MobileCueRow({
  cueNumber,
  name,
  fadeDurationMs,
  fadeCurve,
  autoAdvance,
  isActive,
  isStandby,
  isDone,
  isTheatre,
  fadeProgress,
  autoProgress,
  onClick,
}: MobileCueRowProps) {
  const showFadeBar = isActive && fadeProgress > 0 && autoProgress == null
  const showAutoBar = isActive && autoProgress != null
  const statusIcon = cueStatusIcon(isActive, isStandby, isDone, autoProgress)
  const fadeText = formatFadeText(fadeDurationMs, fadeCurve)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex w-full items-center gap-2 h-12 px-4 border-b border-l-[3px] border-l-transparent text-left transition-colors hover:bg-muted/50',
        isDone && !isActive && !isStandby && 'opacity-40',
        isActive && 'border-l-green-500 bg-green-500/[0.08]',
        isStandby && !isActive && 'border-l-blue-500 bg-blue-500/[0.06]',
      )}
    >
      {/* Fade progress bar */}
      {showFadeBar && (
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-green-700 to-green-400 shadow-[0_0_8px_rgba(72,200,96,0.55)]"
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
        <div className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
          {cueNumber ? `Q${cueNumber}` : ''}
        </div>
      )}

      {/* Name */}
      <div
        className={cn(
          'flex-1 text-sm font-medium text-foreground truncate min-w-0',
          isActive && 'text-green-300 font-semibold',
          isStandby && !isActive && 'text-blue-300 font-semibold',
        )}
      >
        {name}
      </div>

      {/* Fade */}
      <div className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {fadeText}
      </div>

      {/* Auto indicator */}
      {autoAdvance && (
        <div
          className="size-1.5 rounded-full bg-blue-500 shrink-0"
          aria-label="auto-advance"
        />
      )}
    </button>
  )
}
