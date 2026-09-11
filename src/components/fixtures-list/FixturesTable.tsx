import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useScrollEdges } from '@/hooks/useScrollEdges'
import { useLongPress } from '@/hooks/useLongPress'
import { AudioWaveform, ChevronDown, ChevronRight, Info, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LocateButton } from '../fixtures/LocateButton'
import { COLUMN_DEFS, columnFamily, columnLabel } from './columns'
import { rowLocateTarget } from './rowModel'
import { buildRowCells, useRowValues } from './useRowValues'
import { useScopedRowValues } from './useScopedRowValues'
import { parsePropertyMask } from '../../lib/attributeFamily'
import { AddToTargetsButton } from '../programmer/AddToTargetsButton'
import { useLookRowStore } from '../programmer/LookRowStore'
import { useFocusedTemplateLayer } from '../programmer/FocusedTemplateLayer'
import { useProgrammerScope, useProgrammerScopeActions } from '../programmer/ProgrammerScope'
import { useEditorContext } from '../programmer/EditorContext'
import { effectSpeedLabel } from '../fx/fxConstants'
import { useIsDeskConnected } from '../../store/status'
import { DESK_OFFLINE_LABEL } from '../../api/wsGesture'
import { useRowOwnership } from './useRowOwnership'
import { applyStagedValue, layerCellClass, ownershipCellClass, ownershipTitle } from './ownership'
import { cellSelectionClass } from './cellSelection'
import { columnRange, rectFrom, rowIndexRange, type ColumnBand } from './cellMarquee'
import { listSelectionIntentFor } from './listSelectionModel'
import { describeCellScope, type CellRef } from './cellSelectionModel'
import type { CellSelection } from './useCellSelection'
import { SliderCell } from './cells/SliderCell'
import { ColourCell } from './cells/ColourCell'
import { PositionCell } from './cells/PositionCell'
import { SettingCell } from './cells/SettingCell'
import type { ColumnKey } from './columns'
import type { CellCommit, FixtureRow, GroupRow, InfoRow, Row, RowId } from './rowModel'
import type { RowCell } from './useRowValues'
import type { CellOwnership } from './useRowOwnership'

const ROW_HEIGHT = 36

/**
 * How far the pointer must travel before a press becomes a marquee rather than a click.
 *
 * The same number dnd-kit's `activationConstraint` and `Stage2DView`'s pan threshold already use.
 * A *threshold* rather than a modifier key on purpose: drag-select is the primary gesture here, and
 * hiding it behind ⌘ or Shift would make it undiscoverable.
 */
const DRAG_THRESHOLD_PX = 5

/**
 * How long a finger must hold still before a touch press becomes a marquee rather than a scroll.
 *
 * A touch has no "travelled 5px" that a scroll does not also have — a flick crosses the threshold
 * before the browser has decided the gesture is a pan — so on a touchscreen the marquee is armed
 * by **time**, not distance (`PD-MARQUEE-TOUCH`): touch pans, and only a hold marquees. The number
 * is `useLongPress`'s default, which is what the busk view's pads and the speed rail's hold-to-slide
 * already answer to, so one hold means one thing across the desk.
 */
const TOUCH_HOLD_MS = 500

/**
 * How long, after a marquee is released, the click that release generates is still swallowed.
 * An upper bound only — the click itself or the next `pointerdown` ends it sooner. See
 * `onPointerUp` in `useCellMarquee` for why a zero timer was not enough.
 */
const SWALLOW_WINDOW_MS = 350

/** How close to an edge the pointer must get before the marquee scrolls the list. */
const AUTOSCROLL_EDGE_PX = 24
const AUTOSCROLL_SPEED_PX = 14


/** Sticky name column: 260px on a desktop, but never more than 45% of a narrow viewport. */
const NAME_COLUMN_WIDTH = 'min(45vw, 260px)'

export interface FixturesTableProps {
  rows: Row[]
  visibleColumns: readonly ColumnKey[]
  isSelected: (id: RowId) => boolean
  /** Name-cell click — the caller derives the intent from the mouse event. */
  onRowClick: (id: RowId, e: React.MouseEvent) => void
  onToggleExpand: (row: GroupRow | FixtureRow) => void
  /** A cell editor is opening on this cell — the caller selects the cell, unless it is already in the marquee. */
  onBeginCellEdit: (row: Row, col: ColumnKey) => void
  onCellCommit: (row: Row, col: ColumnKey, commit: CellCommit) => void
  /** How many write targets a commit from this row's cell in this column
   *  would reach (multi-head fixtures expand per element) — for the editor
   *  popover's "Applying to N" header. */
  batchCountFor: (row: Row, col: ColumnKey) => number
  /** Open the detail sheet for a row (group → group sheet, fixture/element →
   *  fixture sheet). */
  onShowInfo: (row: InfoRow) => void
  /** Row to scroll into view (deep-link); cleared via onScrolledToRow. */
  scrollToRowId?: RowId | null
  onScrolledToRow?: () => void
  /**
   * Colour each cell by which layer owns it, and show the programmer's staged value while
   * blind. Opt-in: the programmer sheet wants it, the plain Fixtures / Groups lists are
   * patch-management views where provenance tinting would just be noise.
   */
  showOwnership?: boolean
  /** Fill the flex parent instead of the embedded-list viewport cap. See FixturesListContainer. */
  fill?: boolean
  /**
   * Neither a row nor a cell is selected any more. Any open cell editor closes on the crossing
   * into this — see `useCellEditorOpen`, which owns the rule and the reason.
   *
   * Passed as a plain boolean rather than as a one-shot the way `autoOpenCell` is: it changes only
   * on the 0 ↔ non-0 boundary, so the rows' memo holds through every ordinary selection change,
   * and nothing has to consume it.
   */
  selectionEmpty?: boolean
  /**
   * Drag-select across cells. Absent on the two plain list routes, which have no use for an edit
   * scope narrower than a row.
   */
  cellSelection?: CellSelection
  /**
   * Drag-select across **rows**: a press in the sticky name column that travels selects the rows
   * the rectangle covers, exactly as one in a value column selects cells. Called with the whole
   * selection the drag has arrived at — the modifiers are already folded in, so a ⌘-drag unions
   * with what was selected when it began — and only when that list changed since the last call.
   *
   * It is what replaced the row checkbox: accumulate by ⌘-click or by dragging, and a plain drag
   * replaces, the way a spreadsheet's row header does.
   */
  onRowMarquee?: (ids: RowId[]) => void
  /**
   * The keyboard asked for a cell's editor: Enter (or a character) over a cell selection, from
   * `FixturesListContainer`'s window handler. `seed` is the character that started it, or `''` for
   * a bare Enter.
   *
   * A one-shot, like `autoOpenCell` below, which is what it is folded into — so the keyboard and a
   * released marquee open an editor by exactly one mechanism. The container is the one that knows
   * *which* cell (it owns the selection and the scope gate); this knows how to open one.
   */
  keyboardOpen?: { rowId: RowId; col: ColumnKey; seed: string } | null
  /**
   * A marquee drag has started or ended.
   *
   * Fires twice per gesture, never per pointer move: the container keeps the answer so the
   * programmer's selection bar can hold its place while a drag is in flight
   * (`selectionBandState`). The gesture itself stays here — only the fact of it is lifted.
   */
  onMarqueeDragChange?: (dragging: boolean) => void
  /**
   * A click landed on the grid's own background — under the last row, or beside the last column —
   * on nothing that is a row or the header.
   *
   * The container answers it with the same ladder Escape runs (cells first, rows second). It
   * exists because a phone has no Escape and no "click off" (`PD-CLEAR-SELECTION-TOUCH`): the only
   * way to drop a selection there was the bar's Deselect, and on a short list the empty space
   * under the rows is the larger target. Not fired for the click that ends a marquee — that one
   * is swallowed before it reaches here, or a drag released over empty space would clear the
   * selection it just made.
   */
  onBackgroundClick?: () => void
}

/**
 * The virtualized spreadsheet grid. Plain CSS-grid divs rather than a <table>
 * — table semantics fight row virtualization — with a sticky header and a
 * sticky-left name column. Rows subscribe to their own channels via
 * useRowValues; cells are dumb value + onCommit components.
 */
