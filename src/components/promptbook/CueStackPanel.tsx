import { Fragment, useMemo } from 'react'
import { Anchor, ChevronLeft, Pencil, Play, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatFadeText } from '@/lib/cueUtils'
import type { CueAnchorDto } from '../../api/promptBooksApi'
import type { DesyncWarning, FlatCue } from '../../lib/promptBook/desync'
import { groupCuesByStack, positionLabel } from '../../lib/promptBook/geometry'
import type { CueRunStatus } from './AnchorOverlay'
import { DesyncWarningsPanel } from './DesyncWarningsPanel'

interface CueStackPanelProps {
  cueOrder: FlatCue[]
  anchorByCue: Map<number, CueAnchorDto>
  statusOf: (cueId: number) => CueRunStatus
  warningsByCue: Map<number, DesyncWarning[]>
  warnings: DesyncWarning[]
  showWarnings: boolean
  locked: boolean
  /** Cue currently armed for click-to-place on the script. */
  placingCueId: number | null
  onCueClick: (cue: FlatCue) => void
  onRemoveAnchor: (cueId: number) => void
  onWarningClick: (warning: DesyncWarning) => void
  /** Arm a cue as the next GO (sets standby). */
  onSetStandby: (cueId: number) => void
  /** Jump to the cue's editor. */
  onEditCue: (cueId: number) => void
  goDisabled: boolean
  onGo: () => void
  onBack: () => void
  stackName: string | null
  bpm: number | null
  dbo: boolean
  onDbo: () => void
  /** Rendered inside the tablet/phone drawer — shows a close affordance, drops the border. */
  inDrawer?: boolean
  onClose?: () => void
}


/**
 * Right pane: the flattened show order as one list, with the live cue expanded
 * (green) and the next cue highlighted (blue). Clicking a row navigates to that
 * cue's anchor — it never fires a cue; a per-row Standby button arms the next GO.
 * Keeps the edit affordances (place / remove anchors, desync warnings) intact.
 */
