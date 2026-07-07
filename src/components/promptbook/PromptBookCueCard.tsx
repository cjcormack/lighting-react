import { Anchor, ChevronRight, Pencil, TriangleAlert, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { positionLabel } from '@/lib/promptBook/geometry'
import { CueCardBody, type CueCardKind, type ExpansionMode } from '@/components/runner/run/CueCardBody'
import type { CueAnchorDto } from '@/api/promptBooksApi'
import type { CueStackCueEntry } from '@/api/cueStacksApi'
import type { DesyncWarning, FlatCue } from '@/lib/promptBook/desync'
import type { CueRunStatus } from './AnchorOverlay'

interface PromptBookCueCardProps {
  cue: FlatCue
  status: CueRunStatus
  anchor: CueAnchorDto | undefined
  /** The full stack entry (palette/notes/auto), for the expanded card. */
  cueEntry: CueStackCueEntry | undefined
  projectId: number
  warnings: DesyncWarning[]
  locked: boolean
  /** This cue is armed for click-to-place on the script. */
  placing: boolean
  expanded: boolean
  /** Stage / Details mode for this card, owned by the page so it can persist across
   *  cue changes (live cue carries the last-used view). null = neither selected. */
  mode: ExpansionMode | null
  onModeChange: (mode: ExpansionMode | null) => void
  /** cur-only: 0..1 fade-in progress, drives the amber fade bar/badge. */
  fadeProgress: number | null
  fadeRemainMs: number | null
  /** Show active + editable — enables the "Set next" affordance. */
  canSetNext: boolean
  /** Primary action: scroll the book to this cue's anchor. */
  onCueClick: () => void
  onToggleExpanded: () => void
  onSetStandby: () => void
  onRemoveAnchor: () => void
  onEditCue: () => void
}

const STATUS_KIND: Record<CueRunStatus, CueCardKind> = {
  live: 'cur',
  next: 'nxt',
  standby: 'other',
  done: 'other',
}

/**
 * One cue in the Prompt Book rail. Collapsed it is a compact status row (the rail's
 * long-standing look); expanded it is the shared Run card (`CueCardBody`) — green live,
 * blue next, blue "other". The primary click always scrolls the book to the cue; a small
 * "Set next" arms it as the next GO, and the anchor place/remove + desync warning
 * affordances ride along. There is no "Change" button.
 */
export function PromptBookCueCard({
  cue,
  status,
  anchor,
  cueEntry,
  projectId,
  warnings,
  locked,
  placing,
  expanded,
  mode,
  onModeChange,
  fadeProgress,
  fadeRemainMs,
  canSetNext,
  onCueClick,
  onToggleExpanded,
  onSetStandby,
  onRemoveAnchor,
  onEditCue,
}: PromptBookCueCardProps) {
  const anchored = anchor != null
  const showSetNext = canSetNext && status !== 'live' && status !== 'next'

  const warningTriangle =
    warnings.length > 0 ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <TriangleAlert className="size-3.5 shrink-0 text-red-500" />
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-64">
          {warnings.map((w, i) => (
            <p key={i}>{w.message}</p>
          ))}
        </TooltipContent>
      </Tooltip>
    ) : null

  const anchorAffordance = !anchored ? (
    <span
      className={cn(
        'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold',
        locked
          ? 'border-red-500/40 text-red-500/90'
          : 'border-amber-500/60 text-amber-500 group-hover:bg-amber-400/10',
      )}
    >
      {locked ? 'no anchor' : placing ? 'placing…' : 'place anchor'}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1">
      <Anchor className="size-3 text-muted-foreground/50" />
      {!locked && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onRemoveAnchor()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  onRemoveAnchor()
                }
              }}
              aria-label={`Remove anchor for ${cue.label}`}
              className="rounded p-0.5 text-muted-foreground hover:bg-red-500/15 hover:text-red-500"
            >
              <X className="size-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">Remove anchor</TooltipContent>
        </Tooltip>
      )}
    </span>
  )

  const chevron = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggleExpanded()
      }}
      aria-label={expanded ? `Collapse ${cue.label}` : `Expand ${cue.label}`}
      aria-expanded={expanded}
      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
    >
      <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} />
    </button>
  )

  const setNextButton = showSetNext ? (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        onSetStandby()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation()
          onSetStandby()
        }
      }}
      aria-label={`Set ${cue.label} as the next cue`}
      className="shrink-0 rounded border border-sky-600/50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400 hover:bg-sky-500/15"
    >
      Set next
    </span>
  ) : null

  if (expanded) {
    return (
      <div className="my-1">
        <CueCardBody
          kind={STATUS_KIND[status]}
          cue={cueEntry ?? null}
          projectId={projectId}
          mode={mode}
          onModeChange={onModeChange}
          location={anchored ? positionLabel(anchor.region) : 'Not anchored to the script'}
          headerLabel={cue.label}
          fadeProgress={fadeProgress}
          fadeRemainMs={fadeRemainMs}
          onBodyClick={onCueClick}
          headerTrailing={
            <>
              {warningTriangle}
              {chevron}
            </>
          }
          footer={
            <div className="flex items-center gap-2 px-3 pt-0.5 pb-3 text-xs">
              {anchorAffordance}
              <span className="flex-1" />
              {setNextButton}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditCue()
                }}
                className="inline-flex items-center gap-1 font-medium text-sky-400 hover:underline"
              >
                <Pencil className="size-3" />
                Edit cue
              </button>
            </div>
          }
        />
      </div>
    )
  }

  // ── Collapsed row ──
  const isLive = status === 'live'
  const isNext = status === 'next'
  const isDone = status === 'done'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onCueClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onCueClick()
      }}
      className={cn(
        'group my-0.5 flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left',
        isLive
          ? 'border-emerald-600/50 bg-emerald-950/20'
          : isNext
            ? 'border-sky-600/60 bg-sky-950/30'
            : 'border-transparent hover:bg-muted/40',
        placing && 'border-dashed border-amber-500 bg-amber-400/5',
      )}
    >
      {isLive ? (
        <span
          className="size-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]"
          style={{ animation: 'r-fade-pulse 1.6s ease-in-out infinite' }}
        />
      ) : isNext ? (
        <span className="shrink-0 rounded border border-sky-700 bg-sky-500/20 px-1 py-px font-mono text-[9px] font-bold tracking-wide text-sky-300">
          NEXT
        </span>
      ) : (
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            isDone ? 'bg-slate-500/50' : 'bg-amber-500/70',
          )}
        />
      )}
      <span
        className={cn(
          'w-12 shrink-0 text-[13px] font-bold',
          isLive
            ? 'text-emerald-300'
            : isNext
              ? 'text-sky-300'
              : isDone
                ? 'text-muted-foreground/60'
                : 'text-foreground',
        )}
      >
        {cue.label}
      </span>
      <span
        className={cn(
          'flex-1 truncate text-xs',
          isLive
            ? 'text-emerald-100/80'
            : isNext
              ? 'text-sky-200/70'
              : isDone
                ? 'text-muted-foreground/50'
                : 'text-muted-foreground',
        )}
      >
        {cue.name}
      </span>
      {setNextButton}
      {warningTriangle}
      {anchorAffordance}
      {chevron}
    </div>
  )
}