export function FixturesTable({
  rows,
  visibleColumns,
  isSelected,
  onRowClick,
  onToggleExpand,
  onBeginCellEdit,
  onCellCommit,
  batchCountFor,
  onShowInfo,
  scrollToRowId,
  onScrolledToRow,
  showOwnership = false,
  fill = false,
  selectionEmpty,
  cellSelection,
  onRowMarquee,
  keyboardOpen,
  onMarqueeDragChange,
  onBackgroundClick,
}: FixturesTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // One subscription for the whole grid; every row takes the answer as a prop.
  const deskConnected = useIsDeskConnected()

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })

  useEffect(() => {
    if (!scrollToRowId) return
    const index = rows.findIndex((row) => row.id === scrollToRowId)
    // Only consume the pin once the row actually exists — it may be a render
    // behind (e.g. a deep-link that just expanded the target's group).
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'center' })
      onScrolledToRow?.()
    }
  }, [scrollToRowId, rows, virtualizer, onScrolledToRow])

  // The name column is the single biggest consumer of width, and 260px of a 375px phone
  // leaves room for barely one property. `min()` scales it down with the viewport without
  // needing a JS breakpoint — inline styles can't carry media queries, but they can carry
  // CSS math.
  const gridTemplateColumns = useMemo(
    () => `${NAME_COLUMN_WIDTH} repeat(${visibleColumns.length}, minmax(96px, 1fr))`,
    [visibleColumns.length],
  )

  const columnLabels = useMemo(() => {
    const byKey = new Map(COLUMN_DEFS.map((d) => [d.key, d.label]))
    return visibleColumns.map((col) => ({ col, label: byKey.get(col) ?? col }))
  }, [visibleColumns])

  /**
   * The cell whose editor the container has asked for — Enter over a selection, or the selection
   * bar's Set — and null the rest of the time.
   *
   * **One-shot, and dropped by this component rather than by the cell that acts on it.** A signal
   * left standing is not merely untidy: the rows are virtualised and the list is filtered, so the
   * cell it names may not be mounted when the request is made, and nothing would then consume it.
   * Minutes later, on a scroll back up or a cleared filter, that row mounts with the signal still
   * set and its editor springs open unprompted, with no gesture behind it.
   *
   * Clearing it here cannot lose the open, either: effects belong to the commit that scheduled
   * them, so the named cell's effect still runs even though this one has already asked for the
   * signal to go.
   *
   * A released marquee used to feed this too (`PD-POPUP-AFTER-DRAG`): a single-column drag opened
   * its first cell's editor behind the release. That went when the selection bar gained a Set of
   * its own — the drag says *what* to edit and the bar says *do it* — so the request now comes
   * from the container alone, whichever way the operator made it.
   */
  const [autoOpenCell, setAutoOpenCell] = useState<(CellRef & { seed: string | null }) | null>(null)
  useEffect(() => {
    if (autoOpenCell) setAutoOpenCell(null)
  }, [autoOpenCell])
  useEffect(() => {
    if (keyboardOpen) setAutoOpenCell({ ...keyboardOpen })
  }, [keyboardOpen])

  const marquee = useCellMarquee({
    scrollRef,
    rows,
    visibleColumns,
    cellSelection,
    isRowSelected: isSelected,
    onRowMarquee,
    onDragChange: onMarqueeDragChange,
  })

  const columnLabelFor = useCallback((col: ColumnKey) => columnLabel(col), [])

  const inertColumns = useInertColumns(visibleColumns)
  // `horizontalOnly`: this scroller is the virtualizer's too, so most scroll events on it are
  // vertical and say nothing about the columns. See `useScrollEdges`.
  const { right: moreColumnsRight, attach: attachScroller } = useScrollEdges(scrollRef, {
    horizontalOnly: true,
  })

  return (
    /* The scroller's WRAPPER, and it exists for the fade below: a gradient drawn inside the
       scroller would scroll away with the columns it is meant to be covering, which on a phone
       means the one hint that there are more columns disappears the moment you use it. It also
       gives the `fill` arm its own flex column so the scroller keeps `min-h-0 flex-1`. */
    <div className={cn('relative', fill && 'flex min-h-0 flex-1 flex-col')}>
      <div
        // `attach` rather than `scrollRef` — it fills that ref AND tells `useScrollEdges` the
        // node exists, which a `RefObject` alone cannot.
        ref={attachScroller}
        className={cn(
          'overflow-auto',
          // `fill` is the programmer, whose grid owns the remaining height of a full-page view. The
          // viewport cap is tuned for a list embedded in a scrolling page and leaves dead air there.
          // It is also the arm with no card around it: since the space plan's session 1 the grid runs
          // edge to edge between the page edge and the rail's `border-l`, so a rounded box drawn hard
          // against both reads as a card that failed to inset rather than as a table.
          fill ? 'min-h-0 flex-1 border-t border-border' : 'rounded-md border border-border',
        )}
        style={fill ? undefined : { maxHeight: 'calc(100vh - 14rem)' }}
        // On the scroller, not the rows wrapper: a short list leaves the wrapper shorter than the
        // scroller, and the empty space under the last row — the target this is for — is the
        // scroller's own. The header and every row stop it by ancestry rather than by
        // `stopPropagation`, so a cell editor's trigger or a checkbox never has to know this
        // exists.
        onClick={(e) => {
          if (!onBackgroundClick) return
          const target = e.target as Element
          // React bubbles a synthetic event up the *React* tree, portals included — and every
          // cell editor is a Radix popover portalled to `body`. A click on the slider inside an
          // open editor therefore reaches this handler with a target that has no row above it in
          // the DOM, and read as background it would drop the marquee mid-edit. The DOM subtree
          // is the question here, so the DOM is what is asked.
          if (!e.currentTarget.contains(target)) return
          if (target.closest('[data-row-id], [data-grid-header]')) return
          onBackgroundClick()
        }}
      >
        <div style={{ minWidth: `calc(${NAME_COLUMN_WIDTH} + ${visibleColumns.length * 96}px)` }}>
          {/* Header */}
          <div
            data-grid-header
            className="sticky top-0 z-20 grid border-b border-border bg-background"
            style={{ gridTemplateColumns }}
          >
            <div
              // The marquee measures the name column from this — see `useCellMarquee`.
              data-grid-name-header
              className="sticky left-0 z-10 bg-background px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Fixture
            </div>
            {columnLabels.map(({ col, label }) => (
              <div
                key={col}
                // The marquee measures its column bands from these — see `useCellMarquee`.
                data-column-header={col}
                className={cn(
                  'px-1.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
                  // Greyed rather than hidden: an operator looking for Colour in a
                  // POSITION-masked layer needs to learn *why* it is unavailable, and a column that
                  // vanished would read as a broken grid. The cells beneath say the same thing.
                  inertColumns.has(col) && 'opacity-40',
                )}
                title={inertColumns.has(col) ? 'Outside this layer’s mask' : undefined}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Virtualized rows. The marquee handlers live here rather than on the scroller so the
              sticky header is excluded by geometry rather than by a hit test.

              Three touch declarations, each for a browser default the marquee was losing to
              (`PD-MARQUEE-TOUCH`). `select-none`: a drag — mouse or finger — was selecting the
              text under it as well as the cells, and nothing in a grid of values wants text
              selection. `[-webkit-touch-callout:none]`: the hold that arms a touch marquee is the
              same hold iOS answers with its own callout. `touch-manipulation`: pan and pinch stay
              the browser's, which is the decision — a finger scrolls, and only a held one
              marquees — while the double-tap-to-zoom delay goes, so a tap on a cell is a click
              at once. The hold itself takes the pan away in the move handler, not here:
              `touch-action` is read once, at the start of the touch, and the start of this touch
              is a scroll until it has been held.

              Only where there is a marquee to lose them to, and only for as long as there is: the
              programmer (`cellSelection`) carries all three always, as it did. The two plain list
              routes have the row marquee alone, and there the names stay selectable and copyable
              — which their old comment named as deliberate — by refusing text selection only
              while a row drag is live (`select-none` from `marquee.dragging`, and `arm()` drops
              whatever the browser had started selecting in the five pixels before it). The cue
              value grid has neither and nothing drags there. */}
          <div
            className={cn(
              cellSelection && 'select-none touch-manipulation [-webkit-touch-callout:none]',
              !cellSelection && marquee.dragging && 'select-none',
            )}
            style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
            onPointerDown={marquee.onPointerDown}
            onPointerMove={marquee.onPointerMove}
            onPointerUp={marquee.onPointerUp}
            onPointerCancel={marquee.onPointerUp}
            onPointerLeave={marquee.onPointerLeave}
          >
            {/* The rubber band. **Neutral, not primary** (space plan D4): a solid 2px `--foreground`
                frame with foreground corner handles over a `foreground/5` fill. It was a dashed
                primary border over a `primary/[0.13]` fill, which put the accent colour on the one
                thing that is never a value — and dragged it across cells whose *rings* use the same
                accent to mean "you own this". A selection marquee and an ownership ring are the two
                facts the grid most needs to keep apart, so they no longer share a hue.

                The 1px `--background` ring is what keeps a near-white frame legible where it crosses
                a selected row's near-white wash: two neutrals a few percent apart need a dark line
                between them, and a heavier frame would have read as a border rather than a band. */}
            {marquee.band && (
              <div
                aria-hidden="true"
                data-testid="cell-marquee"
                className="pointer-events-none absolute z-30 rounded-sm border-2 border-foreground bg-foreground/5 shadow-[0_0_0_1px_var(--background)]"
                style={marquee.band}
              >
                <span className="absolute -left-px -top-px size-[7px] rounded-[1px] bg-foreground" />
                <span className="absolute -bottom-px -right-px size-[7px] rounded-[1px] bg-foreground" />
              </div>
            )}
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <div
                  key={row.id}
                  className="absolute inset-x-0"
                  style={{ height: `${ROW_HEIGHT}px`, transform: `translateY(${virtualRow.start}px)` }}
                >
                  <RowView
                    row={row}
                    visibleColumns={visibleColumns}
                    gridTemplateColumns={gridTemplateColumns}
                    selected={row.kind !== 'divider' && isSelected(row.id)}
                    onRowClick={onRowClick}
                    onToggleExpand={onToggleExpand}
                    onBeginCellEdit={onBeginCellEdit}
                    onCellCommit={onCellCommit}
                    batchCountFor={batchCountFor}
                    onShowInfo={onShowInfo}
                    showOwnership={showOwnership}
                    cellSelection={cellSelection}
                    deskConnected={deskConnected}
                    autoOpenCol={autoOpenCell?.rowId === row.id ? autoOpenCell.col : null}
                    autoOpenSeed={autoOpenCell?.rowId === row.id ? autoOpenCell.seed : null}
                    selectionEmpty={selectionEmpty}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Scope chip, following the pointer. `fixed`, so it is never clipped by the scroller, and
            `pointer-events-none` so it can sit under the cursor without eating the drag.

            **It stays primary**, alone among the selection affordances, and that is deliberate
            rather than an oversight of D4: it exists only while a drag is in flight, it moves with
            the pointer, and it never comes to rest beside an owned cell — so it cannot be confused
            with a ring the way a row wash sitting still under one could.

            PORTALLED to `document.body`, which is load-bearing rather than tidiness: its coordinates
            are the pointer's `clientX/clientY`, i.e. viewport space, and `ProgrammerWorkspace` — the
            only host that enables cell selection — is a Tailwind `@container`. `container-type:
            inline-size` applies layout containment, which makes that element the containing block for
            `fixed` descendants, so an in-tree chip would be offset by the workspace's own top-left
            (the header, source strip, action bar and `p-4`) and sit well below the cursor. */}
        {marquee.chip &&
          (marquee.rowCount != null
            ? marquee.rowCount > 0
            : cellSelection != null && cellSelection.count > 0) &&
          createPortal(
            <div
              className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground shadow-lg"
              style={{ left: marquee.chip.x + 12, top: marquee.chip.y + 12 }}
            >
              {marquee.rowCount != null ? (
                <span className="font-mono tabular-nums">
                  {marquee.rowCount} row{marquee.rowCount === 1 ? '' : 's'}
                </span>
              ) : (
                <>
                  <span className="font-mono tabular-nums">
                    {cellSelection!.count} cell{cellSelection!.count === 1 ? '' : 's'}
                  </span>
                  <span className="opacity-60">·</span>
                  <span>{describeCellScope(cellSelection!.cells, columnLabelFor)}</span>
                </>
              )}
            </div>,
            document.body,
          )}
      </div>
      {/* "There are more columns to the right", 24px wide, on the wrapper rather than in the
          scroller — so it stays pinned to the grid's right edge instead of sliding away with the
          content it is describing. It is drawn only while there is something still to the right,
          which is why the overflow is measured rather than assumed: at a desk width with three
          columns showing there is nothing off-screen, and a permanent gradient there would read
          as a rendering fault. `pointer-events-none` so it never eats a press on the last
          column. */}
      {moreColumnsRight && (
        <div
          aria-hidden="true"
          data-testid="column-scroll-fade"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
        />
      )}
    </div>
  )
}

