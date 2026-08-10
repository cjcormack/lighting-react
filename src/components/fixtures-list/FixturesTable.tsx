import React, { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { LocateButton } from '../fixtures/LocateButton'
import { COLUMN_DEFS } from './columns'
import { buildRowCells, useRowValues } from './useRowValues'
import { SliderCell } from './cells/SliderCell'
import { ColourCell } from './cells/ColourCell'
import { PositionCell } from './cells/PositionCell'
import { SettingCell } from './cells/SettingCell'
import type { ColumnKey } from './columns'
import type { CellCommit, Row, RowId } from './rowModel'
import type { RowCell } from './useRowValues'

const ROW_HEIGHT = 36

export interface FixturesTableProps {
  rows: Row[]
  visibleColumns: readonly ColumnKey[]
  isSelected: (id: RowId) => boolean
  /** Name-cell or checkbox click — the caller derives the intent from the
   *  mouse event; a checkbox click defaults to toggle instead of replace. */
  onRowClick: (id: RowId, e: React.MouseEvent, viaCheckbox?: boolean) => void
  onToggleExpand: (groupName: string) => void
  /** A cell editor is opening on this row — the caller adjusts the selection. */
  onBeginCellEdit: (row: Row) => void
  onCellCommit: (row: Row, col: ColumnKey, commit: CellCommit) => void
  /** How many fixtures a commit from this row would write to (for the popover header). */
  batchCountFor: (row: Row) => number
  /** Row to scroll into view (deep-link); cleared via onScrolledToRow. */
  scrollToRowId?: RowId | null
  onScrolledToRow?: () => void
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
  scrollToRowId,
  onScrolledToRow,
}: FixturesTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

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

  const gridTemplateColumns = useMemo(
    () => `260px repeat(${visibleColumns.length}, minmax(110px, 1fr))`,
    [visibleColumns.length],
  )

  const columnLabels = useMemo(() => {
    const byKey = new Map(COLUMN_DEFS.map((d) => [d.key, d.label]))
    return visibleColumns.map((col) => ({ col, label: byKey.get(col) ?? col }))
  }, [visibleColumns])

  return (
    <div
      ref={scrollRef}
      className="overflow-auto rounded-md border border-border"
      style={{ maxHeight: 'calc(100vh - 14rem)' }}
    >
      <div style={{ minWidth: `${260 + visibleColumns.length * 110}px` }}>
        {/* Header */}
        <div
          className="sticky top-0 z-20 grid border-b border-border bg-background"
          style={{ gridTemplateColumns }}
        >
          <div className="sticky left-0 z-10 bg-background px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Fixture
          </div>
          {columnLabels.map(({ col, label }) => (
            <div
              key={col}
              className="px-1.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Virtualized rows */}
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
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
                  batchCount={batchCountFor(row)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface RowViewProps {
  row: Row
  visibleColumns: readonly ColumnKey[]
  gridTemplateColumns: string
  selected: boolean
  onRowClick: (id: RowId, e: React.MouseEvent, viaCheckbox?: boolean) => void
  onToggleExpand: (groupName: string) => void
  onBeginCellEdit: (row: Row) => void
  onCellCommit: (row: Row, col: ColumnKey, commit: CellCommit) => void
  batchCount: number
}

const RowView = React.memo(function RowView({
  row,
  visibleColumns,
  gridTemplateColumns,
  selected,
  onRowClick,
  onToggleExpand,
  onBeginCellEdit,
  onCellCommit,
  batchCount,
}: RowViewProps) {
  // Hooks run unconditionally; divider rows just have no cells.
  const cells = useMemo(() => buildRowCells(row, visibleColumns), [row, visibleColumns])
  const values = useRowValues(cells)
  const cellByCol = useMemo(() => new Map(cells.map((cell) => [cell.col, cell])), [cells])

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
  const isMember = row.kind === 'fixture' && row.parentGroup !== undefined

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
          className={`relative size-3.5 shrink-0 accent-primary ${isMember ? 'ml-5' : ''}`}
          aria-label={`Select ${isGroup ? row.name : row.fixture.name}`}
        />
        {isGroup && (
          <button
            type="button"
            className="relative shrink-0 rounded p-0.5 hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(row.name)
            }}
            aria-label={row.isExpanded ? `Collapse ${row.name}` : `Expand ${row.name}`}
          >
            {row.isExpanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
          </button>
        )}
        <span className={`relative min-w-0 flex-1 truncate ${isGroup ? 'font-medium' : ''}`}>
          {isGroup ? row.name : row.fixture.name}
        </span>
        {isGroup && (
          <Badge variant="secondary" className="relative shrink-0 px-1 text-[10px]">
            {row.members.length}
          </Badge>
        )}
        <span
          className="relative hidden shrink-0 group-hover/row:inline-flex"
          onClick={(e) => e.stopPropagation()}
        >
          <LocateButton
            type={isGroup ? 'group' : 'fixture'}
            targetKey={isGroup ? row.name : row.fixture.key}
            name={isGroup ? row.name : row.fixture.name}
            iconOnly
          />
        </span>
      </div>

      {/* Property cells */}
      {visibleColumns.map((col) => {
        const cell = cellByCol.get(col)
        const value = values[col]
        if (!cell || !value) {
          return <div key={col} className="h-full" />
        }
        return (
          <div key={col} className="h-full min-w-0 py-0.5">
            <PropertyCell
              cell={cell}
              value={value}
              batchCount={batchCount}
              onBeginEdit={() => onBeginCellEdit(row)}
              onCommit={(commit) => onCellCommit(row, col, commit)}
            />
          </div>
        )
      })}
    </div>
  )
})

function PropertyCell({
  cell,
  value,
  batchCount,
  onBeginEdit,
  onCommit,
}: {
  cell: RowCell
  value: NonNullable<ReturnType<typeof useRowValues>[ColumnKey]>
  batchCount: number
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
          onCommit={onCommit}
          onBeginEdit={onBeginEdit}
        />
      )
  }
}
