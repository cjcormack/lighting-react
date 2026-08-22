import React, { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronRight, Info, Layers, Link2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LocateButton } from '../fixtures/LocateButton'
import { COLUMN_DEFS } from './columns'
import { rowLocateTarget } from './rowModel'
import { buildRowCells, useRowValues } from './useRowValues'
import { useRowOwnership } from './useRowOwnership'
import { applyStagedValue, ownershipCellClass, ownershipTitle } from './ownership'
import { SliderCell } from './cells/SliderCell'
import { ColourCell } from './cells/ColourCell'
import { PositionCell } from './cells/PositionCell'
import { SettingCell } from './cells/SettingCell'
import type { ColumnKey } from './columns'
import type { CellCommit, FixtureRow, GroupRow, InfoRow, Row, RowId } from './rowModel'
import type { CellPaletteRef } from './useRowOwnership'
import type { RowCell } from './useRowValues'

const ROW_HEIGHT = 36

/**
 * Left-edge bar marking a cell whose value is a reference — a quiet cue, not a fifth ownership
 * colour.
 *
 * One colour, where there used to be one per palette type. A Look declares no attribute type: its
 * families are derived from its rows and one may span several, so there is nothing here to tint by.
 * What the bar still says — "this cell tracks something else" — is the part that mattered.
 */
const REF_BAR_CLASS = 'bg-muted-foreground'

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
  /** A cell editor is opening on this row — the caller adjusts the selection. */
  onBeginCellEdit: (row: Row) => void
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

  return (
    <div
      ref={scrollRef}
      className="overflow-auto rounded-md border border-border"
      style={{ maxHeight: 'calc(100vh - 14rem)' }}
    >
      <div style={{ minWidth: `calc(${NAME_COLUMN_WIDTH} + ${visibleColumns.length * 96}px)` }}>
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
                  batchCountFor={batchCountFor}
                  onShowInfo={onShowInfo}
                  showOwnership={showOwnership}
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
  onToggleExpand: (row: GroupRow | FixtureRow) => void
  onBeginCellEdit: (row: Row) => void
  onCellCommit: (row: Row, col: ColumnKey, commit: CellCommit) => void
  batchCountFor: (row: Row, col: ColumnKey) => number
  onShowInfo: (row: InfoRow) => void
  showOwnership: boolean
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
}: RowViewProps) {
  // Hooks run unconditionally; divider rows just have no cells.
  const cells = useMemo(() => buildRowCells(row, visibleColumns), [row, visibleColumns])
  const values = useRowValues(cells)
  // Passing an empty cell list is the "off" state: useRowOwnership then registers no
  // subscriptions and returns a constant, so the plain list views pay nothing for this.
  const ownershipCells = showOwnership ? cells : EMPTY_CELLS
  const ownership = useRowOwnership(ownershipCells)
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
          </span>
        )}
      </div>

      {/* Property cells */}
      {visibleColumns.map((col) => {
        const cell = cellByCol.get(col)
        const value = values[col]
        if (!cell || !value) {
          return <div key={col} className="h-full" />
        }
        const owned = ownership[col]
        const paletteRef = owned?.paletteRef
        const layer = owned?.layer
        return (
          <div
            key={col}
            className={`relative h-full min-w-0 py-0.5 ${ownershipCellClass(owned)}`}
            title={ownershipTitle(owned)}
          >
            {/* Reference marker, layered around the cell rather than inside it — the same choice
                `ownershipCellClass` documents. The four cell editors already encode value shape,
                and a marker drawn inside one of them would have to be drawn four times. */}
            {paletteRef && (
              <span
                className={`pointer-events-none absolute inset-y-0.5 left-0 w-0.5 rounded-full ${
                  paletteRef.resolved ? REF_BAR_CLASS : 'bg-destructive'
                }`}
              />
            )}
            {paletteRef && (
              <Link2
                className={`pointer-events-none absolute right-0.5 top-0.5 size-2.5 ${
                  paletteRef.resolved ? 'text-muted-foreground' : 'text-destructive'
                }`}
              />
            )}
            {/* The winning Look layer, in the *opposite* corner from the reference marker: a cell
                can be both a reference the operator typed and a layer's output, and stacking the
                two icons would make each one unreadable. Title-only detail — the hover text names
                the look, and a name would not fit here at this density. */}
            {layer && (
              <Layers
                className={`pointer-events-none absolute bottom-0.5 right-0.5 size-2.5 ${
                  layer.mixed ? 'text-muted-foreground/50' : 'text-muted-foreground'
                }`}
              />
            )}
            <PropertyCell
              cell={cell}
              value={applyStagedValue(value, owned?.staged, cell.resolutions)}
              batchCount={batchCountFor(row, col)}
              paletteRef={paletteRef}
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
  paletteRef,
  onBeginEdit,
  onCommit,
}: {
  cell: RowCell
  value: NonNullable<ReturnType<typeof useRowValues>[ColumnKey]>
  batchCount: number
  paletteRef?: CellPaletteRef
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
          paletteRef={paletteRef}
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
          paletteRef={paletteRef}
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
          paletteRef={paletteRef}
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
          paletteRef={paletteRef}
          onCommit={onCommit}
          onBeginEdit={onBeginEdit}
        />
      )
  }
}
