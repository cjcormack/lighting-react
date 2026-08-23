import type { ColumnKey } from './columns'
import type { RowId } from './rowModel'
import type { ListSelectIntent } from './listSelectionModel'

/** One cell of the grid: a row and a value column. */
export interface CellRef {
  rowId: RowId
  col: ColumnKey
}

/**
 * A set of selected cells, keyed by row id and column.
 *
 * Keyed by **rowId, not row index**: indices shift the moment a group expands or the filter
 * changes, and the selection has to survive both.
 *
 * The separator is NUL because a `RowId` is `group:{name}` / `fixture:{key}` / `member:{g}:{k}` and
 * a group name is operator-typed — it can contain a colon, a pipe, anything. NUL cannot appear in
 * either half, so the split is unambiguous whatever the rig is called.
 */
export type CellSelectionState = ReadonlySet<string>

const SEP = '\u0000'

export function cellKey(rowId: RowId, col: ColumnKey): string {
  return `${rowId}${SEP}${col}`
}

export function parseCellKey(key: string): CellRef {
  const at = key.indexOf(SEP)
  return { rowId: key.slice(0, at) as RowId, col: key.slice(at + 1) as ColumnKey }
}

/**
 * Fold a marquee's hits into the existing selection.
 *
 * Reuses `ListSelectIntent` rather than inventing a second vocabulary — the modifiers mean the same
 * thing here as they do for rows, so `listSelectionIntentFor` can drive both. `range` has no
 * distinct meaning for a rectangle (the rectangle *is* the range), so it behaves as `replace`;
 * `range-add` and `toggle` both accumulate, which is what ⌘-dragging a second block should do.
 */
export function applyCellSelection(
  current: CellSelectionState,
  hits: readonly CellRef[],
  intent: ListSelectIntent,
): CellSelectionState {
  const keys = hits.map((h) => cellKey(h.rowId, h.col))
  if (intent === 'replace' || intent === 'range') return new Set(keys)
  const next = new Set(current)
  for (const key of keys) next.add(key)
  return next
}

/**
 * Group the selection by column.
 *
 * The write path is per-column — `planBatchWrites` takes one column and a target list — so a
 * multi-column marquee becomes one batch call per column, each keeping `resolveTargetCells`'
 * parent-first precedence and per-target clamping exactly as a single-column write has them.
 */
export function cellsByColumn(selected: CellSelectionState): { col: ColumnKey; rowIds: RowId[] }[] {
  const byCol = new Map<ColumnKey, RowId[]>()
  for (const key of selected) {
    const { rowId, col } = parseCellKey(key)
    const list = byCol.get(col)
    if (list) list.push(rowId)
    else byCol.set(col, [rowId])
  }
  return [...byCol].map(([col, rowIds]) => ({ col, rowIds }))
}

/**
 * Drop cells whose row is no longer on screen.
 *
 * Same rule row selection already follows: a filter that hides a selected row must not leave it
 * silently contributing to the next write. The stored state is left alone — re-showing the row
 * brings its cells back, which is what an operator toggling `Lit` expects.
 */
export function visibleCells(
  selected: CellSelectionState,
  visibleRowIds: ReadonlySet<string>,
): CellRef[] {
  const out: CellRef[] = []
  for (const key of selected) {
    const ref = parseCellKey(key)
    if (visibleRowIds.has(ref.rowId)) out.push(ref)
  }
  return out
}

/** A short description of the scope, for the drag chip and the selection bar. */
export function describeCellScope(
  cells: readonly CellRef[],
  labelFor: (col: ColumnKey) => string,
): string {
  if (cells.length === 0) return ''
  const cols = [...new Set(cells.map((c) => c.col))]
  const rowCount = new Set(cells.map((c) => c.rowId)).size
  return `${rowCount} × ${cols.map(labelFor).join(', ')}`
}
