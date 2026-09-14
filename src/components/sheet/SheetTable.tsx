import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'
import { useScrollEdges } from '@/hooks/useScrollEdges'
import { useStableCallback } from '@/hooks/useStableCallback'
import { cellSelectionClass } from './cellSelection'
import { describeCellScope, type CellRef, type RowId } from './cellSelectionModel'
import { useCellMarquee } from './useCellMarquee'
import type { CellSelection } from './useCellSelection'
import type { CellOpenRequest } from './useCellEditorRequests'
import type { SheetCellProps, SheetColumn, SheetRow } from './sheetModel'

/** Every row of every sheet is 36px, the DMX sheet's 44 — see `rowHeight`. */
export const SHEET_ROW_HEIGHT = 36
/** The header: 30px, uppercase 11px tracked. */
const HEADER_CLASS =
  'px-1.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground'

export interface SheetTableProps<Row extends SheetRow, C extends string> {
  rows: readonly Row[]
  columns: readonly SheetColumn<Row, C>[]
  /**
   * The sticky first column: its header label, its track, what it draws for a row, and whether a
   * drag from it selects rows. The DMX sheet's row head is a label only — that grid is all cells,
   * so it has no row axis and a press on the head is a press on nothing.
   */
  firstColumn: {
    label: string
    width: string
    render: (row: Row, selected: boolean) => React.ReactNode
    selectsRows: boolean
  }
  /** The height of every row, dividers included. 36 everywhere but the DMX sheet's 44. */
  rowHeight?: number
  /** Fill the flex parent instead of the embedded-list viewport cap. */
  fill?: boolean
  /** Below this the table needs its columns' minimum widths; the sum of the tracks' floors. */
  minWidth?: string
  isSelected: (id: RowId) => boolean
  /** First-column click — the caller derives the intent from the mouse event. */
  onRowClick: (id: RowId, e: React.MouseEvent) => void
  /** A click landed on this cell: the caller selects the one cell. */
  onBeginCellEdit: (row: Row, col: C) => void
  /** A cell's editor committed: the caller fans it over the selection. */
  onCellCommit: (row: Row, col: C, value: unknown) => void
  /** How many rows a commit from this cell lands on. */
  batchCountFor: (row: Row, col: C) => number
  /** Those rows, in visible order — for an editor that previews its landing. */
  batchRowsFor: (row: Row, col: C) => readonly Row[]
  /** The surface has made this cell inert — a locked show, an offline desk. */
  cellDisabled?: (row: Row, col: C) => boolean
  /** Classes on the whole row — the cue sheet's live green and next blue. */
  rowClass?: (row: Row) => string | undefined
  cellSelection: CellSelection<C>
  onRowMarquee?: (ids: RowId[]) => void
  keyboardOpen?: CellOpenRequest<C> | null
  closeEditorCell?: CellRef<C> | null
  editorAnchorRef?: React.RefObject<HTMLElement | null>
  onMarqueeDragChange?: (dragging: boolean) => void
  onBackgroundClick?: () => void
  selectionEmpty?: boolean
  scrollToRowId?: RowId | null
  onScrolledToRow?: () => void
}

/**
 * The sheet every surface mounts: a 30px uppercase header, 36px rows, a sticky first column with
 * the selection bar in it, the marquee, the scope chip and the sideways-scroll fade
 * (CLAUDE.md §Sheet kit). It is `FixturesTable`'s anatomy with the fixture-specific half — the
 * row model, ownership, scope — left to that table; the two share `useCellMarquee`, the selection
 * models, the editor surface and the DOM contract (`data-grid-header`, `data-column-header`,
 * `data-grid-name-header`, `data-row-id`, `data-cell`) so the keyboard and the marquee address
 * cells on every sheet the same way.
 *
 * Plain CSS-grid divs rather than a `<table>` — table semantics fight row virtualization.
 */
