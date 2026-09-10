import { describe, expect, it } from 'vitest'
import { columnRange, rectFrom, rowIndexRange, singleColumnAnchor } from './cellMarquee'
import type { ColumnBand } from './cellMarquee'
import type { ColumnKey } from './columns'

const GEO = { scrollTop: 0, headerHeight: 32, rowHeight: 36, rowCount: 10 }

describe('rectFrom', () => {
  it('normalises an up-left drag', () => {
    // The operator drags in whichever direction is convenient; the rectangle is the same either way.
    expect(rectFrom({ x: 200, y: 300 }, { x: 50, y: 100 })).toEqual({
      left: 50,
      right: 200,
      top: 100,
      bottom: 300,
    })
  })
})

describe('rowIndexRange', () => {
  it('maps client y to row indices past the sticky header', () => {
    // Row 0 spans content 0-36, i.e. client 32-68 with the header above it.
    expect(rowIndexRange({ top: 33, bottom: 67 }, GEO)).toEqual([0, 0])
    // 140 is client for content 108, exactly row 3's top edge — zero pixels of it are covered, so
    // it is not selected. Same strictness as `columnRange`.
    expect(rowIndexRange({ top: 33, bottom: 140 }, GEO)).toEqual([0, 2])
    expect(rowIndexRange({ top: 33, bottom: 141 }, GEO)).toEqual([0, 3])
  })

  it('accounts for scroll — the rows it selects have no DOM node', () => {
    // The point of doing this arithmetically: at this offset rows 0-2 are not rendered at all, so
    // any hit-test against elements would miss them.
    expect(
      rowIndexRange({ top: 33, bottom: 67 }, { ...GEO, scrollTop: 360, rowCount: 20 }),
    ).toEqual([10, 10])
  })

  it('clamps to the ends rather than running past them', () => {
    expect(rowIndexRange({ top: 33, bottom: 5000 }, GEO)).toEqual([0, 9])
  })

  it('selects nothing for a drag entirely outside the rows', () => {
    // Started in the header, or in the empty space under a short list. Clamping onto an edge row
    // would select a row the operator never touched.
    expect(rowIndexRange({ top: 0, bottom: 20 }, GEO)).toBeNull()
    expect(rowIndexRange({ top: 3000, bottom: 3200 }, GEO)).toBeNull()
    expect(rowIndexRange({ top: 33, bottom: 67 }, { ...GEO, rowCount: 0 })).toBeNull()
  })

  it('handles a zero-height drag as the one row under the pointer', () => {
    expect(rowIndexRange({ top: 50, bottom: 50 }, GEO)).toEqual([0, 0])
  })
})

describe('columnRange', () => {
  const bands: ColumnBand[] = [
    { col: 'dimmer' as ColumnKey, left: 260, right: 360 },
    { col: 'colour' as ColumnKey, left: 360, right: 460 },
    { col: 'position' as ColumnKey, left: 460, right: 560 },
  ]

  it('takes every column the rectangle overlaps, even partly', () => {
    expect(columnRange({ left: 340, right: 470 }, bands)).toEqual(['dimmer', 'colour', 'position'])
  })

  it('ignores a band it only grazes at the edge', () => {
    // A drag starting exactly on a boundary should pick one column, not two.
    expect(columnRange({ left: 360, right: 460 }, bands)).toEqual(['colour'])
  })

  it('is empty over the sticky name column', () => {
    // Left of the first band: the name cell owns row selection and must keep it.
    expect(columnRange({ left: 10, right: 200 }, bands)).toEqual([])
  })
})

describe('singleColumnAnchor', () => {
  const ROWS = ['fixture:a', 'fixture:b', 'fixture:c']

  it('names the first selected cell in DISPLAY order, not selection order', () => {
    // A ⌘-drag over rows b–c and then one over row a leaves the later block first in the
    // selection. `openEntry` anchors the typed-value editor at the topmost displayed row, and the
    // two paths are documented to open in the same place — so this has to agree with it.
    expect(
      singleColumnAnchor(
        [
          { rowId: 'fixture:c', col: 'dimmer' },
          { rowId: 'fixture:b', col: 'dimmer' },
          { rowId: 'fixture:a', col: 'dimmer' },
        ],
        ROWS,
      ),
    ).toEqual({ rowId: 'fixture:a', col: 'dimmer' })
  })

  it('names nothing when the selection spans columns', () => {
    // The four cell editors encode value shape, so a Dimmer + Colour selection has no one editor
    // to open. Opening either would be picking one of the operator's two attributes for them.
    expect(
      singleColumnAnchor(
        [
          { rowId: 'fixture:a', col: 'dimmer' },
          { rowId: 'fixture:a', col: 'colour' },
        ],
        ROWS,
      ),
    ).toBeNull()
  })

  it('names nothing for an empty selection', () => {
    expect(singleColumnAnchor([], ROWS)).toBeNull()
  })

  it('does not stop at the first pair — a late column still refuses', () => {
    // The check is over every cell, not just the first two: a selection two rows deep and three
    // columns wide reaches its second column only on the third entry.
    expect(
      singleColumnAnchor(
        [
          { rowId: 'fixture:a', col: 'dimmer' },
          { rowId: 'fixture:b', col: 'dimmer' },
          { rowId: 'fixture:b', col: 'colour' },
        ],
        ROWS,
      ),
    ).toBeNull()
  })

  it('never anchors at a row the filter has hidden', () => {
    // A selection survives a filter that hides some of its rows, and an anchor pointing at a row
    // with no element on screen would be a popover positioned at nothing.
    expect(
      singleColumnAnchor(
        [
          { rowId: 'fixture:hidden', col: 'dimmer' },
          { rowId: 'fixture:b', col: 'dimmer' },
        ],
        ROWS,
      ),
    ).toEqual({ rowId: 'fixture:b', col: 'dimmer' })
  })

  it('falls back to the first cell when no selected row is on display at all', () => {
    // Degrade to something rather than to null: the caller then anchors where it can, which is the
    // same shape `openEntry`'s own `?? cells[0]` fallback takes.
    expect(
      singleColumnAnchor([{ rowId: 'fixture:hidden', col: 'dimmer' }], ROWS),
    ).toEqual({ rowId: 'fixture:hidden', col: 'dimmer' })
  })
})
