// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { CellSelection } from '../sheet/useCellSelection'
import type { ColumnKey } from './columns'
import type { Row, RowId } from './rowModel'
import { makeFixture } from '../../test/fixtureFactories'

/**
 * What the three lists now share, asserted at the seam where they used to differ.
 *
 * `FixturesTable`'s own suite pins the *gestures* a grid with a cell selection has. This one pins
 * that the two plain list routes are given one at all — they were not until this session, which is
 * what made a click on a value cell mean "select this row and open its editor" there and "select
 * this cell" on the programmer — and that the effect sweep behind ⌫ is mounted with it.
 *
 * Everything store-connected is a fake: the subject is the container's wiring, not the data.
 */
const rowSelection = vi.hoisted(() => ({ ids: new Set<RowId>(), select: vi.fn(), clear: vi.fn() }))
vi.mock('./useListSelection', async () => {
  const actual = await vi.importActual<typeof import('./useListSelection')>('./useListSelection')
  return {
    listSelectionIntentFor: actual.listSelectionIntentFor,
    usePublishSelectionTargets: () => {},
    useListSelection: () => ({
      selectedIds: rowSelection.ids,
      orderedSelected: [...rowSelection.ids],
      anchor: null,
      count: rowSelection.ids.size,
      isSelected: (id: RowId) => rowSelection.ids.has(id),
      select: rowSelection.select,
      selectAll: vi.fn(),
      clear: rowSelection.clear,
      setSelection: vi.fn(),
    }),
  }
})

// Through the shared factory, like every other suite in this directory: a hand-rolled partial
// would not carry the fields a real `Fixture` always has, so a render path that started reading
// one would find `undefined` here and a value on the rig.
const FIXTURES = [
  makeFixture('a', [], { name: 'SL Wash 1' }),
  makeFixture('b', [], { name: 'SL Wash 2' }),
]
vi.mock('../../store/fixtures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/fixtures')>()),
  useFixtureListQuery: () => ({ data: FIXTURES, isLoading: false }),
}))
vi.mock('../../store/groups', () => ({ useGroupListQuery: () => ({ data: [], isLoading: false }) }))
vi.mock('./useLitFixtureKeys', () => ({ useLitFixtureKeys: () => new Set<string>() }))
vi.mock('./useDeskSelectionBridge', () => ({ useDeskSelectionBridge: () => {} }))
vi.mock('../../store/includeSelection', () => ({
  useIncludeSelectionRequest: () => ({ nonce: 0, targetKeys: [] }),
}))
vi.mock('./useCellWriters', () => ({
  useCellWriters: () => ({}),
  applyPlannedWrite: () => {},
}))
/** The gate under test: `enabled`, which decides whether the FX subscription is mounted at all. */
const clearCellEffects = vi.hoisted(() => ({ enabled: undefined as boolean | undefined }))
vi.mock('./useClearCellEffects', () => ({
  useClearCellEffects: (enabled: boolean) => {
    clearCellEffects.enabled = enabled
    return () => {}
  },
}))
// The selection toolbar and the cell verbs are store-connected and have suites of their own;
// what matters here is only that selecting a cell is what summons them.
vi.mock('./SelectionToolbar', () => ({
  SelectionToolbar: ({ actions }: { actions: ReactNode }) => (
    <div data-testid="toolbar">{actions}</div>
  ),
}))
vi.mock('../sheet/CellSelectionActions', () => ({
  CellSelectionActions: () => <span data-testid="cell-verbs" />,
}))
vi.mock('./FanPopover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./FanPopover')>()),
  FanPopover: () => <span data-testid="row-fan" />,
}))
vi.mock('../groups/FixtureDetailModal', () => ({ FixtureDetailModal: () => null }))
vi.mock('../fixtures/GroupDetailModal', () => ({ GroupDetailModal: () => null }))
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ projectId: '1' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

/**
 * The table, stubbed down to the two things this suite asks about: whether it was handed a cell
 * selection, and what the container does with a click on one of its cells.
 */
const table = vi.hoisted(() => ({
  cellSelection: undefined as CellSelection<ColumnKey> | undefined,
  rows: [] as readonly Row[],
}))
vi.mock('./FixturesTable', () => ({
  FixturesTable: (props: {
    rows: readonly Row[]
    cellSelection: CellSelection<ColumnKey>
    onBeginCellEdit: (row: Row, col: ColumnKey) => void
    onBackgroundClick?: () => void
  }) => {
    table.cellSelection = props.cellSelection
    table.rows = props.rows
    return (
      <>
        <button
          data-testid="cell"
          onClick={() => props.onBeginCellEdit(props.rows[0], 'dimmer')}
        >
          {props.cellSelection.count} cells
        </button>
        {/* What the real table renders for a column a row resolves nothing for, and for the
            empty space under the last row: both call `onBackgroundClick`. */}
        <button data-testid="blank-cell" onClick={() => props.onBackgroundClick?.()} />
      </>
    )
  },
}))

