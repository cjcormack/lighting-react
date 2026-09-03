import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AudioWaveform, ChevronDown, ChevronRight, Info, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LocateButton } from '../fixtures/LocateButton'
import { COLUMN_DEFS, columnFamily } from './columns'
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

/** How close to an edge the pointer must get before the marquee scrolls the list. */
const AUTOSCROLL_EDGE_PX = 24
const AUTOSCROLL_SPEED_PX = 14


/** Sticky name column: 260px on a desktop, but never more than 45% of a narrow viewport. */
const NAME_COLUMN_WIDTH = 'min(45vw, 260px)'

export interface FixturesTableProps {
  rows: Row[]
  visibleColumns: readonly ColumnKey[]
  isSelected: (id: RowId) => boolean
  /** Name-cell or checkbox click — the caller derives the intent from the
   *  mouse event; a checkbox click defaults to toggle instead of replace. */
  onRowClick: (id: RowId, e: React.MouseEvent, viaCheckbox?: boolean) => void
  onToggleExpand: (row: GroupRow | FixtureRow) => void
  /** A cell editor is opening on this cell — the caller adjusts the selection. */
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
   * Drag-select across cells. Absent on the two plain list routes, which have no use for an edit
   * scope narrower than a row.
   */
  cellSelection?: CellSelection
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
  cellSelection,
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

  const marquee = useCellMarquee({
    scrollRef,
    rows,
    visibleColumns,
    cellSelection,
  })

  const columnLabelFor = useCallback(
    (col: ColumnKey) => COLUMN_DEFS.find((d) => d.key === col)?.label ?? col,
    [],
  )

  const inertColumns = useInertColumns(visibleColumns)