/**
 * The drag-select gesture: a rubber band over the rows, resolved to cells by arithmetic.
 *
 * A **ref drives the gesture and state drives the band** — the idiom `Stage2DView` already uses.
 * The ref is what lets the handlers stay referentially stable through a drag; re-creating them
 * mid-gesture would detach the listener the pointer capture is bound to.
 *
 * Three things about the press are load-bearing:
 *
 *  - Radix `Popover` opens on `click`, not `pointerdown`, so arming a marquee on pointerdown opens
 *    nothing. All four cell editors are popovers, which is what makes this coexist with them.
 *  - Pointer capture is taken only once the threshold is crossed. Capturing on the initial press
 *    would swallow the click that opens an editor, so a plain click would stop working entirely.
 *  - After a real drag the trailing `click` is suppressed in the capture phase, or the editor under
 *    the release point opens on top of the selection just made.
 *
 * **A touch arms by time, a mouse by distance** (`PD-MARQUEE-TOUCH`). `button === 0` is true of a
 * finger too, and a scroll flick crosses `DRAG_THRESHOLD_PX` at once, so a distance-armed marquee
 * on a touchscreen selected cells on every scroll. Now a `touch` or `pen` press is handed to
 * `useLongPress` — the hook the busk pads and the speed rail's hold-to-slide already
 * use, so a hold means the same thing everywhere on the desk — and the browser keeps the touch
 * until the hold fires: a finger that moves first is a pan, which ends in `pointercancel` and
 * disarms it. Once the hold has fired the marquee needs the *rest* of the touch, and `touch-action`
 * cannot give it — it is read once, at touch start — so a non-passive `touchmove` guard on the
 * scroller cancels the pan for exactly as long as a marquee is live. A pen takes the touch arm
 * too: on an iPad it scrolls the page the way a finger does.
 *
 * The hold selects the cell under the finger the moment it fires — a zero-size rectangle still
 * covers one cell — which is the only acknowledgement a touchscreen gets that the hold took.
 *
 * **The same gesture selects rows from the name column.** Which of the two a press is for is
 * decided once, at the press, by which side of the first value column it landed on — a rectangle
 * dragged from the name column into the values is still a row marquee, the way a spreadsheet's
 * row-header drag is. A row drag resolves the same `rowIndexRange` to row ids, folds the press's
 * modifier in against the selection it began over, and hands the whole list to `onRowMarquee`;
 * the container puts it in the row selection, which is what the checkbox column used to be for.
 */
