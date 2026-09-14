import type { ReactNode, RefObject } from 'react'
import type { FanPlan } from './FanPopover'
import type { CellRef, RowId } from './cellSelectionModel'
import type { CellSelection } from './useCellSelection'

/**
 * A row of a sheet. A divider draws its label across the row and cannot be selected — the
 * fixtures list's "Ungrouped", the cue sheet's markers.
 */
export interface SheetRow {
  id: RowId
  divider?: string
}

/**
 * What a column hands the cell it draws — the standard set every kit cell takes, so a column
 * author wires the same props whichever editor the column uses.
 */
export interface SheetCellProps<V> {
  value: V
  /** The column's name, which titles the editor where it is a sheet. */
  label: string
  /** How many rows a commit from this cell lands on — the marquee's rows, or this row alone. */
  batchCount: number
  /** The rows that commit lands on, in visible order — for an editor that previews its landing. */
  batchRows: () => readonly SheetRow[]
  /** The surface has made this cell inert: a locked show, an offline desk. */
  disabled: boolean
  autoOpen: boolean
  autoClose: boolean
  anchorAtButton: boolean
  keyboardSeed: string | null
  selectionEmpty?: boolean
  editorAnchorRef?: RefObject<HTMLElement | null>
  onBeginEdit: () => void
  /** The editor's commit, which the container fans over every selected cell of this column. */
  onCommit: (value: V) => void
}

/**
 * One column of a sheet: how to read a row, which editor it takes, whether it fans, and what a
 * commit does (CLAUDE.md §Sheet kit).
 *
 * `write` takes the **rows** of the batch, not one row at a time, because some columns land a
 * batch as a whole — the patch list's Address lands N heads consecutively from the typed one. It
 * answers false when it refuses the value. A commit from one column's editor reaches the other
 * selected columns only where they share its [kind] — see `commitToSelectedCells` — which is the
 * kit's form of the shape test the programmer's `commitToCells` makes through `planBatchWrites`.
 *
 * A column with no `cell` is a read-out: it draws `display`, hangs no `data-column-header` for the
 * marquee to measure, and so takes no selection — Enter never opens it and Clear never blames it.
 */
export interface SheetColumn<Row extends SheetRow, C extends string = string, V = unknown> {
  key: C
  label: string
  /** The grid track: `104px`, `minmax(120px,1fr)`. */
  width: string
  /**
   * The value vocabulary this column takes — `level` on every DMX column, `fade` on the cue
   * sheet's Fade, and so on. **A commit fans only to the selected columns that share its
   * origin's kind.** The programmer's columns tell their commits apart by shape (`CellCommit.kind`),
   * but a cue's name, its notes and its fade are all one `string`, so shape discriminates nothing
   * there: a `3s` typed into Fade over a Fade→Follow marquee would otherwise switch auto-advance
   * on for every cue, and a rigging picked over a Mount→Gel marquee would land as a gel code.
   * Absent means the column takes commits from its own editor alone.
   */
  kind?: string
  /** The value a cell shows and edits, or undefined for a row with nothing in this column. */
  value: (row: Row) => V | undefined
  /** Draws an editable cell. Absent for a read-out column. */
  cell?: (row: Row, props: SheetCellProps<V>) => ReactNode
  /** A read-out, drawn where there is no `cell`. */
  display?: (row: Row) => ReactNode
  /** Commit a value to these rows. False when the column refuses it, having written nothing. */
  write?: (rows: readonly Row[], value: unknown) => boolean
  /** Clear these rows' cells. Absent means Clear is refused here, with [clearRefusal] as the reason. */
  clear?: (rows: readonly Row[]) => void
  clearRefusal?: string
  /** The fan over these rows in visible order, or null where this column does not fan. */
  fan?: (rows: readonly Row[]) => FanPlan | null
  /** Extra classes on the cell wrapper — an ownership ring, the overlap ring. */
  cellClass?: (row: Row) => string | undefined
  /** The wrapper's hover text. */
  cellTitle?: (row: Row) => string | undefined
  /** Right-align the content — numbers. */
  align?: 'left' | 'right'
}

/** A cell of a sheet, over the sheet's own column vocabulary. */
export type SheetCellRef<C extends string> = CellRef<C>

/**
 * The selected cells grouped by column, each with its rows in **visible order** — the one
 * expansion behind every per-column consumer (the commit, Clear, the batch count and Fan), so a fan
 * and a typed value cannot reach different rows for one selection.
 *
 * The programmer's `columnTargets` is this over write targets; the kit's is over rows, since a
 * sheet row is the unit its columns write.
 */
export function selectedRowsByColumn<Row extends SheetRow, C extends string>(
  selection: CellSelection<C>,
  rows: readonly Row[],
): { col: C; rows: Row[] }[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return selection.byColumn().map(({ col, rowIds }) => {
    const wanted = new Set(rowIds)
    return { col, rows: rows.filter((row) => wanted.has(row.id)).map((row) => byId.get(row.id)!) }
  })
}

/**
 * One commit, every selected cell **of the origin's kind**. Grouped by column so each column
 * writes its batch once: the column the editor opened on always takes it, a sibling takes it
 * only when it declares the same `kind`, and a value the column cannot take is dropped inside
 * `write` besides — so the selection's cell count is an upper bound on what any one commit
 * writes. Returns how many columns took it.
 */
export function commitToSelectedCells<Row extends SheetRow, C extends string>(
  groups: readonly { col: C; rows: readonly Row[] }[],
  columns: readonly SheetColumn<Row, C>[],
  origin: C,
  value: unknown,
): number {
  const originKind = columns.find((c) => c.key === origin)?.kind
  let written = 0
  for (const { col, rows } of groups) {
    const column = columns.find((c) => c.key === col)
    if (!column?.write || rows.length === 0) continue
    if (col !== origin && (originKind == null || column.kind !== originKind)) continue
    if (column.write(rows, value)) written += 1
  }
  return written
}

/**
 * The first selected cell in display order **that has an editor** — a marquee is geometric and
 * happily covers a read-out column and a row with nothing in it.
 */
export function firstEditableCell<Row extends SheetRow, C extends string>(
  ordered: readonly CellRef<C>[],
  rows: readonly Row[],
  columns: readonly SheetColumn<Row, C>[],
): CellRef<C> | undefined {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ordered.find((cell) => {
    const row = byId.get(cell.rowId)
    const column = columns.find((c) => c.key === cell.col)
    return row != null && row.divider == null && column?.cell != null && column.value(row) !== undefined
  })
}