  return (
    <div
      ref={scrollRef}
      className={cn(
        'overflow-auto rounded-md border border-border',
        // `fill` is the programmer, whose grid owns the remaining height of a full-page view. The
        // viewport cap is tuned for a list embedded in a scrolling page and leaves dead air there.
        fill && 'min-h-0 flex-1',
      )}
      style={fill ? undefined : { maxHeight: 'calc(100vh - 14rem)' }}
    >
      <div style={{ minWidth: `calc(${NAME_COLUMN_WIDTH} + ${visibleColumns.length * 96}px)` }}>
        {/* Header */}
        <div
          data-grid-header
          className="sticky top-0 z-20 grid border-b border-border bg-background"
          style={{ gridTemplateColumns }}
        >
          <div className="sticky left-0 z-10 bg-background px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
            sticky header is excluded by geometry rather than by a hit test. */}
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
          onPointerDown={marquee.onPointerDown}
          onPointerMove={marquee.onPointerMove}
          onPointerUp={marquee.onPointerUp}
          onPointerCancel={marquee.onPointerUp}
        >
          {marquee.band && (
            <div
              aria-hidden="true"
              data-testid="cell-marquee"
              className="pointer-events-none absolute z-30 rounded-sm border-[1.5px] border-dashed border-primary bg-primary/[0.13]"
              style={marquee.band}
            >
              <span className="absolute -left-px -top-px size-[7px] bg-primary" />
              <span className="absolute -bottom-px -right-px size-[7px] bg-primary" />
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
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Scope chip, following the pointer. `fixed`, so it is never clipped by the scroller, and
          `pointer-events-none` so it can sit under the cursor without eating the drag.

          PORTALLED to `document.body`, which is load-bearing rather than tidiness: its coordinates
          are the pointer's `clientX/clientY`, i.e. viewport space, and `ProgrammerWorkspace` — the
          only host that enables cell selection — is a Tailwind `@container`. `container-type:
          inline-size` applies layout containment, which makes that element the containing block for
          `fixed` descendants, so an in-tree chip would be offset by the workspace's own top-left
          (the header, source strip, action bar and `p-4`) and sit well below the cursor. */}
      {marquee.chip &&
        cellSelection &&
        cellSelection.count > 0 &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground shadow-lg"
            style={{ left: marquee.chip.x + 12, top: marquee.chip.y + 12 }}
          >
            <span className="font-mono tabular-nums">
              {cellSelection.count} cell{cellSelection.count === 1 ? '' : 's'}
            </span>
            <span className="opacity-60">·</span>
            <span>{describeCellScope(cellSelection.cells, columnLabelFor)}</span>
          </div>,
          document.body,
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
 */
function useCellMarquee({
  scrollRef,
  rows,
  visibleColumns,
  cellSelection,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  rows: Row[]
  visibleColumns: readonly ColumnKey[]
  cellSelection?: CellSelection
}) {
  const [band, setBand] = useState<React.CSSProperties | null>(null)
  const [chip, setChip] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{
    pointerId: number
    start: { x: number; y: number }
    intent: ReturnType<typeof listSelectionIntentFor>
    dragged: boolean
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

  const hitsFor = useCallback(
    (endX: number, endY: number): CellRef[] => {
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
      const cols = columnRange(rect, bandsRef.current ?? [])
      if (cols.length === 0) return []

      const hits: CellRef[] = []
      for (let i = range[0]; i <= range[1]; i++) {
        const row = rowsRef.current[i]
        // Dividers hold no values, so they must not inflate the count.
        if (!row || row.kind === 'divider') continue
        for (const col of cols) hits.push({ rowId: row.id, col })
      }
      return hits
    },
    [scrollRef],
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
    selectionRef.current?.select(hitsFor(x, y), drag.intent)
  }, [hitsFor, scrollRef])

  // The rAF loop closes over its first `step`, so it reads the callback through a ref rather than
  // capturing a stale one.
  const updateFromPointerRef = useRef(updateFromPointer)
  updateFromPointerRef.current = updateFromPointer

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!selectionRef.current || e.button !== 0) return
      const scroller = scrollRef.current
      if (!scroller) return
      bandsRef.current = measureBands()
      headerHeightRef.current =
        scroller.querySelector('[data-grid-header]')?.getBoundingClientRect().height ?? 0
      const origin = scroller.getBoundingClientRect()
      const x = e.clientX - origin.left
      // Left of the first value column is the sticky name cell, which owns row selection.
      const first = bandsRef.current[0]
      if (!first || x < first.left) return
      dragRef.current = {
        pointerId: e.pointerId,
        start: { x, y: e.clientY - origin.top },
        intent: listSelectionIntentFor(e),
        dragged: false,
      }
    },
    [measureBands, scrollRef],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      const scroller = scrollRef.current
      if (!drag || !scroller) return
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
        stopAutoScroll()
        return
      }
      const origin = scroller.getBoundingClientRect()
      const x = e.clientX - origin.left
      const y = e.clientY - origin.top
      lastPosRef.current = { x, y }

      if (!drag.dragged) {
        if (Math.hypot(x - drag.start.x, y - drag.start.y) < DRAG_THRESHOLD_PX) return
        drag.dragged = true
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(drag.pointerId)
        } catch {
          // Safari throws when the pointer has already been released. Losing capture only means
          // the drag ends at the edge of the element, which is survivable.
        }
        // Start the edge-scroll loop only once a marquee actually exists. Without it a selection
        // can never exceed one viewport of rows, which on a real rig is the normal case.
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
      }

      e.preventDefault()
      setChip({ x: e.clientX, y: e.clientY })
      updateFromPointer()
    },
    [scrollRef, stopAutoScroll, updateFromPointer],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      dragRef.current = null
      setBand(null)
      setChip(null)
      stopAutoScroll()
      if (!drag) return
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(drag.pointerId)
      } catch {
        // Already released; nothing to undo.
      }
      if (!drag.dragged) return

      // Swallow the click this release is about to generate, or the cell under the pointer opens
      // its editor on top of the selection just made.
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault()
        ev.stopPropagation()
        window.removeEventListener('click', swallow, true)
      }
      window.addEventListener('click', swallow, true)
      // A drag that ends outside the document generates no click at all; without this the listener
      // would sit there and eat the operator's next one.
      window.setTimeout(() => window.removeEventListener('click', swallow, true), 0)
    },
    [stopAutoScroll],
  )

  useEffect(() => stopAutoScroll, [stopAutoScroll])

  return { band, chip, onPointerDown, onPointerMove, onPointerUp }
}

