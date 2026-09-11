import { useCallback, useMemo, useRef, useState } from 'react'
import type { ColumnKey } from './columns'
import type { RowId } from './rowModel'
import type { ListSelectIntent } from './listSelectionModel'
import {
  applyCellSelection,
  cellKey,
  cellsByColumn,
  visibleCells,
  type CellRef,
  type CellSelectionState,
} from './cellSelectionModel'

export interface CellSelection {
  /** Cells still on screen. Filtered rows drop out; the stored state keeps them. */
  cells: CellRef[]
  count: number
  isSelected: (rowId: RowId, col: ColumnKey) => boolean
  /** Grouped for the write path — one entry per column. */
  byColumn: () => { col: ColumnKey; rowIds: RowId[] }[]
  select: (hits: readonly CellRef[], intent: ListSelectIntent) => void
  clear: () => void
}

/**
 * Cell selection — the other shape of the one selection (CLAUDE.md §One selection, two shapes).
 *
 * It was a transient edit scope orthogonal to the row selection; it is exclusive with it now, and
 * a marquee's rows *are* the fixture selection, narrowed to some of their attributes. Nothing
 * outside the grid reads the cells themselves: what leaves the container is the rows they sit on,
 * folded into `selectedRowIds` and published as targets — which is why this can stay **local
 * state, not Redux**. Row selection lives in `selectionSlice` because `RecordSheet` opens outside
 * the grid and needs the targets; the container publishes the marquee's rows through that same
 * door. Redux here would also inherit `useListSelection`'s unmount-clear hazard for no benefit,
 * and the scope-swappable grid wants per-instance state anyway.
 */
export function useCellSelection(visibleRowIds: ReadonlySet<string>): CellSelection {
  const [state, setState] = useState<CellSelectionState>(() => new Set<string>())

  // The pointer handlers in `FixturesTable` need to read the current selection without being
  // re-created on every change — a changing handler identity would detach mid-drag.
  const stateRef = useRef(state)
  stateRef.current = state

  const cells = useMemo(() => visibleCells(state, visibleRowIds), [state, visibleRowIds])

  const select = useCallback((hits: readonly CellRef[], intent: ListSelectIntent) => {
    setState((prev) => applyCellSelection(prev, hits, intent))
  }, [])

  const clear = useCallback(() => {
    // Bail out rather than allocate: `clear()` runs on every Escape and every click outside the
    // marquee, and a fresh empty Set would re-render the whole grid each time.
    setState((prev) => (prev.size === 0 ? prev : new Set<string>()))
  }, [])

  const isSelected = useCallback(
    (rowId: RowId, col: ColumnKey) => stateRef.current.has(cellKey(rowId, col)),
    [],
  )

  const byColumn = useCallback(() => cellsByColumn(stateRef.current), [])

  return useMemo(
    () => ({ cells, count: cells.length, isSelected, byColumn, select, clear }),
    [cells, isSelected, byColumn, select, clear],
  )
}
