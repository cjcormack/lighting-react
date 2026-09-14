import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CellEditorSurface } from './CellEditorSurface'
import { useCellEditorKeyboard } from './useCellEditorKeyboard'
import { useCellEditorOpen } from './useCellEditorOpen'
import type { SheetCellProps, SheetRow } from '../sheetModel'

/** A patched address as the cell holds it. */
export interface CellAddress {
  universe: number
  channel: number
  /** How many channels the head occupies from `channel`. */
  footprint: number
}

/** What the editor says a typed start would do to the batch. */
export interface AddressLanding {
  /** `Front PAR 1 → 1-007 · PAR 2 → 1-013 …` */
  summary: string
  /** A collision or an overflow, named; null when every head lands clear. */
  error: string | null
}

export interface AddressCellProps extends SheetCellProps<CellAddress> {
  /**
   * The landing for a typed start over the batch — computed by the column, which knows the other
   * heads on the universe. Called with the batch rows in visible order.
   */
  landing: (rows: readonly SheetRow[], startChannel: number) => AddressLanding
  /** Draws the ring and the info glyph: this head overlaps another, named. */
  clash?: string | null
}

export function formatAddress(universe: number, channel: number): string {
  return `${universe}-${String(channel).padStart(3, '0')}`
}

/**
 * The patch list's Address cell: `universe-channel`, edited as a start channel
 * (CLAUDE.md §Sheet kit).
 *
 * **Consecutive is the batch default.** Set over N addresses lands them consecutively by
 * footprint from the typed one, in visible-row order — every desk surveyed patches a range that
 * way (Eos, Hog, MA3's Edit Patch) and setting four fixtures to one address is never what was
 * meant. The editor says where each head lands and names a collision **before Apply**, and
 * refuses to apply over one: the patch PUT does not check overlap today (only the POST does), so
 * the refusal here is the one there is.
 *
 * The universe is drawn but not editable: the PUT cannot move a head to another universe, and a
 * field that took a number it could not send would be a lie. It commits on Apply or Enter, never
 * as it is typed — an address write rebuilds the fixture registry.
 */
export const AddressCell = memo(function AddressCell({
  value,
  label,
  batchCount,
  batchRows,
  disabled,
  autoOpen,
  autoClose,
  anchorAtButton,
  keyboardSeed,
  selectionEmpty,
  editorAnchorRef,
  onBeginEdit,
  onCommit,
  landing,
  clash,
}: AddressCellProps) {
  const [draft, setDraft] = useState(String(value.channel))
  const reset = useCallback(() => setDraft(String(value.channel)), [value.channel])
  const { isOpen, setOpen, keyboardOpen, atButton } = useCellEditorOpen({
    autoOpen,
    autoClose,
    anchorAtButton,
    keyboardSeed,
    disabled,
    selectionEmpty,
    onOpen: reset,
  })
  useEffect(() => {
    if (keyboardOpen && /^[0-9]$/.test(keyboardOpen)) setDraft(keyboardOpen)
  }, [keyboardOpen])

  const start = Number(draft)
  const validStart = Number.isInteger(start) && start >= 1 && start <= 512
  const plan = useMemo(
    () => (isOpen && validStart ? landing(batchRows(), start) : null),
    [batchRows, isOpen, landing, start, validStart],
  )
  const error = !validStart ? 'Start channel is 1–512' : plan?.error ?? null

  const commit = useCallback(() => {
    if (error) return false
    onCommit({ ...value, channel: start })
    return true
  }, [error, onCommit, start, value])

  const { contentRef, onKeyDown, onOpenAutoFocus } = useCellEditorKeyboard({
    onDone: () => {
      if (commit()) setOpen(false)
    },
  })

  return (
    <CellEditorSurface
      open={isOpen}
      onOpenChange={setOpen}
      title={label}
      contentClassName="w-80"
      onOpenAutoFocus={onOpenAutoFocus}
      triggerOpens={false}
      anchorRef={atButton ? editorAnchorRef : undefined}
      trigger={
        <button
          type="button"
          disabled={disabled}
          onClick={onBeginEdit}
          className="flex h-full w-full items-center rounded text-left hover:bg-accent/50"
        >
          <span className={cn('mx-1.5 truncate font-mono text-xs font-medium tabular-nums', clash && 'text-destructive')}>
            {formatAddress(value.universe, value.channel)}
          </span>
        </button>
      }
    >
      <div ref={contentRef} onKeyDown={onKeyDown} className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Universe</p>
            <Input type="text" aria-label="Universe" disabled className="h-8 w-16 tabular-nums" value={String(value.universe)} readOnly />
          </div>
          <span className="pb-2 font-mono text-muted-foreground">-</span>
          <div className="flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">Start channel</p>
            <Input
              type="number"
              min={1}
              max={512}
              step={1}
              aria-label="Start channel"
              className="h-8 w-24 tabular-nums"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Channels {validStart ? `${start}–${Math.min(512, start + value.footprint - 1)}` : '…'} on universe {value.universe}
        </p>
        {batchCount > 1 && (
          <p className="border-t pt-2 text-xs">
            Consecutive across the selection — each head lands after the previous one by its footprint.
          </p>
        )}
        {plan && (
          <p className={cn('text-xs tabular-nums', error ? 'text-destructive' : 'text-muted-foreground')}>
            {error ? `${plan.summary} · ${error}` : plan.summary}
          </p>
        )}
        {!plan && error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={error != null}
            onClick={() => {
              if (commit()) setOpen(false)
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </CellEditorSurface>
  )
})