export function CueStackPanel({
  cueOrder,
  anchorByCue,
  statusOf,
  warningsByCue,
  warnings,
  showWarnings,
  locked,
  placingCueId,
  onCueClick,
  onRemoveAnchor,
  onWarningClick,
  onSetStandby,
  onEditCue,
  goDisabled,
  onGo,
  onBack,
  stackName,
  bpm,
  dbo,
  onDbo,
  inDrawer,
  onClose,
}: CueStackPanelProps) {
  // Group rows under stack headers — a prompt-book spans the whole show.
  const rows = useMemo(() => groupCuesByStack(cueOrder), [cueOrder])

  // Shared right-edge affordances: warning marker + anchor place / remove.
  const anchorControls = (cue: FlatCue) => {
    const anchored = anchorByCue.has(cue.cueId)
    const cueWarnings = warningsByCue.get(cue.cueId) ?? []
    const isPlacing = placingCueId === cue.cueId
    return (
      <>
        {cueWarnings.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <TriangleAlert className="size-3.5 shrink-0 text-red-500" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-64">
              {cueWarnings.map((w, i) => (
                <p key={i}>{w.message}</p>
              ))}
            </TooltipContent>
          </Tooltip>
        )}
        {!anchored ? (
          <span
            className={cn(
              'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold',
              locked
                ? 'border-red-500/40 text-red-500/90'
                : 'border-amber-500/60 text-amber-500 group-hover:bg-amber-400/10',
            )}
          >
            {locked ? 'no anchor' : isPlacing ? 'placing…' : 'place anchor'}
          </span>
        ) : (
          <>
            <Anchor className="size-3 shrink-0 text-muted-foreground/50" />
            {!locked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveAnchor(cue.cueId)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        onRemoveAnchor(cue.cueId)
                      }
                    }}
                    aria-label={`Remove anchor for ${cue.label}`}
                    className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-red-500/15 hover:text-red-500 group-hover:block"
                  >
                    <X className="size-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">Remove anchor</TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </>
    )
  }

  const renderCue = (cue: FlatCue) => {
    const status = statusOf(cue.cueId)
    const anchor = anchorByCue.get(cue.cueId)

    if (status === 'live') {
      return (
        <div
          key={cue.cueId}
          className="my-1 overflow-hidden rounded-lg border border-emerald-600/60 bg-emerald-950/30"
        >
          <div className="flex items-center gap-2 border-b border-emerald-800/50 bg-emerald-950/40 px-3 py-1.5">
            <span
              className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]"
              style={{ animation: 'r-fade-pulse 1.6s ease-in-out infinite' }}
            />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              Now playing
            </span>
            <span className="flex-1" />
            {(warningsByCue.get(cue.cueId)?.length ?? 0) > 0 && (
              <TriangleAlert className="size-3.5 text-red-500" />
            )}
          </div>
          <button
            type="button"
            onClick={() => onCueClick(cue)}
            className="flex w-full items-baseline gap-3 px-3 pt-2.5 text-left"
          >
            <span className="font-mono text-4xl leading-none font-extrabold text-emerald-400">
              {cue.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{cue.name}</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 pt-1.5 text-xs">
            {anchor ? (
              <>
                <Anchor className="size-3 shrink-0 text-emerald-500" />
                <span className="truncate text-emerald-200/80 italic">{positionLabel(anchor.region)}</span>
              </>
            ) : (
              <span className="text-muted-foreground italic">Not anchored to the script</span>
            )}
          </div>
          <div className="flex items-center gap-2 px-3 pt-1.5 pb-2.5 text-xs text-muted-foreground">
            <span className="font-mono">{formatFadeText(cue.fadeMs, cue.fadeCurve)}</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEditCue(cue.cueId)
              }}
              className="inline-flex items-center gap-1 font-medium text-sky-400 hover:underline"
            >
              <Pencil className="size-3" />
              Edit cue
            </button>
          </div>
        </div>
      )
    }

    const isNext = status === 'next'
    const isDone = status === 'done'
    return (
      <button
        key={cue.cueId}
        type="button"
        onClick={() => onCueClick(cue)}
        className={cn(
          'group my-0.5 flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left',
          isNext ? 'border-sky-600/60 bg-sky-950/30' : 'border-transparent hover:bg-muted/40',
          placingCueId === cue.cueId && 'border-dashed border-amber-500 bg-amber-400/5',
        )}
      >
        {isNext ? (
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
            isNext ? 'text-sky-300' : isDone ? 'text-muted-foreground/60' : 'text-foreground',
          )}
        >
          {cue.label}
        </span>
        <span
          className={cn(
            'flex-1 truncate text-xs',
            isDone ? 'text-muted-foreground/50' : isNext ? 'text-sky-200/70' : 'text-muted-foreground',
          )}
        >
          {cue.name}
        </span>
        {status === 'standby' && !goDisabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onSetStandby(cue.cueId)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                onSetStandby(cue.cueId)
              }
            }}
            aria-label={`Set ${cue.label} as the next cue`}
            className="shrink-0 rounded border border-sky-600/50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400 hover:bg-sky-500/15"
          >
            Standby
          </span>
        )}
        {anchorControls(cue)}
      </button>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-col bg-muted/20',
        inDrawer ? '' : 'max-w-[380px] min-w-[300px] border-l',
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#22c55e]" />
        <span className="truncate text-[13px] font-medium">{stackName ?? 'Cue stack'}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onDbo}
          aria-pressed={dbo}
          title="Toggle blackout"
          className={cn(
            'rounded-md border px-2 py-1 font-mono text-[10px] font-bold tracking-wide',
            dbo
              ? 'border-red-700 bg-red-950/40 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.25)]'
              : 'bg-card text-muted-foreground hover:bg-muted/40',
          )}
        >
          DBO
        </button>
        <span className="rounded-md border bg-card px-2 py-1 font-mono text-[10px] font-bold text-muted-foreground">
          {bpm ?? '—'}
        </span>
        {inDrawer && onClose && (
          <Button variant="ghost" size="icon" className="size-7" aria-label="Close cues" onClick={onClose}>
            <X className="size-4" />
          </Button>
        )}
      </div>

      {showWarnings && <DesyncWarningsPanel warnings={warnings} onWarningClick={onWarningClick} />}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {cueOrder.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            No cues in the show yet. Build the show in Program first.
          </p>
        )}
        {rows.map((row) =>
          row.type === 'header' ? (
            <div
              key={`h-${row.stackId}`}
              className="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase"
            >
              {row.stackName}
            </div>
          ) : (
            <Fragment key={row.cue.cueId}>{renderCue(row.cue)}</Fragment>
          ),
        )}
      </div>

      <div className="flex gap-2 border-t p-3">
        <Button variant="outline" onClick={onBack} disabled={goDisabled} className="w-24">
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button
          onClick={onGo}
          disabled={goDisabled}
          className="h-12 flex-1 bg-amber-500 text-base font-extrabold tracking-wide text-amber-950 hover:bg-amber-400"
        >
          <Play className="size-5" />
          GO
        </Button>
      </div>
    </div>
  )
}
