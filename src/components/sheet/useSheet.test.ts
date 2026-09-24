// @vitest-environment jsdom
import { act, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMIT_INTERVAL_MS, useSheet } from './useSheet'
import type { SheetColumn, SheetRow } from './sheetModel'

/**
 * The sheet's live commit cadence through `useLivePush` (editor-kit plan D16): the throttle was
 * rewired onto the busk tabs' hook, and this pins that nothing about its timing moved — the first
 * commit goes at once, a second inside the floor waits and lands as the trailing call, a repeat is
 * sent rather than deduped, and the two rules the hook has no notion of (another cell's commit
 * lands the pending one first, an unmount lands it too) still hold. The floor is asserted as the literal 33 rather than through
 * the constant, so a change to the number is a change to this file.
 */

interface Row extends SheetRow {
  id: string
  level: number
}

const rows: Row[] = [
  { id: 'a', level: 0 },
  { id: 'b', level: 0 },
]

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function harness() {
  const write = vi.fn<(rows: readonly Row[], value: unknown) => boolean>(() => true)
  const columns: SheetColumn<Row, 'level'>[] = [
    {
      key: 'level',
      label: 'Level',
      kind: 'level',
      width: '64px',
      value: (row) => row.level,
      cell: () => null,
      write,
    },
  ]
  const hook = renderHook(() =>
    useSheet<Row, 'level'>({
      rows,
      columns,
      permission: { entry: true, clear: true },
      copy: () => ({ setTitle: 'Set', clearTitle: 'Clear' }),
    }),
  )
  return { write, ...hook }
}

describe('useSheet commit cadence', () => {
  it('is ~30 Hz: the floor between two sends is 33 ms', () => {
    expect(COMMIT_INTERVAL_MS).toBe(33)
  })

  it('sends the first commit at once and holds the next until the floor lifts, then sends the latest', () => {
    const { write, result } = harness()
    const commit = result.current.tableProps.onCellCommit
    act(() => commit(rows[0], 'level', 10))
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenLastCalledWith([rows[0]], 10)
    act(() => commit(rows[0], 'level', 20))
    act(() => commit(rows[0], 'level', 30))
    expect(write).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(32))
    expect(write).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(1))
    // The trailing call: the latest value, not the first held one.
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith([rows[0]], 30)
  })

  it('sends at once again once the floor has lapsed with nothing pending', () => {
    const { write, result } = harness()
    const commit = result.current.tableProps.onCellCommit
    act(() => commit(rows[0], 'level', 10))
    act(() => vi.advanceTimersByTime(40))
    act(() => commit(rows[0], 'level', 20))
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith([rows[0]], 20)
  })

  it('sends a commit that repeats the last one — the sheet does not dedupe, since ⌫, Spread or the wire may have moved the value since', () => {
    const { write, result } = harness()
    const commit = result.current.tableProps.onCellCommit
    act(() => commit(rows[0], 'level', 10))
    act(() => vi.advanceTimersByTime(40))
    act(() => commit(rows[0], 'level', 10))
    expect(write).toHaveBeenCalledTimes(2)
    // And a held repeat lands too.
    act(() => commit(rows[0], 'level', 10))
    act(() => vi.advanceTimersByTime(33))
    expect(write).toHaveBeenCalledTimes(3)
  })

  it('never re-sends a commit the hook has already sent — not for another cell, not on unmount', () => {
    const { write, result, unmount } = harness()
    const commit = result.current.tableProps.onCellCommit
    act(() => commit(rows[0], 'level', 10))
    expect(write).toHaveBeenCalledTimes(1)
    // Nothing pending: another cell's commit flushes nothing, and lands itself at once since the
    // floor is measured from the last send and this is a fresh one after 40 ms.
    act(() => vi.advanceTimersByTime(40))
    act(() => commit(rows[1], 'level', 5))
    expect(write).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(40))
    unmount()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('hands the table one commit function for the life of the sheet', () => {
    const { result, rerender } = harness()
    const first = result.current.tableProps.onCellCommit
    rerender()
    expect(result.current.tableProps.onCellCommit).toBe(first)
  })

  it('lands a pending commit at once when another cell commits, and holds the newcomer to the floor', () => {
    const { write, result } = harness()
    const commit = result.current.tableProps.onCellCommit
    act(() => commit(rows[0], 'level', 10))
    act(() => commit(rows[0], 'level', 20))
    expect(write).toHaveBeenCalledTimes(1)
    act(() => commit(rows[1], 'level', 5))
    // The first cell's held value went out at once; the second cell's waits for the floor, as it
    // always did — two cells' values are two writes, and neither is dropped.
    expect(write.mock.calls.map(([batch, value]) => [batch[0].id, value])).toEqual([
      ['a', 10],
      ['a', 20],
    ])
    act(() => vi.advanceTimersByTime(33))
    expect(write.mock.calls.map(([batch, value]) => [batch[0].id, value])).toEqual([
      ['a', 10],
      ['a', 20],
      ['b', 5],
    ])
  })

  it('lands a pending commit on unmount rather than dropping it', () => {
    const { write, result, unmount } = harness()
    const commit = result.current.tableProps.onCellCommit
    act(() => commit(rows[0], 'level', 10))
    act(() => commit(rows[0], 'level', 20))
    expect(write).toHaveBeenCalledTimes(1)
    unmount()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith([rows[0]], 20)
    // And nothing lands later from a timer left armed.
    act(() => vi.advanceTimersByTime(100))
    expect(write).toHaveBeenCalledTimes(2)
  })
})

