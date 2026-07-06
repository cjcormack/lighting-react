import { Fragment, useMemo } from 'react'
import { Anchor, ChevronLeft, Play, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { CueAnchorDto } from '../../api/promptBooksApi'
import type { DesyncWarning, FlatCue } from '../../lib/promptBook/desync'
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
  goDisabled: boolean
  onGo: () => void
  onBack: () => void
}

/**
 * Right pane: the flattened show order with live/done/standby status, anchor
 * and warning tags, and the GO surface. Subscribes to upstream state — cue
 * rows never mutate the stack, only the prompt-book's own anchors.
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
  goDisabled,
  onGo,
  onBack,
}: CueStackPanelProps) {
  // Group rows under stack headers — a prompt-book spans the whole show.
  const rows = useMemo(() => {
    const out: Array<{ type: 'header'; stackId: number; stackName: string } | { type: 'cue'; cue: FlatCue }> = []
    let lastStackId: number | null = null
    for (const cue of cueOrder) {
      if (cue.stackId !== lastStackId) {
        out.push({ type: 'header', stackId: cue.stackId, stackName: cue.stackName })
        lastStackId = cue.stackId
      }
      out.push({ type: 'cue', cue })
    }
    return out
  }, [cueOrder])

  return (
    <div className="flex w-full max-w-[380px] min-w-[300px] flex-col border-l bg-muted/20">
      <div className="border-b px-4 py-3">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Cue stack</div>
      </div>

      {showWarnings && <DesyncWarningsPanel warnings={warnings} onWarningClick={onWarningClick} />}

      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2">
        {cueOrder.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            No cues in the show yet. Build the show in Program first.
          </p>
        )}
        {rows.map((row) => {
          if (row.type === 'header') {
            return (
              <div
                key={`h-${row.stackId}`}
                className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80"
              >
                {row.stackName}
              </div>
            )
          }
          const { cue } = row
          const status = statusOf(cue.cueId)
          const anchored = anchorByCue.has(cue.cueId)
          const cueWarnings = warningsByCue.get(cue.cueId) ?? []
          const isPlacing = placingCueId === cue.cueId
          return (
            <Fragment key={cue.cueId}>
              <button
                type="button"
                onClick={() => onCueClick(cue)}
                className={cn(
                  'group flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left',
                  status === 'live' && 'border-amber-400 bg-amber-400/10',
                  status !== 'live' && 'hover:bg-muted/40',
                  isPlacing && 'border-dashed border-amber-500 bg-amber-400/5',
                )}
              >
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    status === 'live' && 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]',
                    status === 'done' && 'bg-emerald-700/70',
                    status === 'pending' && 'bg-muted-foreground/40',
                  )}
                />
                <span
                  className={cn(
                    'w-14 shrink-0 text-[13px] font-bold',
                    status === 'live' ? 'text-amber-400' : 'text-foreground',
                  )}
                >
                  {cue.label}
                </span>
                <span
                  className={cn(
                    'flex-1 truncate text-xs',
                    status === 'done' ? 'text-muted-foreground/60' : 'text-muted-foreground',
                  )}
                >
                  {status === 'live' ? '▶ live' : status === 'done' ? 'done' : 'standby'}
                  {isPlacing && ' · click the script to place'}
                </span>
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
              </button>
            </Fragment>
          )
        })}
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