export function SheetTable<Row extends SheetRow, C extends string>({
  rows,
  columns,
  firstColumn,
  rowHeight = SHEET_ROW_HEIGHT,
  fill = false,
  minWidth,
  isSelected,
  onRowClick,
  onBeginCellEdit,
  onCellCommit,
  batchCountFor,
  batchRowsFor,
  cellDisabled,
  rowClass,
  cellSelection,
  onRowMarquee,
  keyboardOpen,
  closeEditorCell,
  editorAnchorRef,
  onMarqueeDragChange,
  onBackgroundClick,
  selectionEmpty,
  scrollToRowId,
  onScrolledToRow,
}: SheetTableProps<Row, C>) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  })

  useEffect(() => {
    if (!scrollToRowId) return
    const index = rows.findIndex((row) => row.id === scrollToRowId)
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'center' })
      onScrolledToRow?.()
    }
  }, [scrollToRowId, rows, virtualizer, onScrolledToRow])

  const gridTemplateColumns = useMemo(
    () => `${firstColumn.width} ${columns.map((c) => c.width).join(' ')}`,
    [firstColumn.width, columns],
  )
  const visibleColumns = useMemo(() => columns.map((c) => c.key), [columns])
  const columnByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns])
  const labelFor = useCallback((col: C) => columnByKey.get(col)?.label ?? col, [columnByKey])

  // The one-shot open and close requests, dropped by this component rather than by the cell that
  // acts on them — see `FixturesTable`'s `autoOpenCell` for why a standing request is a trap.
  const [autoOpenCell, setAutoOpenCell] = useState<CellOpenRequest<C> | null>(null)
  useEffect(() => {
    if (autoOpenCell) setAutoOpenCell(null)
  }, [autoOpenCell])
  useEffect(() => {
    if (keyboardOpen) setAutoOpenCell({ ...keyboardOpen })
  }, [keyboardOpen])
  const [closeCell, setCloseCell] = useState<CellRef<C> | null>(null)
  useEffect(() => {
    if (closeCell) setCloseCell(null)
  }, [closeCell])
  useEffect(() => {
    if (closeEditorCell) setCloseCell({ ...closeEditorCell })
  }, [closeEditorCell])

  const onEmptyCellClick = useStableCallback(onBackgroundClick)

  const marquee = useCellMarquee<C, Row>({
    scrollRef,
    rows,
    rowHeight,
    isSelectableRow: (row) => row.divider == null,
    visibleColumns,
    cellSelection,
    isRowSelected: isSelected,
    onRowMarquee: firstColumn.selectsRows ? onRowMarquee : undefined,
    onDragChange: onMarqueeDragChange,
  })

  const { right: moreColumnsRight, attach: attachScroller } = useScrollEdges(scrollRef, {
    horizontalOnly: true,
  })

  return (
    <div className={cn('relative', fill && 'flex min-h-0 flex-1 flex-col')}>
      <div
        ref={attachScroller}
        className={cn(
          'overflow-auto',
          fill ? 'min-h-0 flex-1 border-t border-border' : 'rounded-md border border-border',
        )}
        style={fill ? undefined : { maxHeight: 'calc(100vh - 14rem)' }}
        onClick={(e) => {
          if (!onBackgroundClick) return
          const target = e.target as Element
          // React bubbles a synthetic event up the *React* tree, portals included — and every
          // cell editor is portalled to `body`. The DOM subtree is the question here.
          if (!e.currentTarget.contains(target)) return
          if (target.closest('[data-row-id], [data-grid-header]')) return
          onBackgroundClick()
        }}
      >
        <div style={{ minWidth }}>
          <div
            data-grid-header
            className="sticky top-0 z-20 grid border-b border-border bg-background"
            style={{ gridTemplateColumns }}
          >
            <div
              // The marquee measures the first column from this — see `useCellMarquee`. A sheet
              // whose first column selects no rows hangs no name header, and every press is a cell
              // press.
              {...(firstColumn.selectsRows ? { 'data-grid-name-header': true } : {})}
              className={cn('sticky left-0 z-10 bg-background px-2', HEADER_CLASS)}
            >
              {firstColumn.label}
            </div>
            {columns.map((column) => (
              <div
                key={column.key}
                // The marquee measures its bands from this mark — see `useCellMarquee` — so a
                // read-out column hangs none: a rectangle over Book or Type selects nothing there,
                // rather than cells with no editor that inflate the count and refuse Clear.
                {...(column.cell != null ? { 'data-column-header': column.key } : {})}
                className={cn(HEADER_CLASS, column.align === 'right' && 'text-right')}
              >
                {column.label}
              </div>
            ))}
          </div>

          <div
            className="select-none touch-manipulation [-webkit-touch-callout:none]"
            style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
            onPointerDown={marquee.onPointerDown}
            onPointerMove={marquee.onPointerMove}
            onPointerUp={marquee.onPointerUp}
            onPointerCancel={marquee.onPointerUp}
            onPointerLeave={marquee.onPointerLeave}
          >
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
                  style={{ height: `${rowHeight}px`, transform: `translateY(${virtualRow.start}px)` }}
                >
                  <SheetRowView
                    row={row}
                    columns={columns}
                    firstColumn={firstColumn}
                    gridTemplateColumns={gridTemplateColumns}
                    selected={row.divider == null && isSelected(row.id)}
                    rowClass={rowClass?.(row)}
                    onRowClick={onRowClick}
                    onBeginCellEdit={onBeginCellEdit}
                    onCellCommit={onCellCommit}
                    batchCountFor={batchCountFor}
                    batchRowsFor={batchRowsFor}
                    cellDisabled={cellDisabled}
                    cellSelection={cellSelection}
                    autoOpenCol={autoOpenCell?.rowId === row.id ? autoOpenCell.col : null}
                    autoOpenSeed={autoOpenCell?.rowId === row.id ? autoOpenCell.seed : null}
                    autoOpenAtButton={autoOpenCell?.rowId === row.id && autoOpenCell.atButton}
                    autoCloseCol={closeCell?.rowId === row.id ? closeCell.col : null}
                    selectionEmpty={selectionEmpty}
                    editorAnchorRef={editorAnchorRef}
                    onEmptyCellClick={onEmptyCellClick}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* The scope chip, following the pointer. Portalled to `body` so a `@container` ancestor
            cannot become its containing block — see `FixturesTable`. */}
        {marquee.chip &&
          (marquee.rowCount != null ? marquee.rowCount > 0 : cellSelection.count > 0) &&
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
                    {cellSelection.count} cell{cellSelection.count === 1 ? '' : 's'}
                  </span>
                  <span className="opacity-60">·</span>
                  <span>{describeCellScope(cellSelection.cells, labelFor)}</span>
                </>
              )}
            </div>,
            document.body,
          )}
      </div>
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

