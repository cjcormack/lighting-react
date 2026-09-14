import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { orderedSelectedCells, type CellActionCopy, type CellKeyboardPermission } from './cellEntry'
import type { CellRef, RowId } from './cellSelectionModel'
import type { ListSelectIntent } from './listSelectionModel'
import { useCellSelection, type CellSelection } from './useCellSelection'
import { useCellEditorRequests } from './useCellEditorRequests'
import { useLocalListSelection } from './useLocalListSelection'
import { useSheetKeyboard } from './useSheetKeyboard'
import {
  commitToSelectedCells,
  firstEditableCell,
  selectedRowsByColumn,
  type SheetColumn,
  type SheetRow,
} from './sheetModel'
import type { FanPlan } from './FanPopover'
import type { SheetTableProps } from './SheetTable'

/** How often a live editor's continuous commits reach the wire — ~30 Hz, trailing call. */
const COMMIT_INTERVAL_MS = 33

export interface UseSheetOptions<Row extends SheetRow, C extends string> {
  rows: readonly Row[]
  columns: readonly SheetColumn<Row, C>[]
  /**
   * The surface's gate on the two cell gestures — a locked show, an offline desk. Per-column
   * refusals (a column with no `clear`) are folded in below.
   */
  permission: CellKeyboardPermission
  /** The reasons the surface gives when [permission] refuses; the column's `clearRefusal` wins for Clear. */
  copy: (cellCount: number) => CellActionCopy
  /**
   * The surface has made every cell inert — a locked show, an offline desk. Read only for the
   * cell's rendered `disabled` and its wrapper's `pointer-events-none`; the keyboard and the bar
   * read [permission], which the surface keeps in step with this.
   */
  cellDisabled?: (row: Row, col: C) => boolean
}

/**
 * The container half of a sheet — one selection in two shapes, the keyboard, the editor requests,
 * the batch commit and Fan — written once for the patch list, the DMX sheet and the cue sheet
 * (CLAUDE.md §Sheet kit). `FixturesListContainer` is the same shape over the fixtures' row model
 * and scope, and is deliberately not rewired onto this: its tests pin it, and its selection lives
 * in Redux for readers outside the list.
 *
 * Rows and cells are one selection: selecting cells clears the rows, selecting rows clears the
 * cells, and `selectedRows` is the cells' rows under a marquee and the row selection otherwise.
 * Enforced at the doors, not by an effect.
 */