function useCellMarquee({
  scrollRef,
  rows,
  visibleColumns,
  cellSelection,
  isRowSelected,
  onRowMarquee,
  onDragChange,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  rows: Row[]
  visibleColumns: readonly ColumnKey[]
  cellSelection?: CellSelection
  /** The row selection a ⌘-drag accumulates over, read at the press. */
  isRowSelected: (id: RowId) => boolean
  /** The rows a name-column drag has arrived at. See `FixturesTableProps`. */
  onRowMarquee?: (ids: RowId[]) => void
  /** A drag started or ended — twice per gesture, never per move. See `FixturesTableProps`. */
  onDragChange?: (dragging: boolean) => void
}) {
  const [band, setBand] = useState<React.CSSProperties | null>(null)
  const [chip, setChip] = useState<{ x: number; y: number } | null>(null)
  /** How many rows a live *row* marquee has selected, for the chip; null while a cell marquee is live. */
  const [rowCount, setRowCount] = useState<number | null>(null)
  /** Mirrors `draggingRef` as state, for the one class that wants it (see the rows wrapper). */
  const [dragging, setDraggingState] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    /** The rows wrapper the press landed on — the hold arms from a timer, with no event to read it from. */
    el: HTMLElement
    start: { x: number; y: number }
    /** The same point in viewport space, for the scope chip the hold draws before any move. */
    client: { x: number; y: number }
    intent: ReturnType<typeof listSelectionIntentFor>
    /** A touch or pen press: armed by the hold, never by distance. */
    hold: boolean
    dragged: boolean
    /** Rows from the name column, cells from the values — fixed at the press. */
    mode: 'cells' | 'rows'
    /** A row drag's base: the ids selected when it began, which a ⌘-drag unions into. */
    baseRowIds: readonly RowId[]
  } | null>(null)
  const bandsRef = useRef<ColumnBand[] | null>(null)
  const headerHeightRef = useRef(0)
  const autoScrollRef = useRef<number | null>(null)
  /** Last pointer position in scroller-client space, so the autoscroll loop can extend the drag. */
  const lastPosRef = useRef({ x: 0, y: 0 })

  // Latest values, read inside handlers that must not change identity mid-drag.
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const selectionRef = useRef(cellSelection)
  selectionRef.current = cellSelection
  const onDragChangeRef = useRef(onDragChange)
  onDragChangeRef.current = onDragChange
  const onRowMarqueeRef = useRef(onRowMarquee)
  onRowMarqueeRef.current = onRowMarquee
  const isRowSelectedRef = useRef(isRowSelected)
  isRowSelectedRef.current = isRowSelected

  /**
   * Whether a marquee is live, mirrored outside React state so the handlers keep their identity.
   * Deduplicated here rather than in the consumer: the teardown paths overlap (a `buttons === 0`
   * move can be followed by a `pointerup`), and a second `false` would be a second render for
   * nothing.
   */
  const draggingRef = useRef(false)
  const setDragging = useCallback((next: boolean) => {
    if (draggingRef.current === next) return
    draggingRef.current = next
    setDraggingState(next)
    onDragChangeRef.current?.(next)
  }, [])
  /**
   * Column extents, measured from the sticky header.
   *
   * Measured rather than recomputed from `gridTemplateColumns`: that template carries a `min()` and
   * a `1fr` distribution, and a JS re-implementation would be a second source of truth. Cached per
   * gesture and invalidated whenever the visible columns change.
   */
  const measureBands = useCallback((): ColumnBand[] => {
    const scroller = scrollRef.current
    if (!scroller) return []
    const cells = scroller.querySelectorAll('[data-column-header]')
    const origin = scroller.getBoundingClientRect().left
    const out: ColumnBand[] = []
    cells.forEach((el) => {
      const col = el.getAttribute('data-column-header') as ColumnKey | null
      if (!col) return
      const r = el.getBoundingClientRect()
      out.push({ col, left: r.left - origin, right: r.right - origin })
    })
    return out
  }, [scrollRef])

  useEffect(() => {
    bandsRef.current = null
  }, [visibleColumns])

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current != null) {
      cancelAnimationFrame(autoScrollRef.current)
      autoScrollRef.current = null
    }
  }, [])

  /** The non-divider rows the rectangle covers, in display order. */
  const rowsFor = useCallback(
    (endX: number, endY: number): Row[] => {
      const scroller = scrollRef.current
      const drag = dragRef.current
      if (!scroller || !drag) return []
      const rect = rectFrom(drag.start, { x: endX, y: endY })
      const range = rowIndexRange(rect, {
        scrollTop: scroller.scrollTop,
        headerHeight: headerHeightRef.current,
        rowHeight: ROW_HEIGHT,
        rowCount: rowsRef.current.length,
      })
      if (!range) return []
      const out: Row[] = []
      for (let i = range[0]; i <= range[1]; i++) {
        const row = rowsRef.current[i]
        // Dividers hold no values and cannot be selected, so they must not inflate either count.
        if (row && row.kind !== 'divider') out.push(row)
      }
      return out
    },
    [scrollRef],
  )

  const hitsFor = useCallback(
    (endX: number, endY: number): CellRef[] => {
      const drag = dragRef.current
      if (!drag) return []
      const rect = rectFrom(drag.start, { x: endX, y: endY })
      const cols = columnRange(rect, bandsRef.current ?? [])
      if (cols.length === 0) return []
      const hits: CellRef[] = []
      for (const row of rowsFor(endX, endY)) {
        for (const col of cols) hits.push({ rowId: row.id, col })
      }
      return hits
    },
    [rowsFor],
  )

  /** Redraw the band and re-resolve the hits from the last known pointer position. */
  const updateFromPointer = useCallback(() => {
    const scroller = scrollRef.current
    const drag = dragRef.current
    if (!scroller || !drag?.dragged) return
    const { x, y } = lastPosRef.current
    const rect = rectFrom(drag.start, { x, y })
    // The band is drawn inside the ROWS wrapper, whose origin is below the sticky header and at
    // content x/y 0 — but `rect` is in scroller-client space. Both offsets have to come off, or the
    // rubber band sits a header's height below the cells it is actually selecting.
    setBand({
      left: rect.left + scroller.scrollLeft,
      top: rect.top + scroller.scrollTop - headerHeightRef.current,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    })
    if (drag.mode === 'rows') {
      const covered = rowsFor(x, y).map((row) => row.id)
      // Shift has no distinct meaning for a rectangle — the rectangle *is* the range — so it
      // replaces, as it does for cells (`applyCellSelection`). ⌘ accumulates onto the selection
      // the drag began over, not onto its own last frame, so shrinking the rectangle un-selects.
      const accumulate = drag.intent === 'toggle' || drag.intent === 'range-add'
      // In display order either way, so the comparison below is order-insensitive by construction.
      const ids = accumulate
        ? (() => {
            const wanted = new Set([...drag.baseRowIds, ...covered])
            return rowsRef.current.filter((row) => wanted.has(row.id)).map((row) => row.id)
          })()
        : covered
      // The chip counts what the drag has *selected* — the accumulated list under ⌘ — the way the
      // cell arm counts the accumulated cells, not the rectangle alone.
      setRowCount(ids.length)
      // Sent only when it differs from what the container holds *now*, not from what this drag
      // last sent: a dispatch per move would re-render every consumer for nothing, and a memory of
      // our own last send would fall silent exactly when another writer (the desk bridge) moved
      // the selection under a live drag.
      const current = rowsRef.current
        .filter((row) => isRowSelectedRef.current(row.id))
        .map((row) => row.id)
      if (current.length === ids.length && ids.every((id, i) => current[i] === id)) return
      onRowMarqueeRef.current?.(ids)
      return
    }
    selectionRef.current?.select(hitsFor(x, y), drag.intent)
  }, [hitsFor, rowsFor, scrollRef])

  // The rAF loop closes over its first `step`, so it reads the callback through a ref rather than
  // capturing a stale one.
  const updateFromPointerRef = useRef(updateFromPointer)
  updateFromPointerRef.current = updateFromPointer

  /**
   * The armed press becomes a marquee: the one place both arms — distance for a mouse, time for a
   * touch — go through, so capture and the edge-scroll loop cannot be set up by one and forgotten
   * by the other.
   */
  const arm = useCallback(() => {
    const drag = dragRef.current
    if (!drag || drag.dragged) return
    drag.dragged = true
    setDragging(true)
    // On the plain lists text stays selectable until this moment (see the rows wrapper), so the
    // five pixels before the threshold may have started a text selection; drop it.
    window.getSelection()?.removeAllRanges()
    try {
      drag.el.setPointerCapture(drag.pointerId)
    } catch {
      // Safari throws when the pointer has already been released. Losing capture only means
      // the drag ends at the edge of the element, which is survivable.
    }
  }, [setDragging])

  /**
   * The edge-scroll loop, started by the first move of a live marquee rather than by `arm()`.
   * Without it a selection can never exceed one viewport of rows, which on a real rig is the
   * normal case. It waits for a move because the hold arms with the finger still on the press
   * point: started from there, a hold within `AUTOSCROLL_EDGE_PX` of the bottom would begin
   * scrolling — and growing the selection — before the operator had moved at all.
   */
  const startAutoScroll = useCallback(() => {
    if (autoScrollRef.current != null) return
    const step = () => {
      const el = scrollRef.current
      if (!el || !dragRef.current?.dragged) return
      const { y: yNow } = lastPosRef.current
      const before = el.scrollTop
      if (yNow < AUTOSCROLL_EDGE_PX) el.scrollTop -= AUTOSCROLL_SPEED_PX
      else if (yNow > el.clientHeight - AUTOSCROLL_EDGE_PX) el.scrollTop += AUTOSCROLL_SPEED_PX
      // Re-resolve after scrolling: the pointer has not moved, but the CONTENT under it has, so
      // without this the marquee would stop growing the moment the operator held still at the
      // edge — which looks exactly like autoscroll being broken.
      if (el.scrollTop !== before) updateFromPointerRef.current()
      autoScrollRef.current = requestAnimationFrame(step)
    }
    autoScrollRef.current = requestAnimationFrame(step)
  }, [scrollRef])

  // The touch arm. The hook's handlers are called from this hook's own, and only for a press whose
  // `hold` is set — a mouse never reaches them. `onPress` is deliberately not given: a touch that
  // was neither held nor moved is a tap, and a tap is the cell's `click`, which the browser is
  // already about to deliver.
  const { handlers: hold } = useLongPress({
    delayMs: TOUCH_HOLD_MS,
    onLongPress: () => {
      const drag = dragRef.current
      if (!drag || drag.dragged) return
      arm()
      // Select the cell under the finger now, before any move: the acknowledgement that the hold
      // took, and the start of the rectangle the finger is about to draw.
      lastPosRef.current = drag.start
      setChip({ x: drag.client.x, y: drag.client.y })
      updateFromPointerRef.current()
    },
  })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Same portal trap the scroller's background `onClick` documents, and the one this handler
      // was missing: React bubbles a synthetic event up the *React* tree, and every cell editor is
      // rendered from inside a row — so a press on the dimmer slider, the colour picker or the hue
      // bar arrived here as a press on the grid, started a marquee from wherever the editor
      // happened to be over, and selected cells while the operator was dragging a value. Invisible
      // in a popover, which is small and beside its own cell; obvious in a sheet, which is not.
      // The DOM subtree is the question, so the DOM is what is asked.
      if (!e.currentTarget.contains(e.target as Node)) return
      if ((!selectionRef.current && !onRowMarqueeRef.current) || e.button !== 0) return
      const scroller = scrollRef.current
      if (!scroller) return
      // A second pointer while one is already down. A live marquee keeps the pointer it has and
      // ignores the newcomer; a *pending* hold is dropped outright, because two fingers are the
      // start of a pinch, not of a hold — and left alone the first finger's timer would have fired
      // for a press it no longer describes.
      const current = dragRef.current
      if (current) {
        if (current.dragged) return
        if (current.hold) hold.onPointerCancel()
        dragRef.current = null
        return
      }
      bandsRef.current = measureBands()
      headerHeightRef.current =
        scroller.querySelector('[data-grid-header]')?.getBoundingClientRect().height ?? 0
      const origin = scroller.getBoundingClientRect()
      const x = e.clientX - origin.left
      // On the sticky name column a drag selects rows; on a value column it selects cells. The
      // name column is measured from its *own* header cell, not inferred from the first value
      // band's left edge: the name cell is `sticky left-0` and stays put while the bands scroll
      // under it, so once the grid is scrolled sideways the first band's edge is at or left of
      // zero and a press on the still-visible name cell would have read as a cell press — and
      // rubber-banded the cells hidden behind it. Each arm needs its consumer, or the press is
      // nobody's.
      const nameRight =
        (scroller.querySelector('[data-grid-name-header]')?.getBoundingClientRect().right ?? origin.left) -
        origin.left
      const mode: 'cells' | 'rows' = x < nameRight ? 'rows' : 'cells'
      if (mode === 'rows' ? !onRowMarqueeRef.current : !selectionRef.current) return
      // The base a ⌘-drag accumulates onto, taken now: the selection can move under a live drag
      // (the container clears the *other* kind the moment this one selects anything).
      const baseRowIds =
        mode === 'rows' ? rowsRef.current.filter((row) => isRowSelectedRef.current(row.id)).map((row) => row.id) : []
      // Touch *and* pen: a pen scrolls like a finger on the one tablet this runs on. Named
      // positively rather than as `!== 'mouse'` because a `pointerType` can be empty — jsdom's
      // always is — and an unknown device is a mouse's kind of thing, not a scroller's.
      const isHold = e.pointerType === 'touch' || e.pointerType === 'pen'
      dragRef.current = {
        pointerId: e.pointerId,
        el: e.currentTarget as HTMLElement,
        start: { x, y: e.clientY - origin.top },
        client: { x: e.clientX, y: e.clientY },
        intent: listSelectionIntentFor(e),
        hold: isHold,
        dragged: false,
        mode,
        baseRowIds,
      }
      if (isHold) hold.onPointerDown(e)
    },
    [hold, measureBands, scrollRef],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      const scroller = scrollRef.current
      if (!drag || !scroller) return
      // Another finger's move says nothing about this gesture.
      if (e.pointerId !== drag.pointerId) return
      // No button held any more: the release happened somewhere this element never saw — over the
      // sticky header, the scrollbar, or outside the window — before the threshold was crossed, so
      // no pointer capture was taken and no `pointerup` arrived here. Without this the armed press
      // outlives the gesture and the operator's next plain HOVER over the grid starts a marquee
      // from a start point they set minutes ago.
      if (e.buttons === 0) {
        // Tear the whole gesture down, not just the ref. If capture was ever lost while a marquee
        // was live, nulling `dragRef` alone would leave the rubber band and the scope chip frozen
        // on screen until the next drag — the autoscroll loop stops on its own, since it re-reads
        // `dragRef.current?.dragged` each frame.
        dragRef.current = null
        setBand(null)
        setChip(null)
        setRowCount(null)
        stopAutoScroll()
        setDragging(false)
        return
      }
      const origin = scroller.getBoundingClientRect()
      const x = e.clientX - origin.left
      const y = e.clientY - origin.top
      lastPosRef.current = { x, y }

      if (!drag.dragged) {
        if (drag.hold) {
          // A touch that moves before the hold has fired is the browser's scroll, not ours. The
          // hook drops the hold past its own slop; the pan, if the scroller takes it, arrives as
          // `pointercancel` and tears the press down. Either way nothing is armed by distance.
          hold.onPointerMove(e)
          return
        }
        if (Math.hypot(x - drag.start.x, y - drag.start.y) < DRAG_THRESHOLD_PX) return
        arm()
      }

      e.preventDefault()
      // The first move of a live marquee — a mouse's arming move, or a held finger's first
      // travel — is what starts the edge-scroll loop. See `startAutoScroll`.
      startAutoScroll()
      setChip({ x: e.clientX, y: e.clientY })
      updateFromPointer()
    },
    [arm, hold, scrollRef, setDragging, startAutoScroll, stopAutoScroll, updateFromPointer],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      // Lifting a second finger must not end the gesture the first one owns.
      if (drag && e.pointerId !== drag.pointerId) return
      dragRef.current = null
      setBand(null)
      setChip(null)
      setRowCount(null)
      stopAutoScroll()
      setDragging(false)
      if (!drag) return
      // A pending hold dies with the press — this is the `pointercancel` path too, which is the
      // one a scroller's pan ends a touch with, and the reason the hook has a cancel at all.
      if (drag.hold) hold.onPointerCancel()
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(drag.pointerId)
      } catch {
        // Already released; nothing to undo.
      }
      if (!drag.dragged) return

      // A marquee ends with focus on the document, not on the cell trigger the press began on.
      // Chromium (and Firefox on Windows) focus a `<button>` on mousedown, and every cell's editor
      // trigger is a button filling its cell — so a mouse-drawn marquee left that button focused,
      // and the container's window handler then read the operator's Enter as "from a focused
      // control" and handed it to the button, which opened one cell's popover instead of the typed
      // field. Safari does not focus buttons on mousedown, which is why the gesture worked there
      // and nowhere else. Blurring only after a real drag keeps Tab-then-Enter on a trigger intact.
      if (document.activeElement instanceof HTMLElement && scrollRef.current?.contains(document.activeElement)) {
        document.activeElement.blur()
      }

      // Swallow the click this release is about to generate, or the cell under the pointer opens
      // its editor on top of the selection just made.
      //
      // It lives until the click arrives, the next pointer goes down, or `SWALLOW_WINDOW_MS`
      // passes — whichever is first. A mouse's click lands in the same task as this release, but
      // a touch's compatibility click is the browser's to schedule and a zero timer could lose
      // the race to it, in which case the click would hit the auto-opened editor's trigger and
      // toggle it straight back shut. The next `pointerdown` is the one certain bound: a click
      // belonging to this release cannot come after the press that starts the next gesture. A
      // drag that ends outside the document generates no click at all, which is what the timer
      // is for — without it the listener would sit there and eat the operator's next one.
      let dispose = () => {}
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault()
        ev.stopPropagation()
        dispose()
      }
      const timer = window.setTimeout(() => dispose(), SWALLOW_WINDOW_MS)
      dispose = () => {
        window.clearTimeout(timer)
        window.removeEventListener('click', swallow, true)
        window.removeEventListener('pointerdown', dispose, true)
      }
      window.addEventListener('click', swallow, true)
      window.addEventListener('pointerdown', dispose, true)
      // And that is all a release does. It used to open the first selected cell's editor when the
      // drag stayed in one column (`PD-POPUP-AFTER-DRAG`); the selection bar's Set is that gesture
      // now, and Enter its key. For a row marquee the swallow above is load-bearing twice over:
      // the name cell's own `onClick` would otherwise select the row under the release, replacing
      // the very selection the drag just made.
    },
    [hold, scrollRef, setDragging, stopAutoScroll],
  )

  /**
   * A finger that leaves the rows before its hold fires has not held anything. Only the *pending*
   * hold is dropped: an armed marquee holds pointer capture, so the pointer cannot leave it in
   * any sense this handler should act on.
   */
  const onPointerLeave = useCallback(() => {
    const drag = dragRef.current
    // A mouse press is left alone: it arms by distance, and a press that strays over the sticky
    // header and back was always allowed to become a marquee.
    if (!drag || drag.dragged || !drag.hold) return
    hold.onPointerLeave()
    dragRef.current = null
  }, [hold])

  // The pan guard. `touch-action` is decided when the touch starts, and at that moment this touch
  // is a scroll — it becomes a marquee only once held — so the scroll has to be refused per move
  // instead, and only a non-passive listener can refuse it. Registered natively: React's own
  // touch listeners are passive, so an `onTouchMove` prop could not call `preventDefault`. On the
  // scroller rather than the rows wrapper because that is the element the pan belongs to. It
  // prevents nothing while no marquee is live, which is the whole time a mouse is in use.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const guard = (e: TouchEvent) => {
      if (dragRef.current?.dragged) e.preventDefault()
    }
    scroller.addEventListener('touchmove', guard, { passive: false })
    return () => scroller.removeEventListener('touchmove', guard)
  }, [scrollRef])

  useEffect(
    () => () => {
      stopAutoScroll()
      // A grid that unmounts mid-drag would otherwise leave the consumer believing one is still
      // in flight, and the selection bar holding a place for a gesture that has gone.
      setDragging(false)
      // And a grid that unmounts mid-*hold* must not arm afterwards: `useLongPress` cancels its
      // own timer on unmount, but this ref is what `onLongPress` would read if it fired, so the
      // press is dropped here too. The unmount is reachable with a finger down — the table
      // leaves the tree whenever the container's row list empties, which a live channel push
      // can do under `onlyLit`.
      if (dragRef.current?.hold) hold.onPointerCancel()
      dragRef.current = null
    },
    [hold, setDragging, stopAutoScroll],
  )

  return { band, chip, rowCount, dragging, onPointerDown, onPointerMove, onPointerUp, onPointerLeave }
}

