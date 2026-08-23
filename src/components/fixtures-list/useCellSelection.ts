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
 * Cell selection — a transient edit scope, orthogonal to fixture (row) selection.
 *
 * **Local state, not Redux.** Row selection lives in `selectionSlice` for one named reason:
 * `RecordSheet` opens outside this component and needs the targets. That does not apply here —
 * fixture selection is still what Record scopes on, and nothing outside the grid reads cell
 * selection. Redux would also inherit `useListSelection`'s unmount-clear hazard for no benefit, and
 * Session 2's scope-swappable grid wants per-instance state anyway.
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