export function useSheet<Row extends SheetRow, C extends string>({
  rows,
  columns,
  permission,
  copy,
  cellDisabled,
}: UseSheetOptions<Row, C>) {
  const selectableOrder = useMemo(
    () => rows.filter((row) => row.divider == null).map((row) => row.id),
    [rows],
  )
  const rowSelection = useLocalListSelection(selectableOrder)
  const visibleRowIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows])
  const cellSelection = useCellSelection<C>(visibleRowIds)
  const { count: cellCount, clear: clearCells, isSelected: isCellSelected } = cellSelection

  // ── One selection, two shapes ──
  const rowCountRef = useRef(rowSelection.count)
  rowCountRef.current = rowSelection.count
  const { select: selectRowRaw, setSelection: setRowsRaw, clear: clearRows } = rowSelection
  const selectCells = useCallback(
    (hits: readonly CellRef<C>[], intent: ListSelectIntent) => {
      if (hits.length > 0 && rowCountRef.current > 0) clearRows()
      cellSelection.select(hits, intent)
    },
    [cellSelection, clearRows],
  )
  const tableCellSelection = useMemo<CellSelection<C>>(
    () => ({ ...cellSelection, select: selectCells }),
    [cellSelection, selectCells],
  )
  const selectRow = useCallback(
    (id: RowId, intent?: ListSelectIntent) => {
      clearCells()
      selectRowRaw(id, intent)
    },
    [clearCells, selectRowRaw],
  )
  const setRows = useCallback(
    (ids: readonly RowId[]) => {
      clearCells()
      setRowsRaw(ids)
    },
    [clearCells, setRowsRaw],
  )

  const cellRowIds = useMemo(
    () => new Set(cellSelection.cells.map((cell) => cell.rowId)),
    [cellSelection.cells],
  )
  const selectedRowIds = cellRowIds.size > 0 ? cellRowIds : rowSelection.selectedIds
  /** The selection's rows, in visible order, whichever shape it is in. */
  const selectedRows = useMemo(
    () => rows.filter((row) => row.divider == null && selectedRowIds.has(row.id)),
    [rows, selectedRowIds],
  )

  const clearByLadder = useCallback(() => {
    if (cellCount > 0) clearCells()
    else clearRows()
  }, [cellCount, clearCells, clearRows])

  /** The marquee by column, rows in visible order — the one expansion behind every consumer. */
  const columnGroups = useMemo(
    () => selectedRowsByColumn(cellSelection, rows),
    [cellSelection, rows],
  )
  const columnByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns])

  // ── The gate, with the columns' own refusals folded in ──
  const selectedColumns = useMemo(
    () => columnGroups.map(({ col }) => columnByKey.get(col)).filter((c): c is SheetColumn<Row, C> => c != null),
    [columnGroups, columnByKey],
  )
  const clearRefusal = selectedColumns.find((c) => c.clear == null)?.clearRefusal
  const effective: CellKeyboardPermission = useMemo(
    () => ({
      entry: permission.entry,
      clear: permission.clear && selectedColumns.length > 0 && selectedColumns.every((c) => c.clear != null),
    }),
    [permission.entry, permission.clear, selectedColumns],
  )
  const actionCopy: CellActionCopy = useMemo(() => {
    const base = copy(cellCount)
    return permission.clear && clearRefusal ? { ...base, clearTitle: clearRefusal } : base
  }, [cellCount, clearRefusal, copy, permission.clear])

  // ── Commits ──
  const commitToCells = useCallback(
    (origin: C, value: unknown) => commitToSelectedCells(columnGroups, columns, origin, value),
    [columnGroups, columns],
  )
  const commitNow = useCallback(
    (row: Row, col: C, value: unknown) => {
      if (cellSelection.isSelected(row.id, col)) {
        commitToCells(col, value)
        return
      }
      const column = columnByKey.get(col)
      const targets = rowSelection.isSelected(row.id) ? selectedRows : [row]
      column?.write?.(targets, value)
    },
    [cellSelection, columnByKey, commitToCells, rowSelection, selectedRows],
  )
  // Continuous drag commits are throttled to ~30 Hz with a trailing call — a level slider fans out
  // to one frame per selected channel. A commit for a different cell flushes the pending one first.
  const commitNowRef = useRef(commitNow)
  commitNowRef.current = commitNow
  const pendingRef = useRef<{ row: Row; col: C; value: unknown } | null>(null)
  const timerRef = useRef<number | null>(null)
  const flush = useCallback(function flush() {
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending) {
      commitNowRef.current(pending.row, pending.col, pending.value)
      timerRef.current = window.setTimeout(flush, COMMIT_INTERVAL_MS)
    } else {
      timerRef.current = null
    }
  }, [])
  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      const pending = pendingRef.current
      pendingRef.current = null
      if (pending) commitNowRef.current(pending.row, pending.col, pending.value)
    },
    [],
  )
  const handleCellCommit = useCallback(
    (row: Row, col: C, value: unknown) => {
      const pending = pendingRef.current
      if (pending && (pending.row.id !== row.id || pending.col !== col)) {
        pendingRef.current = null
        commitNowRef.current(pending.row, pending.col, pending.value)
      }
      if (timerRef.current == null) {
        commitNowRef.current(row, col, value)
        timerRef.current = window.setTimeout(flush, COMMIT_INTERVAL_MS)
      } else {
        pendingRef.current = { row, col, value }
      }
    },
    [flush],
  )

  const batchRowsFor = useCallback(
    (row: Row, col: C): readonly Row[] => {
      if (cellSelection.isSelected(row.id, col)) {
        return columnGroups.find((group) => group.col === col)?.rows ?? [row]
      }
      return rowSelection.isSelected(row.id) ? selectedRows : [row]
    },
    [cellSelection, columnGroups, rowSelection, selectedRows],
  )
  const batchCountFor = useCallback((row: Row, col: C) => batchRowsFor(row, col).length, [batchRowsFor])

  // ── The editor requests and the keyboard ──
  const [scrollToRowId, setScrollToRowId] = useState<RowId | null>(null)
  /** Bring a row into the virtualiser's window — a deep link's cue, a keyboard request. */
  const scrollTo = useCallback((rowId: RowId) => setScrollToRowId(rowId), [])
  const columnOrder = useMemo(() => columns.map((c) => c.key), [columns])
  const firstEditable = useCallback(
    () => firstEditableCell(orderedSelectedCells(cellSelection.cells, selectableOrder, columnOrder), rows, columns),
    [cellSelection.cells, columnOrder, columns, rows, selectableOrder],
  )
  const requests = useCellEditorRequests<C>({ firstEditableCell: firstEditable, onScrollTo: setScrollToRowId })
  const setButtonRef = useRef<HTMLButtonElement | null>(null)

  const clearSelectedCells = useCallback(() => {
    if (!effective.clear) return
    for (const { col, rows: group } of columnGroups) columnByKey.get(col)?.clear?.(group)
  }, [columnByKey, columnGroups, effective.clear])

  useSheetKeyboard<C>({
    cellCount,
    permission: effective,
    isCellSelected,
    onEscape: clearByLadder,
    onOpen: requests.openCellEditor,
    onClear: clearSelectedCells,
  })

  const [marqueeDragging, setMarqueeDragging] = useState(false)

  const handleRowClick = useCallback(
    (id: RowId, e: React.MouseEvent) => selectRow(id, intentFor(e)),
    [selectRow],
  )
  const handleBeginCellEdit = useCallback(
    (row: Row, col: C) => {
      if (row.divider != null) return
      selectCells([{ rowId: row.id, col }], 'replace')
    },
    [selectCells],
  )

  // ── Fan ──
  const fanPlans = useMemo<FanPlan[]>(
    () =>
      columnGroups.flatMap(({ col, rows: group }) => {
        const plan = columnByKey.get(col)?.fan?.(group)
        return plan ? [plan] : []
      }),
    [columnByKey, columnGroups],
  )

  // ── The bar's counts ──
  const family = useMemo(() => {
    const labels = [...new Set(selectedColumns.map((c) => c.label))]
    return labels.length > 0 ? labels.join(' · ') : null
  }, [selectedColumns])

  const tableProps = {
    rows,
    columns,
    isSelected: rowSelection.isSelected,
    onRowClick: handleRowClick,
    onBeginCellEdit: handleBeginCellEdit,
    onCellCommit: handleCellCommit,
    batchCountFor,
    batchRowsFor,
    cellDisabled,
    cellSelection: tableCellSelection,
    onRowMarquee: setRows,
    keyboardOpen: requests.keyboardOpen,
    closeEditorCell: requests.closeEditorCell,
    editorAnchorRef: setButtonRef,
    onMarqueeDragChange: setMarqueeDragging,
    onBackgroundClick: clearByLadder,
    selectionEmpty: rowSelection.count === 0 && cellCount === 0,
    scrollToRowId,
    onScrolledToRow: () => setScrollToRowId(null),
  } satisfies Partial<SheetTableProps<Row, C>>

  return {
    rowSelection,
    cellSelection,
    cellCount,
    selectedRows,
    selectedRowIds,
    columnGroups,
    /** The gate the bar's verbs and the keyboard both read. */
    permission: effective,
    copy: actionCopy,
    family,
    fanPlans,
    setButtonRef,
    toggleCellEditor: requests.toggleCellEditor,
    clearSelectedCells,
    clearByLadder,
    selectRow,
    setRows,
    scrollTo,
    marqueeDragging,
    tableProps,
  }
}

function intentFor(e: React.MouseEvent): ListSelectIntent {
  const cmd = e.metaKey || e.ctrlKey
  if (cmd && e.shiftKey) return 'range-add'
  if (e.shiftKey) return 'range'
  if (cmd) return 'toggle'
  return 'replace'
}