interface RowViewProps {
  row: Row
  visibleColumns: readonly ColumnKey[]
  gridTemplateColumns: string
  selected: boolean
  onRowClick: (id: RowId, e: React.MouseEvent) => void
  onToggleExpand: (row: GroupRow | FixtureRow) => void
  onBeginCellEdit: (row: Row, col: ColumnKey) => void
  onCellCommit: (row: Row, col: ColumnKey, commit: CellCommit) => void
  batchCountFor: (row: Row, col: ColumnKey) => number
  onShowInfo: (row: InfoRow) => void
  showOwnership: boolean
  cellSelection?: CellSelection
  /**
   * The desk is reachable. A cell edit in the `live` editor context is a `programmer.*`
   * WebSocket write, so with the socket down it goes nowhere — and because the grid reads its
   * values back from the server, the cell simply snaps to its old value with nothing said. The
   * cells go inert instead. Layer scope is unaffected: those edits land in a local Look draft.
   *
   * Read once by the table and passed down rather than read per row — a rig fills this grid.
   */
  deskConnected: boolean
  /**
   * The container asked for this row's cell in this column to open its editor — Enter over the
   * selection, or the selection bar's Set — and null on every other row, which is all of them but
   * one, so the memo still holds for the rest of the grid.
   */
  autoOpenCol: ColumnKey | null
  /**
   * That request came from a character typed at the grid, which the editor seeds its first field
   * with. `''` for a bare Enter or the bar's Set, and null for every row but the named one.
   */
  autoOpenSeed: string | null
  /** Nothing is selected — any open cell editor in this row must go. See `useCellEditorOpen`. */
  selectionEmpty?: boolean
}

