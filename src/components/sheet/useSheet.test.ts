// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
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

  it('sends a commit that repeats the last one — the sheet does not dedupe, since ⌫, Fan or the wire may have moved the value since', () => {
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