/**
 * The row keys every sheet with a row axis answers (CLAUDE.md §Sheet kit): ⌘A, and ↑ / ↓ with
 * Shift extending — the programmer's keys, stepped by the same `arrowStepTarget`. They are heard on
 * the window in the bubble phase, so a key a control has already claimed is left alone.
 */
describe('useSheet row keys', () => {
  interface KeyRow extends SheetRow {
    id: string
  }
  const keyRows: KeyRow[] = [
    { id: 'a' },
    { id: 'div', divider: 'Section' },
    { id: 'b' },
    { id: 'c' },
    { id: 'd' },
  ]
  const keyColumns: SheetColumn<KeyRow, 'v'>[] = [
    { key: 'v', label: 'V', kind: 'v', width: '64px', value: () => 0, cell: () => null, write: () => true },
  ]

  function sheet(selectsRows?: boolean) {
    return renderHook(() =>
      useSheet<KeyRow, 'v'>({
        rows: keyRows,
        columns: keyColumns,
        permission: { entry: true, clear: true },
        copy: () => ({ setTitle: 'Set', clearTitle: 'Clear' }),
        selectsRows,
      }),
    )
  }
  const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
    act(() => {
      fireEvent.keyDown(target, { key, ...init })
    })
  const selected = (r: { current: ReturnType<typeof useSheet<KeyRow, 'v'>> }) => [...r.current.rowSelection.orderedSelected]

  it('steps the row selection with ↓ and ↑, skipping dividers and clamping at the ends', () => {
    const { result } = sheet()
    press('ArrowDown')
    expect(selected(result)).toEqual(['a'])
    press('ArrowDown')
    expect(selected(result)).toEqual(['b'])
    press('ArrowUp')
    press('ArrowUp')
    expect(selected(result)).toEqual(['a'])
  })

  it('lands ↑ on the last row with nothing selected, and scrolls the row it selects into view', () => {
    const { result } = sheet()
    press('ArrowUp')
    expect(selected(result)).toEqual(['d'])
    expect(result.current.tableProps.scrollToRowId).toBe('d')
  })

  it('extends with Shift, upward past two rows', () => {
    const { result } = sheet()
    act(() => result.current.selectRow('d'))
    press('ArrowUp', { shiftKey: true })
    press('ArrowUp', { shiftKey: true })
    expect(selected(result)).toEqual(['b', 'c', 'd'])
  })

  it('selects every row with ⌘A, and a row key drops a cell marquee', () => {
    const { result } = sheet()
    act(() => result.current.tableProps.cellSelection.select([{ rowId: 'b', col: 'v' }], 'replace'))
    expect(result.current.cellCount).toBe(1)
    press('a', { metaKey: true })
    expect(result.current.cellCount).toBe(0)
    expect(selected(result)).toEqual(['a', 'b', 'c', 'd'])
    act(() => result.current.tableProps.cellSelection.select([{ rowId: 'c', col: 'v' }], 'replace'))
    press('ArrowDown')
    expect(result.current.cellCount).toBe(0)
    expect(selected(result)).toEqual(['a'])
  })

  it('leaves a key a control has already claimed, one from either dialog role, and ⌥ / ⌘ / Ctrl arrows alone', () => {
    const { result } = sheet()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    menu.tabIndex = 0
    menu.addEventListener('keydown', (e) => e.preventDefault())
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const inDialog = document.createElement('button')
    dialog.appendChild(inDialog)
    // Radix's AlertDialog — the batch delete's confirm — is `alertdialog`, not `dialog`.
    const alert = document.createElement('div')
    alert.setAttribute('role', 'alertdialog')
    const inAlert = document.createElement('button')
    alert.appendChild(inAlert)
    document.body.append(menu, dialog, alert)
    try {
      press('ArrowDown', {}, menu)
      press('ArrowDown', {}, inDialog)
      press('ArrowDown', {}, inAlert)
      press('a', { metaKey: true }, inAlert)
      press('ArrowDown', { altKey: true })
      press('ArrowDown', { metaKey: true })
      press('ArrowDown', { ctrlKey: true })
      expect(result.current.rowSelection.count).toBe(0)
    } finally {
      menu.remove()
      dialog.remove()
      alert.remove()
    }
  })

  it('stands aside from a plain focused control outside the rows, and not from one inside a row', () => {
    const { result } = sheet()
    // A partition chip or a row verb: a plain button that claims no key of its own.
    const chip = document.createElement('button')
    // A row's rename button or cell trigger, which a click inside the row leaves focused.
    const row = document.createElement('div')
    row.setAttribute('data-row-id', 'a')
    const nameButton = document.createElement('button')
    row.appendChild(nameButton)
    document.body.append(chip, row)
    try {
      press('ArrowDown', {}, chip)
      press('a', { metaKey: true }, chip)
      expect(result.current.rowSelection.count).toBe(0)
      press('ArrowDown', {}, nameButton)
      expect(selected(result)).toEqual(['a'])
      press('ArrowDown', {}, nameButton)
      expect(selected(result)).toEqual(['b'])
    } finally {
      chip.remove()
      row.remove()
    }
  })

  it('hears neither key on a sheet with no row axis', () => {
    const { result } = sheet(false)
    press('ArrowDown')
    press('a', { metaKey: true })
    expect(result.current.rowSelection.count).toBe(0)
  })
})