interface RowViewProps {
  row: Row
  visibleColumns: readonly ColumnKey[]
  gridTemplateColumns: string
  selected: boolean
  onRowClick: (id: RowId, e: React.MouseEvent, viaCheckbox?: boolean) => void
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

/** Checkbox indent per nesting depth (member rows 1, element rows 2). */
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
      <div className="flex h-full items-center border-b border-border bg-muted/30 px-2">
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

  return (
    <div
      className={`group/row grid h-full border-b border-border text-sm ${
        selected ? 'bg-primary/10' : 'hover:bg-accent/30'
      }`}
      style={{ gridTemplateColumns }}
      data-state={selected ? 'selected' : undefined}
    >
      {/* Name cell (sticky left, carries selection affordances) */}
      <div
        className="sticky left-0 z-10 flex h-full cursor-pointer items-center gap-1.5 bg-background px-2"
        onClick={(e) => onRowClick(row.id, e)}
      >
        {/* Selection tint needs to survive the opaque sticky background. */}
        <div
          className={`pointer-events-none absolute inset-0 ${
            selected ? 'bg-primary/10' : 'group-hover/row:bg-accent/30'
          }`}
        />
        <input
          type="checkbox"
          checked={selected}
          onChange={() => undefined}
          onClick={(e) => {
            e.stopPropagation()
            onRowClick(row.id, e, true)
          }}
          className={`relative size-3.5 shrink-0 accent-primary ${INDENT_CLASS[indentLevel] ?? ''}`}
          aria-label={`Select ${qualifiedName}`}
        />
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
        <span
          className={`relative min-w-0 flex-1 truncate ${
            isGroup ? 'font-medium' : isElement ? 'text-muted-foreground' : ''
          }`}
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
            buttons tabbable — once the row's checkbox has focus they display,
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
              'relative h-full min-w-0 py-0.5',
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
                className={`pointer-events-none absolute bottom-0.5 right-0.5 size-2.5 ${
                  layer.mixed ? 'text-muted-foreground/50' : 'text-muted-foreground'
                }`}
              />
            )}
            {/* The same corner, and never both: ownership is switched off in layer scope, so the
                glyph above is undefined exactly where this one draws. Around the cell rather than
                inside it, for the reason that one documents — the four cell editors encode value
                shape, and a marker drawn inside one of them would have to be drawn four times. */}
            {effectDriven && state?.value != null && (
              <span
                className="pointer-events-none absolute bottom-0.5 right-0.5 flex items-center gap-0.5 text-[9px] leading-none text-muted-foreground"
                title={`Driven by “${focusedTemplate?.name ?? 'this template'}”`}
              >
                <AudioWaveform className="size-2.5" />
                {effectDivision}
              </span>
            )}
            <PropertyCell
              cell={cell}
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
  value,
  placeholder,
  batchCount,
  disabled,
  onBeginEdit,
  onCommit,
}: {
  cell: RowCell
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
  onBeginEdit: () => void
  onCommit: (commit: CellCommit) => void
}) {
  switch (value.kind) {
    case 'slider':
      return (
        <SliderCell
          value={value}
          resolutions={cell.resolutions}
          batchCount={batchCount}
          placeholder={placeholder}
          disabled={disabled}
          onCommit={onCommit}
          onBeginEdit={onBeginEdit}
        />
      )
    case 'colour':
      return (
        <ColourCell
          value={value}
          resolutions={cell.resolutions}
          batchCount={batchCount}
          placeholder={placeholder}
          disabled={disabled}
          onCommit={onCommit}
          onBeginEdit={onBeginEdit}
        />
      )
    case 'position':
      return (
        <PositionCell
          value={value}
          resolutions={cell.resolutions}
          batchCount={batchCount}
          placeholder={placeholder}
          disabled={disabled}
          onCommit={onCommit}
          onBeginEdit={onBeginEdit}
        />
      )
    case 'setting':
      return (
        <SettingCell
          value={value}
          resolutions={cell.resolutions}
          batchCount={batchCount}
          placeholder={placeholder}
          disabled={disabled}
          onCommit={onCommit}
          onBeginEdit={onBeginEdit}
        />
      )
  }
}
