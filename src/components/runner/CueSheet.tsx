import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AudioWaveform, Layers, Lock, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePatchProjectCueMutation } from '@/store/cues'
import { ignoreReportedError } from '@/store/errorToastMiddleware'
import { formatFadeDuration, parseFadeDuration } from '@/lib/cueUtils'
import { formatMs } from '@/lib/formatMs'
import { AUTO_CUE_NUMBER_CLASS } from '@/lib/cueNumber'
import { InlineEditField } from '@/components/InlineEditField'
import { TruncateStart } from '@/components/TruncateStart'
import { CueStatePip } from '@/components/cues/CueRowParts'
import { CellSelectionActions } from '@/components/sheet/CellSelectionActions'
import { FanPopover, type FanPlan } from '@/components/sheet/FanPopover'
import { SelectionBar } from '@/components/sheet/SelectionBar'
import { SheetTable } from '@/components/sheet/SheetTable'
import { useSheet } from '@/components/sheet/useSheet'
import { OptionCell, type SheetOption } from '@/components/sheet/cells/OptionCell'
import { TextCell } from '@/components/sheet/cells/TextCell'
import { PHONE_FOLDED_CLASS, WORD_CLASS } from '@/components/sheet/toolbarFolds'
import type { SheetColumn, SheetRow } from '@/components/sheet/sheetModel'
import type { CueStack, CueStackCueEntry } from '@/api/cueStacksApi'

export type CueColumnKey = 'name' | 'fade' | 'curve' | 'follow' | 'book' | 'layers' | 'fx' | 'notes'

/** One cue of the stack; a marker is a divider row. */
export interface CueSheetRow extends SheetRow {
  cue: CueStackCueEntry
}

export function cueRowId(cueId: number): string {
  return `cue:${cueId}`
}

/** The curve vocabulary `CuePropsPane`'s select offers, in its order. */
const CURVE_OPTIONS: SheetOption[] = [
  { value: 'LINEAR', label: 'Linear' },
  { value: 'SINE_IN_OUT', label: 'Sine In/Out' },
  { value: 'CUBIC_IN_OUT', label: 'Cubic In/Out' },
  { value: 'EASE_IN', label: 'Ease In' },
  { value: 'EASE_OUT', label: 'Ease Out' },
  { value: 'EASE_IN_OUT', label: 'Ease In/Out' },
]

/** The lock's reason, said once — the verbs' titles and the bar's strip read it. */
const LOCKED_REASON = 'Locked — cells are read-only · L to edit'

export interface CueSheetProps {
  stack: CueStack
  projectId: number
  activeCueId: number | null
  standbyCueId?: number | null
  completedCueIds?: number[]
  locationByCue?: Map<number, string>
  /** Arm a cue as the next GO. Absent where there is no transport, or off the playhead's stack. */
  onSetStandby?: (cueId: number) => void
  /** The show-editing lock — this sheet's read-only scope. */
  locked?: boolean
  /**
   * The cue named in the URL — `?cue=`, the external contract the Prompt Book mints. The cards
   * expand it; the sheet selects its row and scrolls to it, which is what "opened" means on a
   * sheet. Consumed on arrival and whenever it changes.
   */
  openedCueId?: number | null
  /** Open a cue's card on the cards view — Book, Layers and FX are read-outs that do this. */
  onOpenCue: (cueId: number) => void
}

/**
 * The cue sheet — one row per cue, a marker as a divider row, on the sheet kit
 * (CLAUDE.md §Sheet kit). Name · Fade · Curve · Follow · Notes are cells; the cue number keeps its
 * inline edit on the Cue column; Book · Layers · FX are read-outs that open the card. Live row
 * green, next row blue, as the cards.
 *
 * **The lock is this sheet's read-only scope**, the way Output scope is the programmer's. Locked,
 * every value cell is inert — `pointer-events-none` on the wrapper, `disabled` on the trigger,
 * the keyboard refused through the permission, Set · Clear · Fan disabled with the reason — the
 * marquee still works, and a click on the Cue column arms the cue as next, exactly as a card
 * click does. Unlocked, cells edit under the amber wash the chrome above already wears. GO, BACK,
 * Space and ⌫ are untouched: `useTransportKeys` is the page's, enabled exactly while locked as it
 * always was, and `canOperate` is never handed `locked` (CLAUDE.md §The show-editing lock).
 *
 * **A commit reaches only the columns of its own kind.** Name, Fade, Curve, Follow and Notes all
 * take a string, so the kit's shape test cannot tell a fade from a follow delay; each declares its
 * own `kind`, and a `3s` typed into Fade over a Fade→Follow→Notes marquee sets three fades and
 * nothing else — `CueSheet.test.tsx` pins it.
 *
 * Writes are one PATCH per cue carrying the field — the same auto-saving contract the cards'
 * inline fields keep. Fan on Fade spreads first→last with a Spread control (Linear, the one
 * spread there is).
 *
 * No Hooks column: `CueStackCueEntry` carries no trigger count, and adding one is a backend field.
 */