const { FixturesListContainer } = await import('./FixturesListContainer')

beforeEach(() => {
  rowSelection.ids = new Set()
  rowSelection.select.mockClear()
  rowSelection.clear.mockClear()
  clearCellEffects.enabled = undefined
  table.cellSelection = undefined
})
afterEach(cleanup)

describe('FixturesListContainer on the plain list routes', () => {
  it('hands the table a cell selection, the way the programmer sheet always was', () => {
    render(<FixturesListContainer grouped={false} selectionScope="fixtures" />)
    expect(table.cellSelection).toBeDefined()
    expect(table.cellSelection!.count).toBe(0)
  })

  it('answers a click on a value cell by selecting that cell, not its row', () => {
    // The row rule this replaced: a click there used to select the clicked *row*, because there
    // was no cell selection for the toolbar, `commitNow` or `batchCountFor` to read.
    render(<FixturesListContainer grouped={false} selectionScope="fixtures" />)
    fireEvent.click(screen.getByTestId('cell'))
    expect(screen.getByTestId('cell')).toHaveTextContent('1 cells')
    expect(rowSelection.select).not.toHaveBeenCalled()
  })

  it('swaps the row Fan for the cell verbs once a cell is selected', () => {
    rowSelection.ids = new Set(['fixture:a'])
    render(<FixturesListContainer grouped={false} selectionScope="fixtures" />)
    expect(screen.getByTestId('row-fan')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cell'))
    expect(screen.getByTestId('cell-verbs')).toBeInTheDocument()
  })

  it('keeps the whole-selection row Fan these two routes have always had', () => {
    // The one gesture not folded into the marquee. A row selection here is made by dragging the
    // name column or by ⌘A, and fanning across eight whole heads without first drawing a
    // rectangle over one of their columns is worth keeping; the programmer trades it away, because
    // there the marquee *is* what a selection is for.
    rowSelection.ids = new Set(['fixture:a', 'fixture:b'])
    const { rerender } = render(<FixturesListContainer grouped={false} selectionScope="fixtures" />)
    expect(screen.getByTestId('row-fan')).toBeInTheDocument()
    rerender(<FixturesListContainer grouped={false} selectionScope="fixtures" showOwnership />)
    expect(screen.queryByTestId('row-fan')).toBeNull()
  })

  it('clears a rows-only selection when a blank cell is clicked — the programmer\'s answer, now theirs', () => {
    // The one part of the unification that *removes* something. `onEmptyCellClick` was withheld on
    // these two routes while their ladder had only a row rung, so a click on a dimmer-only par's
    // Colour cell did nothing; it has both rungs now, and a blank cell is grid background wearing a
    // cell's position. Pinned because the refusal was explicit, so its reversal should be too.
    rowSelection.ids = new Set(['fixture:a', 'fixture:b'])
    render(<FixturesListContainer grouped={false} selectionScope="fixtures" />)
    fireEvent.click(screen.getByTestId('blank-cell'))
    expect(rowSelection.clear).toHaveBeenCalled()
  })

  it('drops the cells first, leaving the rows, when a marquee is what is selected', () => {
    // The other rung: with cells selected the same click narrows rather than clearing the rows,
    // which is what makes `clearByLadder` a ladder and not a blanket deselect.
    render(<FixturesListContainer grouped={false} selectionScope="fixtures" />)
    fireEvent.click(screen.getByTestId('cell'))
    expect(screen.getByTestId('cell')).toHaveTextContent('1 cells')
    fireEvent.click(screen.getByTestId('blank-cell'))
    expect(screen.getByTestId('cell')).toHaveTextContent('0 cells')
    expect(rowSelection.clear).not.toHaveBeenCalled()
  })

  it("mounts the cell clear's effect sweep, so ⌫ means one thing on every list", () => {
    // Gated on `showOwnership` until this session, which would have left ⌫ here clearing the
    // values while the effect driving them kept running — indistinguishable, on the rig, from the
    // key having done nothing.
    render(<FixturesListContainer grouped={false} selectionScope="fixtures" />)
    expect(clearCellEffects.enabled).toBe(true)
  })
})
