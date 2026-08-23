import { describe, expect, it } from 'vitest'
import {
  applyCellSelection,
  cellKey,
  cellsByColumn,
  describeCellScope,
  parseCellKey,
  visibleCells,
} from './cellSelectionModel'
import type { ColumnKey } from './columns'
import type { RowId } from './rowModel'

const rid = (s: string) => s as RowId
const col = (s: string) => s as ColumnKey
const ref = (r: string, c: string) => ({ rowId: rid(r), col: col(c) })

describe('cell keys', () => {
  it('round-trip a row id containing separators an operator could type', () => {
    // Group names are operator-typed: `group:Stage Left | Warm: 2` is a legal row id, so the key
    // separator has to be something that cannot occur in one.
    const rowId = rid('group:Stage Left | Warm: 2')
    expect(parseCellKey(cellKey(rowId, col('colour')))).toEqual({ rowId, col: 'colour' })
  })
})

describe('applyCellSelection', () => {
  const start = new Set([cellKey(rid('a'), col('dimmer'))])

  it('replaces on a plain drag', () => {
    const next = applyCellSelection(start, [ref('b', 'colour')], 'replace')
    expect([...next]).toEqual([cellKey(rid('b'), col('colour'))])
  })

  it('accumulates a second block on toggle or range-add', () => {
    for (const intent of ['toggle', 'range-add'] as const) {
      const next = applyCellSelection(start, [ref('b', 'colour')], intent)
      expect(next.size).toBe(2)
    }
  })

  it('treats range as replace — the rectangle IS the range', () => {
    expect(applyCellSelection(start, [ref('b', 'colour')], 'range').size).toBe(1)
  })
})

describe('cellsByColumn', () => {
  it('groups so each column becomes exactly one batch write', () => {
    // `planBatchWrites` takes ONE column plus targets, so a multi-column marquee has to be split
    // this way to keep per-target clamping and parent-first precedence intact.
    const selected = new Set([
      cellKey(rid('a'), col('colour')),
      cellKey(rid('b'), col('colour')),
      cellKey(rid('a'), col('dimmer')),
    ])
    const grouped = cellsByColumn(selected).sort((x, y) => x.col.localeCompare(y.col))
    expect(grouped).toEqual([
      { col: 'colour', rowIds: ['a', 'b'] },
      { col: 'dimmer', rowIds: ['a'] },
    ])
  })
})

describe('visibleCells', () => {
  it('drops cells whose row has been filtered away', () => {
    // Same rule row selection follows: a hidden row must not silently contribute to a write.
    const selected = new Set([cellKey(rid('a'), col('colour')), cellKey(rid('gone'), col('colour'))])
    expect(visibleCells(selected, new Set(['a']))).toEqual([ref('a', 'colour')])
  })

  it('leaves the stored state alone, so unhiding the row brings its cells back', () => {
    const selected = new Set([cellKey(rid('a'), col('colour'))])
    visibleCells(selected, new Set())
    expect(selected.size).toBe(1)
  })
})

describe('describeCellScope', () => {
  it('counts rows and names each distinct column once', () => {
    const cells = [ref('a', 'colour'), ref('b', 'colour'), ref('a', 'position')]
    expect(describeCellScope(cells, (c) => c)).toBe('2 × colour, position')
  })

  it('is empty for an empty selection', () => {
    expect(describeCellScope([], (c) => c)).toBe('')
  })
})