export function CueSheet({
  stack,
  projectId,
  activeCueId,
  standbyCueId,
  completedCueIds,
  locationByCue,
  onSetStandby,
  locked = false,
  openedCueId,
  onOpenCue,
}: CueSheetProps) {
  const [patchCue] = usePatchProjectCueMutation()
  const patch = useCallback(
    (cueId: number, body: Record<string, unknown>) => {
      patchCue({ projectId, cueId, ...body }).unwrap().catch(ignoreReportedError)
    },
    [patchCue, projectId],
  )

  const rows = useMemo<CueSheetRow[]>(
    () =>
      stack.cues.map((cue) =>
        cue.cueType === 'MARKER' ? { id: cueRowId(cue.id), cue, divider: cue.name } : { id: cueRowId(cue.id), cue },
      ),
    [stack.cues],
  )
  const completedSet = useMemo(() => new Set(completedCueIds), [completedCueIds])

  const columns = useMemo<SheetColumn<CueSheetRow, CueColumnKey>[]>(
    () => [
      {
        key: 'name',
        label: 'Name',
        kind: 'name',
        width: 'minmax(200px, 1fr)',
        value: (row) => row.cue.name,
        cell: (row, props) => {
          const active = row.cue.id === activeCueId
          const standby = row.cue.id === standbyCueId && !active
          return (
            <TextCell
              {...(props as React.ComponentProps<typeof TextCell>)}
              face={
                <span
                  className={cn(
                    'mx-1.5 truncate text-sm',
                    active ? 'font-semibold text-green-300' : standby ? 'font-semibold text-blue-300' : 'font-medium',
                  )}
                >
                  {row.cue.name}
                </span>
              }
            />
          )
        },
        write: (batch, value) => {
          if (typeof value !== 'string' || value.trim() === '') return false
          for (const row of batch) if (value !== row.cue.name) patch(row.cue.id, { name: value })
          return true
        },
        clearRefusal: 'A cue has a name — it cannot be blank',
      },
      {
        key: 'fade',
        label: 'Fade',
        kind: 'fade',
        width: '88px',
        value: (row) => formatFadeDuration(row.cue.fadeDurationMs),
        cell: (row, props) => (
          <TextCell
            {...(props as React.ComponentProps<typeof TextCell>)}
            mono
            allowEmpty
            placeholder="2s"
            face={
              <span className="mx-1.5 font-mono text-xs font-medium tabular-nums">
                {formatFadeDuration(row.cue.fadeDurationMs) || 'SNAP'}
              </span>
            }
            validate={(draft) =>
              parseFadeDuration(draft) === undefined ? 'A fade is seconds, or a number with ms, s or m — or SNAP' : null
            }
          />
        ),
        write: (batch, value) => {
          if (typeof value !== 'string') return false
          const parsed = parseFadeDuration(value)
          if (parsed === undefined) return false
          for (const row of batch) if (parsed !== (row.cue.fadeDurationMs ?? null)) patch(row.cue.id, { fadeDurationMs: parsed })
          return true
        },
        clear: (batch) => {
          for (const row of batch) if (row.cue.fadeDurationMs != null) patch(row.cue.id, { fadeDurationMs: null })
        },
        fan: (batch): FanPlan | null =>
          batch.length === 0
            ? null
            : {
                kind: 'duration',
                col: 'fade',
                label: 'Fade',
                count: batch.length,
                names: batch.map((row) => `Q${row.cue.cueNumber ?? '—'}`),
                apply: (ms) => {
                  batch.forEach((row, i) => {
                    const next = ms[i] > 0 ? ms[i] : null
                    if (next !== (row.cue.fadeDurationMs ?? null)) patch(row.cue.id, { fadeDurationMs: next })
                  })
                },
              },
      },
      {
        key: 'curve',
        label: 'Curve',
        kind: 'curve',
        width: '118px',
        value: (row) => (row.cue.fadeDurationMs != null && row.cue.fadeDurationMs > 0 ? row.cue.fadeCurve : undefined),
        cell: (_row, props) => (
          <OptionCell {...(props as React.ComponentProps<typeof OptionCell>)} options={CURVE_OPTIONS} />
        ),
        display: () => <span className="mx-1.5 text-xs text-muted-foreground/60">—</span>,
        write: (batch, value) => {
          if (typeof value !== 'string' || !CURVE_OPTIONS.some((o) => o.value === value)) return false
          for (const row of batch) if (value !== row.cue.fadeCurve) patch(row.cue.id, { fadeCurve: value })
          return true
        },
        clearRefusal: 'A fade has a curve — pick one',
      },
      {
        key: 'follow',
        label: 'Follow',
        kind: 'follow',
        width: '96px',
        value: (row) => (row.cue.autoAdvance ? formatMs(row.cue.autoAdvanceDelayMs ?? 0) : ''),
        cell: (row, props) => (
          <TextCell
            {...(props as React.ComponentProps<typeof TextCell>)}
            mono
            allowEmpty
            placeholder="2s"
            face={
              row.cue.autoAdvance ? (
                <span className="mx-1.5 inline-flex items-center gap-1 text-xs">
                  <span className="text-[9px] uppercase tracking-wide text-blue-500">auto</span>
                  <span className="font-mono tabular-nums">{formatMs(row.cue.autoAdvanceDelayMs ?? 0)}</span>
                </span>
              ) : (
                <span className="mx-1.5 text-xs text-muted-foreground/60">—</span>
              )
            }
            validate={(draft) =>
              parseFadeDuration(draft) === undefined ? 'A follow is a delay in seconds, or blank for none' : null
            }
          />
        ),
        write: (batch, value) => {
          if (typeof value !== 'string') return false
          const parsed = parseFadeDuration(value)
          if (parsed === undefined) return false
          for (const row of batch) {
            if (parsed === null) {
              if (row.cue.autoAdvance) patch(row.cue.id, { autoAdvance: false })
            } else if (!row.cue.autoAdvance || parsed !== row.cue.autoAdvanceDelayMs) {
              patch(row.cue.id, { autoAdvance: true, autoAdvanceDelayMs: parsed })
            }
          }
          return true
        },
        clear: (batch) => {
          for (const row of batch) if (row.cue.autoAdvance) patch(row.cue.id, { autoAdvance: false })
        },
      },
      {
        key: 'book',
        label: 'Book',
        width: '76px',
        value: () => undefined,
        display: (row) => {
          const location = locationByCue?.get(row.cue.id)
          return location ? (
            <ReadOut onClick={() => onOpenCue(row.cue.id)} title="Open the cue's card">
              <span className="font-mono text-[11px]">{location}</span>
            </ReadOut>
          ) : (
            <span className="mx-1.5 text-xs text-muted-foreground/60">—</span>
          )
        },
      },
      {
        key: 'layers',
        label: 'Layers',
        width: '76px',
        value: () => undefined,
        display: (row) =>
          row.cue.layerCount > 0 ? (
            <ReadOut onClick={() => onOpenCue(row.cue.id)} title="Open the cue's card">
              <CountBadge n={row.cue.layerCount} />
              <Layers className="size-3" />
            </ReadOut>
          ) : (
            <span className="mx-1.5 text-xs text-muted-foreground/60">—</span>
          ),
      },
      {
        key: 'fx',
        label: 'FX',
        width: '56px',
        value: () => undefined,
        display: (row) =>
          row.cue.adHocEffectCount > 0 ? (
            <ReadOut onClick={() => onOpenCue(row.cue.id)} title="Open the cue's card" className="text-violet-400">
              <CountBadge n={row.cue.adHocEffectCount} className="border-violet-400/60" />
              <AudioWaveform className="size-3" />
            </ReadOut>
          ) : (
            <span className="mx-1.5 text-xs text-muted-foreground/60">—</span>
          ),
      },
      {
        key: 'notes',
        label: 'Notes',
        kind: 'notes',
        width: 'minmax(200px, 1fr)',
        value: (row) => row.cue.notes ?? '',
        cell: (row, props) => (
          <TextCell
            {...(props as React.ComponentProps<typeof TextCell>)}
            allowEmpty
            face={
              row.cue.notes ? (
                <span className="mx-1.5 truncate text-xs text-muted-foreground">{row.cue.notes}</span>
              ) : (
                <span className="mx-1.5 text-xs text-muted-foreground/60">—</span>
              )
            }
          />
        ),
        write: (batch, value) => {
          if (typeof value !== 'string') return false
          const next = value.trim() === '' ? null : value
          for (const row of batch) if (next !== (row.cue.notes ?? null)) patch(row.cue.id, { notes: next })
          return true
        },
        clear: (batch) => {
          for (const row of batch) if (row.cue.notes) patch(row.cue.id, { notes: null })
        },
      },
    ],
    [activeCueId, locationByCue, onOpenCue, patch, standbyCueId],
  )

  const copy = useCallback(
    (cellCount: number) => {
      if (locked) return { setTitle: LOCKED_REASON, clearTitle: LOCKED_REASON }
      const cells = `${cellCount} selected cell${cellCount === 1 ? '' : 's'}`
      return { setTitle: `Set the ${cells} (Enter)`, clearTitle: `Clear the ${cells} (Backspace)` }
    },
    [locked],
  )
  const permission = useMemo(() => ({ entry: !locked, clear: !locked }), [locked])
  const cellDisabled = useCallback(() => locked, [locked])
  const sheet = useSheet<CueSheetRow, CueColumnKey>({ rows, columns, permission, copy, cellDisabled })
  const { selectedRows, cellCount, setRows, scrollTo } = sheet

  // The deep link: select the addressed cue's row and bring it into view — **once per id**. Not
  // an expansion — a sheet has no card to open — but the row is what the Prompt Book's "Edit cue"
  // was pointing at, and a link that lands on the right stack with the wrong cue nowhere in sight
  // would have dropped the contract on the floor.
  //
  // Once, because `rows` is re-minted on every refetch of the stack — each cell commit invalidates
  // the stack list, and every GO moves `activeCueId` — and `?cue=` is never cleared on this view.
  // Keyed on `rows` alone the effect re-fired after every commit, wiping a live marquee and
  // re-scrolling to the linked cue (found by the fresh verifier). The ref remembers which id has
  // been acted on; a cue not yet in `rows` (the stack still loading) is consumed when it arrives.
  const consumedCueRef = useRef<number | null>(null)
  useEffect(() => {
    if (openedCueId == null) {
      consumedCueRef.current = null
      return
    }
    if (consumedCueRef.current === openedCueId) return
    const id = cueRowId(openedCueId)
    if (!rows.some((row) => row.id === id && row.divider == null)) return
    consumedCueRef.current = openedCueId
    setRows([id])
    scrollTo(id)
  }, [openedCueId, rows, scrollTo, setRows])

  /** Arming is what a click on the Cue column means while locked — the cards' body-click rule. */
  const onRowClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (locked && onSetStandby) {
        const row = rows.find((r) => r.id === id)
        if (row && row.cue.id !== activeCueId) onSetStandby(row.cue.id)
        return
      }
      sheet.tableProps.onRowClick(id, e)
    },
    [activeCueId, locked, onSetStandby, rows, sheet.tableProps],
  )

  const armable = locked && onSetStandby && selectedRows.length === 1 && selectedRows[0].cue.id !== activeCueId
  const verbs =
    selectedRows.length > 0 ? (
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {cellCount > 0 && (
          <CellSelectionActions
            copy={sheet.copy}
            permission={sheet.permission}
            setRef={sheet.setButtonRef}
            onSet={sheet.toggleCellEditor}
            onClear={sheet.clearSelectedCells}
            fan={
              <FanPopover
                plans={sheet.fanPlans}
                disabledReason={locked ? LOCKED_REASON : null}
                drivableHint="fade"
                className={PHONE_FOLDED_CLASS}
              />
            }
          />
        )}
        {locked && onSetStandby && (
          <Button
            variant="outline"
            size="sm"
            disabled={!armable}
            onClick={() => armable && onSetStandby(selectedRows[0].cue.id)}
            title={armable ? 'Arm this cue as the next GO' : 'Select one cue that is not on stage to arm it'}
          >
            <Play className="size-3.5" />
            <span className={WORD_CLASS}>Arm as next</span>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={sheet.clearByLadder} title="Deselect all">
          <X className="size-3.5" />
          <span className="hidden sm:inline">Deselect</span>
        </Button>
      </div>
    ) : null

  const rowNoun = selectedRows.length === 1 ? 'cue' : 'cues'
  const standardCount = rows.filter((row) => row.divider == null).length
  const markerCount = rows.length - standardCount

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="@container">
        <SelectionBar
          rowLabel={selectedRows.length > 0 ? `${selectedRows.length} ${rowNoun}` : null}
          cellLabel={cellCount > 0 ? `${cellCount} cell${cellCount === 1 ? '' : 's'}` : null}
          cellTitle={`${selectedRows.length} ${rowNoun} · ${sheet.family ?? ''} — edit once, applies to all`}
          family={sheet.family}
          hints={{ entry: cellCount > 0 && sheet.permission.entry, clear: cellCount > 0 && sheet.permission.clear }}
          strip={
            locked ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 border-l pl-3 text-xs text-muted-foreground">
                <Lock className="size-3" />
                {LOCKED_REASON}
              </span>
            ) : undefined
          }
          verbs={verbs}
          marqueeDragging={sheet.marqueeDragging}
        />
      </div>
      <SheetTable<CueSheetRow, CueColumnKey>
        {...sheet.tableProps}
        onRowClick={onRowClick}
        fill
        minWidth={`${100 + columns.reduce((n, c) => n + trackFloor(c.width), 0)}px`}
        rowClass={(row) =>
          row.cue.id === activeCueId
            ? 'bg-green-500/[0.08] shadow-[inset_3px_0_0_rgb(34,197,94)]'
            : row.cue.id === standbyCueId
              ? 'bg-blue-500/[0.06] shadow-[inset_3px_0_0_rgb(59,130,246)]'
              : undefined
        }
        firstColumn={{
          label: 'Cue',
          width: '100px',
          selectsRows: true,
          render: (row) => {
            const active = row.cue.id === activeCueId
            const standby = row.cue.id === standbyCueId && !active
            return (
              <span className="relative flex min-w-0 items-center gap-2" data-cue-row={row.cue.id}>
                <CueStatePip isActive={active} isStandby={standby} />
                {completedSet.has(row.cue.id) && !active && (
                  <span className="sr-only">Played</span>
                )}
                <span
                  className={cn(
                    'min-w-0 font-mono text-sm',
                    row.cue.cueNumberAuto ? AUTO_CUE_NUMBER_CLASS : 'font-semibold',
                  )}
                  // Unlocked, the number is an inline field and its click must not select the
                  // row under it. Locked, the field is inert text and the number is the largest
                  // thing in the Cue column — so the click bubbles to the column and arms.
                  onClick={locked ? undefined : (e) => e.stopPropagation()}
                >
                  <InlineEditField
                    value={row.cue.cueNumber ?? ''}
                    formatDisplay={(v) => <TruncateStart text={v ? `Q${v}` : '—'} />}
                    onCommit={(next) => {
                      const trimmed = next.trim() || null
                      if (trimmed !== (row.cue.cueNumber ?? null)) patch(row.cue.id, { cueNumber: trimmed })
                    }}
                    ariaLabel="cue number"
                    disabled={locked}
                    placeholder="14A"
                    title={
                      row.cue.cueNumberAuto
                        ? 'Auto-numbered from position — click to set an explicit cue number'
                        : 'Click to edit the cue number'
                    }
                    className="min-w-0 max-w-full px-0.5"
                  />
                </span>
              </span>
            )
          },
        }}
      />
      <div className="flex h-[22px] shrink-0 items-center gap-3 whitespace-nowrap border-t px-3 text-[10.5px] text-muted-foreground">
        <span>
          {standardCount} cue{standardCount === 1 ? '' : 's'}
          {markerCount > 0 ? ` · ${markerCount} marker${markerCount === 1 ? '' : 's'}` : ''}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border border-green-500 bg-green-500/20" />
          Live
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border border-blue-500 bg-blue-500/20" />
          Next
        </span>
      </div>
    </div>
  )
}

function ReadOut({
  onClick,
  title,
  className,
  children,
}: {
  onClick: () => void
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'mx-1 inline-flex h-7 items-center gap-1.5 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

function CountBadge({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn('rounded border px-1 font-mono text-[10px] tabular-nums', className)}>{n}</span>
  )
}

function trackFloor(width: string): number {
  const m = /^(?:minmax\()?\s*(\d+)px/.exec(width)
  return m ? Number(m[1]) : 96
}
