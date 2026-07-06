import type { CSSProperties, PointerEvent } from 'react'
import { cn } from '@/lib/utils'
import type { CueAnchorDto, Rect } from '../../api/promptBooksApi'
import { rectToStyle } from '../../lib/promptBook/geometry'

export type CueRunStatus = 'live' | 'done' | 'pending'

interface AnchorOverlayProps {
  anchor: CueAnchorDto
  /** Rects of this anchor's region that sit on the rendered page. */
  rects: Rect[]
  status: CueRunStatus
  hasWarning: boolean
  locked: boolean
  /** True while this anchor is the one being dragged. */
  dragging: boolean
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void
}

const statusText: Record<CueRunStatus, string> = {
  live: 'text-amber-400',
  done: 'text-emerald-600/70',
  pending: 'text-muted-foreground/70',
}

const statusBorder: Record<CueRunStatus, string> = {
  live: 'border-l-amber-400',
  done: 'border-l-emerald-700/60',
  pending: 'border-l-muted-foreground/50',
}

/**
 * One cue anchor on a script page: a left-ruled band per rect, with the cue
 * label in the margin of the first rect. The live cue gets the one saturated
 * colour in the view; everything else stays quiet so it's unmistakable.
 */
export function AnchorOverlay({
  anchor,
  rects,
  status,
  hasWarning,
  locked,
  dragging,
  onPointerDown,
}: AnchorOverlayProps) {
  return (
    <>
      {rects.map((rect, i) => {
        const style: CSSProperties = rectToStyle(rect)
        return (
          <div
            key={`${anchor.cueId}-${rect.page}-${i}`}
            style={style}
            data-anchor-cue={anchor.cueId}
            onPointerDown={onPointerDown}
            className={cn(
              'rounded-sm border-l-[3px] transition-shadow',
              statusBorder[status],
              hasWarning && 'border-l-red-500',
              status === 'live' && 'bg-amber-400/15 shadow-[0_0_0_1px_rgba(251,191,36,0.4),0_0_14px_rgba(251,191,36,0.2)]',
              locked
                ? 'pointer-events-none'
                : 'pointer-events-auto cursor-grab hover:bg-amber-400/10 hover:shadow-[0_0_0_1px_rgba(251,191,36,0.3)]',
              dragging && 'cursor-grabbing bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.5)]',
            )}
          >
            {i === 0 && (
              <span
                className={cn(
                  'absolute -left-2 top-1/2 -translate-x-full -translate-y-1/2 select-none',
                  'text-[10px] font-bold tracking-wide whitespace-nowrap',
                  statusText[status],
                )}
              >
                {anchor.label ?? `#${anchor.cueId}`}
                {hasWarning && <span className="text-red-500"> ▲</span>}
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}