const NO_INERT_COLUMNS: ReadonlySet<ColumnKey> = new Set()

/**
 * Which column *headers* the focused layer does not assert.
 *
 * Derived from the layer's `propertyMask` and the column's own canonical category, because a header
 * has no fixture to classify against — the cells beneath it still use each resolution's real
 * descriptor, so one column carrying different property kinds across fixture types is classified
 * per fixture where it matters. Empty outside layer scope, so the two plain list routes are
 * untouched.
 */
function useInertColumns(visibleColumns: readonly ColumnKey[]): ReadonlySet<ColumnKey> {
  const scope = useProgrammerScope()
  const store = useLookRowStore()
  const mask = store?.propertyMask
  const inLayerScope = scope?.kind === 'layer'
  return useMemo(() => {
    if (!inLayerScope) return NO_INERT_COLUMNS
    const families = parsePropertyMask(mask)
    if (families.length === 0) return NO_INERT_COLUMNS
    return new Set(visibleColumns.filter((col) => !families.includes(columnFamily(col))))
  }, [inLayerScope, mask, visibleColumns])
}

/** Name-cell indent per nesting depth (member rows 1, element rows 2). */
const INDENT_CLASS = ['', 'ml-5', 'ml-10']

/** Stable identity for the ownership-off path, so the hook's memos never churn. */
const EMPTY_CELLS: RowCell[] = []