interface SheetRowViewProps<Row extends SheetRow, C extends string> {
  row: Row
  columns: readonly SheetColumn<Row, C>[]
  firstColumn: SheetTableProps<Row, C>['firstColumn']
  gridTemplateColumns: string
  selected: boolean
  rowClass?: string
  onRowClick: (id: RowId, e: React.MouseEvent) => void
  onBeginCellEdit: (row: Row, col: C) => void
  onCellCommit: (row: Row, col: C, value: unknown) => void
  batchCountFor: (row: Row, col: C) => number
  batchRowsFor: (row: Row, col: C) => readonly Row[]
  cellDisabled?: (row: Row, col: C) => boolean
  cellSelection: CellSelection<C>
  autoOpenCol: C | null
  autoOpenSeed: string | null
  autoOpenAtButton: boolean
  autoCloseCol: C | null
  selectionEmpty?: boolean
  editorAnchorRef?: React.RefObject<HTMLElement | null>
  onEmptyCellClick: () => void
}

function SheetRowViewInner<Row extends SheetRow, C extends string>({
  row,
  columns,
  firstColumn,
  gridTemplateColumns,
  selected,
  rowClass,
  onRowClick,
  onBeginCellEdit,
  onCellCommit,
  batchCountFor,
  batchRowsFor,
  cellDisabled,
  cellSelection,
  autoOpenCol,
  autoOpenSeed,
  autoOpenAtButton,
  autoCloseCol,
  selectionEmpty,
  editorAnchorRef,
  onEmptyCellClick,
}: SheetRowViewProps<Row, C>) {
  if (row.divider != null) {
    return (
      // `data-row-id` here too: a divider is a row of the sheet, not empty space — a tap on it must
      // not drop the selection.
      <div
        className="flex h-full items-center gap-3 border-b border-border bg-muted/30 px-3"
        data-row-id={row.id}
      >
        <span className="h-px flex-1 bg-border" />
        <span className="rounded border bg-card px-2 py-px text-xs font-medium text-muted-foreground">
          {row.divider}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group/row grid h-full border-b border-border text-sm',
        selected ? 'bg-foreground/[0.06]' : 'hover:bg-accent/30',
        rowClass,
      )}
      style={{ gridTemplateColumns }}
      data-state={selected ? 'selected' : undefined}
      data-row-id={row.id}
    >
      <div
        className={cn(
          'sticky left-0 z-10 flex h-full items-center gap-1.5 bg-background px-2',
          firstColumn.selectsRows && 'cursor-pointer',
        )}
        onClick={firstColumn.selectsRows ? (e) => onRowClick(row.id, e) : undefined}
      >
        {/* The selection tint and the 3px edge survive the opaque sticky background by being
            drawn on this overlay rather than on the row — see `FixturesTable`. */}
        <div
          className={cn(
            'pointer-events-none absolute inset-0',
            selected ? 'bg-foreground/[0.06] shadow-[inset_3px_0_0_var(--foreground)]' : 'group-hover/row:bg-accent/30',
          )}
        />
        {firstColumn.render(row, selected)}
      </div>

      {columns.map((column) => {
        const value = column.value(row)
        if (value === undefined || column.cell == null) {
          // A read-out, or nothing here to set. A blank cell clears the selection the way the
          // grid's own background does; a read-out is the column's own control.
          return (
            <div
              key={column.key}
              className={cn('flex h-full min-w-0 items-center', column.align === 'right' && 'justify-end')}
              onClick={column.display == null ? onEmptyCellClick : undefined}
            >
              {column.display?.(row)}
            </div>
          )
        }
        const selectedCell = cellSelection.isSelected(row.id, column.key)
        const disabled = cellDisabled?.(row, column.key) ?? false
        const props: SheetCellProps<unknown> = {
          value,
          label: column.label,
          batchCount: batchCountFor(row, column.key),
          batchRows: () => batchRowsFor(row, column.key),
          disabled,
          autoOpen: autoOpenCol === column.key,
          autoClose: autoCloseCol === column.key,
          anchorAtButton: autoOpenCol === column.key && autoOpenAtButton,
          keyboardSeed: autoOpenCol === column.key ? autoOpenSeed : null,
          selectionEmpty,
          editorAnchorRef,
          onBeginEdit: () => onBeginCellEdit(row, column.key),
          onCommit: (next) => onCellCommit(row, column.key, next),
        }
        return (
          <div
            key={column.key}
            data-cell={column.key}
            className={cn(
              // The marks gutter: 18px on the right for the corner glyphs, the same number the
              // programmer's cells reserve — see `FixturesTable`.
              'relative h-full min-w-0 py-0.5 pr-[18px]',
              column.cellClass?.(row),
              cellSelectionClass(selectedCell),
              // Read-only for the pointer; the cell's trigger takes `disabled` for the keyboard.
              disabled && 'pointer-events-none',
            )}
            title={column.cellTitle?.(row)}
          >
            {column.cell(row, props)}
          </div>
        )
      })}
    </div>
  )
}

const SheetRowView = React.memo(SheetRowViewInner) as typeof SheetRowViewInner
