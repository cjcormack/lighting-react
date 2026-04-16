import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatFadeText } from '@/lib/cueUtils'
import { cueStatusIcon } from './cueStatusIcon'

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
  isTheatre: boolean
  fadeProgress: number
  autoProgress: number | null
  /** Row click — re-queue the cue as next, or open its detail sheet when it's already active. */
  onClick: () => void
  /** Eye-icon click — always opens the read-only detail sheet. */
  onView: () => void
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
  isTheatre,
  fadeProgress,
  autoProgress,
  onClick,
  onView,
}: CueRowProps) {
  const showFadeBar = isActive && fadeProgress > 0 && autoProgress == null
  const showAutoBar = isActive && autoProgress != null
  const statusIcon = cueStatusIcon(isActive, isStandby, isDone, autoProgress)
  const fadeText = formatFadeText(fadeDurationMs, fadeCurve)

  return (
    <div
      className={cn(
        'group relative flex items-center h-10 px-4 border-b border-l-[3px] border-l-transparent cursor-pointer transition-colors overflow-hidden hover:bg-muted/50',
        isDone && !isActive && !isStandby && 'opacity-40',
        isActive && 'border-l-green-500 bg-green-500/[0.08]',
        isStandby && !isActive && 'border-l-blue-500 bg-blue-500/[0.06]',
      )}
      onClick={onClick}
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
          isActive && 'text-green-300 font-semibold',
          isStandby && !isActive && 'text-blue-300 font-semibold',
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

      {/* View details — row click is reserved for re-queueing, so the eye
          button is the explicit way to inspect a cue without firing it. */}
      <div className="w-10 shrink-0 flex items-center justify-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onView()
          }}
          aria-label="View cue details"
          title="View cue details"
          className="size-6 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
        >
          <Eye className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