const RowView = React.memo(function RowView({
  row,
  visibleColumns,
  gridTemplateColumns,
  selected,
  onRowClick,
  onToggleExpand,
  onBeginCellEdit,
  onCellCommit,
  batchCountFor,
  onShowInfo,
  showOwnership,
  cellSelection,
  deskConnected,
  autoOpenCol,
  autoOpenSeed,
  selectionEmpty,
}: RowViewProps) {
  // Hooks run unconditionally; divider rows just have no cells.
  const cells = useMemo(() => buildRowCells(row, visibleColumns), [row, visibleColumns])
  // Always the live wire read: it is what the editor opens at, so a busk begins where the rig is
  // even in a scope that displays an em-dash. Free when the scope is Output, which reads the same
  // values through this same hook.
  const liveValues = useRowValues(cells)
  const scoped = useScopedRowValues(cells, liveValues)
  const scope = useProgrammerScope()
  // A cell edit reaches the wire in every context but `lookLayer`, where it lands in the Look row
  // draft instead. Derived from the context rather than from `scope.kind === 'layer'` so it cannot
  // disagree with `useCellWriters`, which routes on exactly this — layer scope without a row store
  // is still a live write.
  const editorContext = useEditorContext()
  const cellsInert = !deskConnected && editorContext.kind === 'live'
  // Passing an empty cell list is the "off" state: useRowOwnership then registers no
  // subscriptions and returns a constant, so the plain list views pay nothing for this.
  //
  // Layer scope switches it off too, and for a different reason: the engine's provenance describes
  // the *rig*, and what is on screen there is a Look's stored rows. A cue-blue ring around a row
  // in a library entity would be answering a question nobody asked. Its own tones say what matters
  // — outside the mask, outside the targets — via `layerCellClass`.
  const ownershipCells = showOwnership && scope?.kind !== 'layer' ? cells : EMPTY_CELLS
  const ownership = useRowOwnership(ownershipCells)
  // A focused **effect** template layer marks the cells its effect drives. Those are exactly the
  // cells `useScopedRowValues` gave a value to in that scope, so the test below is `state?.value`
  // rather than a second mask/target computation that could disagree with the one that painted the
  // ring. The label is null where the effect type no longer resolves in the registry — the wave
  // still draws, because "an effect drives this" is true whether or not its speed can be read.
  const focusedTemplate = useFocusedTemplateLayer()
  const effectDriven = scope?.kind === 'layer' && focusedTemplate?.kind === 'effect'
  const templateEffect = focusedTemplate?.template?.effect
  const effectDivision =
    templateEffect == null
      ? null
      : effectSpeedLabel(templateEffect.beatDivision, templateEffect.timingSource)
  const cellByCol = useMemo(() => new Map(cells.map((cell) => [cell.col, cell])), [cells])
  // Every fixture this row covers — a group row's members, a fixture row's own key. The same
  // expansion the cells were resolved through, so "is this row in the layer's targets?" and "what
  // would an edit here write?" cannot disagree.
  const rowTargetKeys = useMemo(
    () => [...new Set(cells.flatMap((cell) => cell.targetKeys))],
    [cells],
  )

  if (row.kind === 'divider') {
    return (
      // `data-row-id` here too: the scroller's background-click test reads it, and a divider is a
      // row of the list, not empty space — a tap on "Ungrouped" must not drop the selection.
      <div
        className="flex h-full items-center border-b border-border bg-muted/30 px-2"
        data-row-id={row.id}
      >
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {row.label}
        </span>
      </div>
    )
  }

  const isGroup = row.kind === 'group'
  const isElement = row.kind === 'element'
  const elementCount = row.kind === 'fixture' ? (row.fixture.elements?.length ?? 0) : 0
  // Multi-head fixture rows expand like group rows do.
  const expandable = isGroup || (row.kind === 'fixture' && elementCount > 0)
  const isExpanded = row.kind !== 'element' && row.isExpanded
  // Member rows indent one level; element rows one more than their parent.
  const indentLevel =
    (row.kind !== 'group' && row.parentGroup !== undefined ? 1 : 0) + (isElement ? 1 : 0)
  const rowName = isGroup
    ? row.name
    : isElement
      ? row.element.displayName
      : row.fixture.name
  // Element display names are generic ("Head 1"); accessible names and locate
  // labels qualify them with the owning fixture so two expanded bars stay
  // distinguishable.
  const qualifiedName = isElement ? `${row.fixture.name} ${row.element.displayName}` : rowName
  const badgeCount = isGroup ? row.members.length : elementCount > 0 ? elementCount : undefined
  const locate = rowLocateTarget(row)

  // **Selection is neutral** (space plan D4). The wash was `bg-primary/10` — the same accent, at
  // nearly the same strength, as the `programmer` ownership ring sitting inside it — so a row you
  // had selected and a row you owned every value of were one picture. `--primary` now means
  // exactly one thing on this grid, "you own this value", and everything that means "selected" is
  // a neutral: a `foreground/6%` wash, a 3px foreground left edge, a bold name. The edge is drawn
  // on the sticky cell's overlay rather than here; see below for why.
  return (
    <div
      className={`group/row grid h-full border-b border-border text-sm ${
        selected ? 'bg-foreground/[0.06]' : 'hover:bg-accent/30'
      }`}
      style={{ gridTemplateColumns }}
      data-state={selected ? 'selected' : undefined}
      // With `data-cell` on each value cell, this is how the container finds the DOM cell to anchor
      // the marquee's typed-value editor at, without the table knowing that editor exists.
      data-row-id={row.id}
    >
      {/* Name cell (sticky left, carries selection affordances) */}
      <div
        className="sticky left-0 z-10 flex h-full cursor-pointer items-center gap-1.5 bg-background px-2"
        onClick={(e) => onRowClick(row.id, e)}
      >
        {/* Selection tint needs to survive the opaque sticky background — and so does the 3px
            edge, which is why it is here and not on the row. An inset shadow on the row paints on
            the row's own background layer, underneath every child, and this cell's `bg-background`
            is opaque: the edge would have been invisible at exactly the widths the name column is
            pinned at, which is all of them. Drawn on the overlay it sits above that background and
            below the name, which is where a selection edge belongs. */}
        <div
          className={`pointer-events-none absolute inset-0 ${
            selected
              ? 'bg-foreground/[0.06] shadow-[inset_3px_0_0_var(--foreground)]'
              : 'group-hover/row:bg-accent/30'
          }`}
        />
        {/* There was a checkbox here — the accumulating half of row selection, beside a name click
            that replaced. It went when the row and cell selections became one: a drag from this
            column selects rows now (`useCellMarquee`), ⌘-click still toggles, and a box that said
            "this row is selected" beside cells that say the same thing with an outline was two
            vocabularies for one fact. The indent it carried moves to the name.

            It was also the row's one tabbable, screen-reader-announced selector, and nothing here
            replaces it per row — decided, not overlooked: the keyboard path is the window-level
            ⌘A, ↑/↓ (Shift extends) and →/← (open and close the anchor row) in
            `FixturesListContainer`; the first two existed alongside the checkbox and are the
            whole of it now. A tabbable name cell would put a stop per row in
            the tab order for a gesture those keys already cover. */}
        {indentLevel > 0 && (
          <span aria-hidden="true" className={`shrink-0 ${INDENT_CLASS[indentLevel] ?? ''}`} />
        )}
        {/* `expandable` already narrows row to GroupRow | FixtureRow. */}
        {expandable && (
          <button
            type="button"
            className="relative shrink-0 rounded p-0.5 hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(row)
            }}
            aria-label={isExpanded ? `Collapse ${rowName}` : `Expand ${rowName}`}
          >
            {isExpanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
          </button>
        )}
        {/* `font-semibold` when selected is the third of D4's three neutral signals, and the one
            that survives a colour-blind read and a badly calibrated house monitor: a 6% wash and a
            3px edge are both easy to lose, weight is not. It beats a group row's `font-medium`
            deliberately — selected is the louder fact. */}
        <span
          className={cn(
            'relative min-w-0 flex-1 truncate',
            isElement && 'text-muted-foreground',
            selected ? 'font-semibold' : isGroup && 'font-medium',
          )}
        >
          {rowName}
        </span>
        {badgeCount !== undefined && (
          <Badge variant="secondary" className="relative shrink-0 px-1 text-[10px]">
            {badgeCount}
          </Badge>
        )}
        {/* Hover actions: the span's stopPropagation keeps both buttons from
            reaching the name cell's selection click. focus-within keeps the
            buttons tabbable — once anything in the row has focus they display,
            entering the tab order for keyboard users. */}
        {locate && (
          <span
            className="relative hidden shrink-0 items-center gap-0.5 group-hover/row:inline-flex group-focus-within/row:inline-flex"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => onShowInfo(row)}
                  aria-label={`Details for ${qualifiedName}`}
                >
                  <Info className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Details for {qualifiedName}</TooltipContent>
            </Tooltip>
            <LocateButton type={locate.type} targetKey={locate.key} name={qualifiedName} iconOnly />
            {/* Renders nothing outside layer scope, and nothing for a row the layer already
                targets — so this span is unchanged on the two plain list routes. Element rows are
                left out: a Look row addresses the fixture, not one of its elements. */}
            {!isElement && (
              <AddToTargetsButton
                target={locate}
                fixtureKeys={rowTargetKeys}
                name={qualifiedName}
              />
            )}
          </span>
        )}
      </div>

      {/* Property cells */}
      {visibleColumns.map((col) => {
        const cell = cellByCol.get(col)
        // The live value is what the editor opens at; `state.value` is what the cell displays.
        // No live value means the column resolves to nothing on this fixture — a blank, not an
        // em-dash, because there is nothing here to set.
        const live = liveValues[col]
        const state = scoped[col]
        if (!cell || !live) {
          return <div key={col} className="h-full" />
        }
        const owned = ownership[col]
        const layer = owned?.layer
        // Layered OVER whatever ownership produced, as a fill rather than a seventh ring colour —
        // see `cellSelection.ts`.
        const selectedCell = cellSelection?.isSelected(row.id, col)
        return (
          <div
            key={col}
            data-cell={col}
            className={cn(
              // The **marks gutter** (space plan D5). The value inside a cell is centred across the
              // whole width, and the effect badge and the layer glyph float over its right-hand
              // end — so a colour cell reading `255,157,74` had its last characters under a violet
              // wave badge, and the operator could not tell `74` from `7` on the one cell the
              // badge is there to draw attention to.
              //
              // **18px, not the plan's `pr-4`.** The widest mark is the effect badge at
              // `size-3.5` (14px), inset `right-1` (4px) — 18px from the edge — so a 16px gutter
              // left it overlapping the last 2px of the value's own space, which is the defect
              // D5 was written to remove. 18px is also what the artboard reserves
              // (`Main.dc.html`'s `.ci { padding: 0 18px 0 6px }`); the plan's `pr-4` was a
              // rounding of it that nobody checked against the badge's own size. Any new mark has
              // to fit `right-1` plus its own width inside this number, or widen both together.
              //
              // It goes on the *wrapper* rather than inside `PropertyCell`: padding is inside the
              // border box, so the ownership ring and the selection outline still trace the full
              // cell, and absolutely-positioned marks still measure `right` from the same edge
              // they always did. Only the content moves. That is the same choice
              // `ownershipCellClass` documents — the four cell editors encode value shape, and a
              // gutter carved inside one of them would have to be carved four times.
              //
              // The one mark it does **not** contain is the focused-template layer's division
              // label below: that is an icon *plus* text ("½", "1/4"), so no fixed gutter sized
              // for a badge could hold it. It is better off than before — it had no gutter at all
              // — and it draws only in a focused *template* layer, where ownership is switched off
              // and the corner is otherwise empty. Containing it would mean a scope-dependent
              // gutter, which is a design decision rather than a rounding fix.
              'relative h-full min-w-0 py-0.5 pr-[18px]',
              ownershipCellClass(owned),
              layerCellClass(scope?.kind === 'layer' ? state : undefined),
              cellSelectionClass(selectedCell === true),
              // Output is a read of the cook. Editing it would have to pick a destination, and
              // choosing one is what the scope switcher is for — so the cell reads and the
              // overlay button below takes the click instead.
              state?.editable === false && 'pointer-events-none',
              // Same mechanism as the read-only Output cell above, for a different reason: this
              // cell would take the edit and drop it. `OwnerJumpOverlay` sets `pointer-events-auto`
              // and so still navigates — reading why a cell is what it is stays available offline.
              cellsInert && 'pointer-events-none opacity-60',
            )}
            // Only when the *connection* is why this cell is inert. A cell that Output scope has
            // already made read-only stays inert after a reconnect, so blaming the socket there
            // would send the operator to fix the wrong thing.
            title={
              cellsInert && state?.editable !== false
                ? DESK_OFFLINE_LABEL
                : ownershipTitle(owned)
            }
          >
            {/* The winning Look layer, layered around the cell rather than inside it — the same
                choice `ownershipCellClass` documents. The four cell editors already encode value
                shape, and a marker drawn inside one of them would have to be drawn four times.
                It used to share the cell with a `ref:` marker (a left rail plus a `Link2` in the
                *opposite* corner, so the two icons stayed readable together); that retired with the
                grammar in session 4, so this glyph now has the cell to itself. Title-only detail —
                the hover text names the look, and a name would not fit here at this density. */}
            {layer && (
              <Layers
                className={`pointer-events-none absolute bottom-0.5 right-1 size-2.5 ${
                  layer.mixed ? 'text-muted-foreground/50' : 'text-muted-foreground'
                }`}
              />
            )}
            {/* An effect-driven cell wears the FX wave as a badge, top-right — the opposite corner
                from the Layers glyph, so a cell that is both (a Look layer's effect) shows both.
                The violet ring on its own was too quiet beside the blue ones: at a glance a cell
                the effect is animating and a cell you set read as one picture, and "this value is
                moving and Record will not take it" is the fact the operator most needs to see
                without hovering. A badge and not a louder ring, because the ring vocabulary is
                six colours already and a seventh weight would not have said *effect*. */}
            {owned?.source === 'effect' && (
              <span
                data-testid="effect-badge"
                className="pointer-events-none absolute right-1 top-0.5 flex size-3.5 items-center justify-center rounded-sm bg-violet-500/90 text-white"
              >
                <AudioWaveform className="size-2.5" />
              </span>
            )}
            {/* The same corner, and never both: ownership is switched off in layer scope, so the
                glyph above is undefined exactly where this one draws. Around the cell rather than
                inside it, for the reason that one documents — the four cell editors encode value
                shape, and a marker drawn inside one of them would have to be drawn four times. */}
            {effectDriven && state?.value != null && (
              <span
                className="pointer-events-none absolute bottom-0.5 right-1 flex items-center gap-0.5 text-[9px] leading-none text-muted-foreground"
                title={`Driven by “${focusedTemplate?.name ?? 'this template'}”`}
              >
                <AudioWaveform className="size-2.5" />
                {effectDivision}
              </span>
            )}
            <PropertyCell
              cell={cell}
              label={columnLabel(col)}
              // The staged overlay is applied to whatever the scope resolved, not only to the live
              // read: in Output — where `state.value` is always set — short-circuiting past
              // `applyStagedValue` dropped the optimistic feedback for a write still in flight, and
              // that cell then sat on its old value until the wire caught up. In layer scope
              // ownership is switched off, so `owned` is undefined there and this is a no-op.
              value={applyStagedValue(
                state?.value ?? live,
                owned?.staged,
                cell.resolutions,
              )}
              // Not `state == null`: a divider or a scope with no opinion is not the same as a
              // scope that has one and says "nothing here".
              placeholder={state !== undefined && state.value === undefined}
              batchCount={batchCountFor(row, col)}
              // Belt and braces with the wrapper's `pointer-events-none` below: that stops the
              // mouse, this stops the keyboard. The trigger is tabbable, so Tab-then-Enter would
              // otherwise walk straight past the guard and open an editor whose commit is dropped.
              //
              // **Both reasons a cell takes no edit, not just the offline one.** `editable: false`
              // is the *scope's* statement — Output is a read of the cook, and a focused template
              // layer is a read of a template — and it reached only the pointer. A commit through
              // the keyboard hole did not get dropped: `useCellWriters` has no scope arm for either
              // (a template layer mints no `lookLayer` context), so it landed in Local, on a grid
              // drawing itself as read-only.
              disabled={cellsInert || state?.editable === false}
              autoOpen={autoOpenCol === col}
              keyboardSeed={autoOpenCol === col ? autoOpenSeed : null}
              selectionEmpty={selectionEmpty}
              onBeginEdit={() => onBeginCellEdit(row, col)}
              onCommit={(commit) => onCellCommit(row, col, commit)}
            />
            {scope?.kind === 'output' && <OwnerJumpOverlay owned={owned} />}
          </div>
        )
      })}
    </div>
  )
})

