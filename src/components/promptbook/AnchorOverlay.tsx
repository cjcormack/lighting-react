import type { PointerEvent } from 'react'
import { cn } from '@/lib/utils'
import type { CueAnchorDto, Rect } from '../../api/promptBooksApi'
import { MARKER_MARGIN_X, rectToStyle, verticalBounds } from '../../lib/promptBook/geometry'

/**
 * A cue's run status, driving the anchor's colour language (mirrors the Run view):
 * live=green, next=blue, standby=amber, done=grey. `next` is the cue armed to fire
 * on the next GO; everything after it that hasn't fired is `standby`.
 */
export type CueRunStatus = 'live' | 'next' | 'standby' | 'done'

/** Per-status treatment. Wash reads as a highlighter over the white PDF page. */
const statusStyles: Record<CueRunStatus, { band: string; wash: string; chip: string }> = {
  live: { band: 'bg-emerald-500', wash: 'bg-emerald-400/20', chip: 'bg-emerald-500 text-white' },
  next: { band: 'bg-sky-500', wash: 'bg-sky-400/20', chip: 'bg-sky-500 text-white' },
  standby: { band: 'bg-amber-500', wash: 'bg-amber-400/15', chip: 'bg-amber-500 text-white' },
  done: { band: 'bg-slate-400', wash: 'bg-slate-400/10', chip: 'bg-slate-500 text-white' },
}

/**
 * On-page highlighter wash over the cued line(s). Non-interactive — the drag
 * handle and label live in the margin (see {@link CueMarginMarker}).
 */
export function CueWash({
  rects,
  status,
  isLive,
}: {
  rects: Rect[]
  status: CueRunStatus
  isLive: boolean
}) {
  const s = statusStyles[status]
  return (
    <>
      {rects.map((rect, i) => (
        <div
          key={i}
          style={rectToStyle(rect)}
          className={cn(
            'rounded-sm',
            s.wash,
            isLive && 'shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_0_14px_rgba(16,185,129,0.3)]',
          )}
        />
      ))}
    </>
  )
}

/**
 * Cue marker in the page's left margin: a solid colour band the height of the
 * cued region, with the cue number chip beside it, sitting just left of the
 * text. This is the drag handle when unlocked; the live cue's chip pulses.
 * Assumes the script leaves a normal left margin for it to occupy.
 */
export function CueMarginMarker({
  anchor,
  rects,
  status,
  hasWarning,
  locked,
  dragging,
  onPointerDown,
}: {
  anchor: CueAnchorDto
  rects: Rect[]
  status: CueRunStatus
  hasWarning: boolean
  locked: boolean
  dragging: boolean
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void
}) {
  const { top, height } = verticalBounds(rects)
  const s = statusStyles[status]
  const isLive = status === 'live'
  return (
    <div
      data-anchor-cue={anchor.cueId}
      onPointerDown={onPointerDown}
      style={{
        top: `${top * 100}%`,
        height: `${Math.max(height * 100, 1.6)}%`,
        left: `${MARKER_MARGIN_X * 100}%`,
        transform: 'translateX(-100%)',
      }}
      className={cn(
        'absolute flex items-start justify-end',
        locked ? 'pointer-events-none' : 'pointer-events-auto cursor-grab',
        dragging && 'cursor-grabbing',
      )}
    >
      <span
        style={isLive ? { animation: 'r-live-pulse 1.6s ease-in-out infinite' } : undefined}
        className={cn(
          'mr-1 rounded px-1.5 py-px font-mono text-[10px] leading-tight font-bold whitespace-nowrap shadow-sm',
          hasWarning ? 'bg-red-500 text-white' : s.chip,
        )}
      >
        {anchor.label ?? `#${anchor.cueId}`}
        {hasWarning && ' ▲'}
      </span>
      <span
        className={cn(
          'h-full w-[3px] shrink-0 rounded-full',
          hasWarning ? 'bg-red-500' : s.band,
          isLive && 'shadow-[0_0_8px_rgba(16,185,129,0.6)]',
        )}
      />
    </div>
  )
}
