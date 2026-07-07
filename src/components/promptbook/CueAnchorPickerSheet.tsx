import { Fragment, useMemo } from 'react'
import { Anchor } from 'lucide-react'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { CueAnchorDto } from '../../api/promptBooksApi'
import type { FlatCue } from '../../lib/promptBook/desync'
import { groupCuesByStack } from '../../lib/promptBook/geometry'

/**
 * Picks which cue the current text selection should anchor. Opened from the
 * floating selection toolbar's "Anchor cue" action. Cues are grouped by stack
 * (a prompt-book spans the whole show); already-anchored cues are marked so
 * picking one knowingly re-anchors it to the new selection.
 */
export function CueAnchorPickerSheet({
  open,
  cueOrder,
  anchorByCue,
  preselectCueId,
  onPick,
  onClose,
}: {
  open: boolean
  cueOrder: FlatCue[]
  anchorByCue: Map<number, CueAnchorDto>
  /** Cue to highlight as the likely pick (e.g. one armed from the rail); may be null. */
  preselectCueId: number | null
  onPick: (cueId: number) => void
  onClose: () => void
}) {
  const rows = useMemo(() => groupCuesByStack(cueOrder), [cueOrder])

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Anchor a cue to the selection</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-0.5 px-2">
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
              <Fragment key={row.cue.cueId}>
                <button
                  type="button"
                  onClick={() => onPick(row.cue.cueId)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left',
                    row.cue.cueId === preselectCueId
                      ? 'border-amber-500 bg-amber-400/10'
                      : 'border-transparent hover:bg-muted/40',
                  )}
                >
                  <span className="w-12 shrink-0 font-mono text-sm font-bold">{row.cue.label}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{row.cue.name}</span>
                  {anchorByCue.has(row.cue.cueId) ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-amber-600">
                      <Anchor className="size-3" />
                      re-anchor
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground/40">not anchored</span>
                  )}
                </button>
              </Fragment>
            ),
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