/**
 * In Output scope, a cell's tint is a *destination*: clicking it points the grid at whatever won
 * the cell. That is what finally makes the ownership colours navigational rather than decorative,
 * and it is why they were worth making learnable.
 *
 * An overlay rather than a change to the four cell editors. All four are Popover triggers, and the
 * marquee's whole design turns on click-versus-drag (`useCellMarquee`); pressing the jump into each
 * of them would mean four chances to break that. `pointer-events-none` on the cell content above
 * makes this the only thing under the cursor, while `pointerdown` still bubbles to the rows wrapper
 * so drag-select is untouched.
 *
 * **`pointer-events-auto` is mandatory here**, and its absence is invisible to a test.
 * `pointer-events` is an *inherited* property, so the wrapper's `pointer-events-none` — the very
 * thing that clears the cursor's path to this overlay — reaches this button too and made the jump
 * inert in a real browser. `fireEvent.click` dispatches straight at the node and never consults it,
 * so the suite passed throughout.
 *
 * Renders nothing when there is nowhere to go, so the cursor never promises a jump it won't make:
 * a `mixed` cell has no single owner to name, and a `layerId` belonging to a **cue's** layer is not
 * in this programmer's stack — `focusLayer` reports that and the click falls through.
 */
function OwnerJumpOverlay({ owned }: { owned?: CellOwnership }) {
  const actions = useProgrammerScopeActions()
  const layer = owned?.layer
  const layerId = layer && !layer.mixed ? layer.layerId : undefined
  const toLocal = layerId == null && owned?.source === 'programmer'
  if (!actions || (layerId == null && !toLocal)) return null

  const label = toLocal
    ? 'Show your own values'
    : `Show the look layer that set this${layer?.name ? ` — ${layer.name}` : ''}`

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="pointer-events-auto absolute inset-0 cursor-zoom-in rounded-sm focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => {
        if (layerId != null && actions.focusLayer(layerId)) return
        if (toLocal) actions.setScope({ kind: 'local' })
      }}
    />
  )
}

function PropertyCell({
  cell,
  label,
  value,
  placeholder,
  batchCount,
  disabled,
  autoOpen,
  keyboardSeed,
  selectionEmpty,
  onBeginEdit,
  onCommit,
}: {
  cell: RowCell
  /**
   * The column's display name. Only the *sheet* form of a cell editor shows it — a popover has no
   * header — but it is threaded from here rather than derived in the cells, because a cell is
   * given a `CellResolution` and not a `ColumnKey`, and one `slider` cell is a dimmer where the
   * next is an iris. See `CellEditorSurface`.
   */
  label: string
  /**
   * What the editor opens at. In a scope that holds nothing here this is still the *live* value,
   * with [placeholder] suppressing its display — so clicking an em-dash starts the slider where
   * the rig is rather than at zero.
   */
  value: NonNullable<ReturnType<typeof useRowValues>[ColumnKey]>
  placeholder?: boolean
  batchCount: number
  /** The desk is unreachable, so an edit here would go nowhere. */
  disabled: boolean
  /**
   * Open this cell's editor without a click — the container's request (Enter over the selection,
   * or the bar's Set), and nothing else.
   *
   * Threaded to all four rather than solved once above them because the popover is each editor's
   * own — and because `CueValueGrid` mounts these same four components with no table over them.
   * The rule itself is shared, in `useCellEditorOpen`. A [disabled] cell ignores it, so Output
   * scope, a focused template layer and an unreachable desk stay read-only through this door as
   * much as through the pointer.
   */
  autoOpen: boolean
  /**
   * That open came from a character typed at the grid, which the editor seeds its first field
   * with — see `useCellEditorKeyboard`. `''` for a bare Enter or Set; null for a click.
   */
  keyboardSeed: string | null
  /** Nothing is selected, so an open editor here has lost what it was editing for. */
  selectionEmpty?: boolean
  onBeginEdit: () => void
  onCommit: (commit: CellCommit) => void
}) {
  switch (value.kind) {
    case 'slider':
      return (
        <SliderCell
          value={value}
          resolutions={cell.resolutions}
          label={label}
          batchCount={batchCount}
          placeholder={placeholder}
          disabled={disabled}
          autoOpen={autoOpen}
          keyboardSeed={keyboardSeed}
          selectionEmpty={selectionEmpty}
          onCommit={onCommit}
          onBeginEdit={onBeginEdit}
        />
      )
    case 'colour':
      return (
        <ColourCell
          value={value}
          resolutions={cell.resolutions}
          label={label}
          batchCount={batchCount}
          placeholder={placeholder}
          disabled={disabled}
          autoOpen={autoOpen}
          keyboardSeed={keyboardSeed}
          selectionEmpty={selectionEmpty}
          onCommit={onCommit}
          onBeginEdit={onBeginEdit}
        />
      )
    case 'position':
      return (
        <PositionCell
          value={value}
          resolutions={cell.resolutions}
          label={label}
          batchCount={batchCount}
          placeholder={placeholder}
          disabled={disabled}
          autoOpen={autoOpen}
          keyboardSeed={keyboardSeed}
          selectionEmpty={selectionEmpty}
          onCommit={onCommit}
          onBeginEdit={onBeginEdit}
        />
      )
    case 'setting':
      return (
        <SettingCell
          value={value}
          resolutions={cell.resolutions}
          label={label}
          batchCount={batchCount}
          placeholder={placeholder}
          disabled={disabled}
          autoOpen={autoOpen}
          keyboardSeed={keyboardSeed}
          selectionEmpty={selectionEmpty}
          onCommit={onCommit}
          onBeginEdit={onBeginEdit}
        />
      )
  }
}
