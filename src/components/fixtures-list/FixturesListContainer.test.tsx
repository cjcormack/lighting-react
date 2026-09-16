// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { CellSelection } from '../sheet/useCellSelection'
import type { ColumnKey } from './columns'
import type { Row, RowId } from './rowModel'
import type { ProgrammerScope } from '../programmer/ProgrammerScope'
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
const rowSelection = vi.hoisted(() => {
  const state = {
    ids: new Set<RowId>(),
    select: vi.fn(),
    clear: vi.fn(),
    // The row door, faked the way the slice behaves: it replaces the selection, so a later render
    // reads back what was set. The scope-switch test below is the one that needs that.
    setSelection: vi.fn((ids: readonly RowId[]) => {
      state.ids = new Set(ids)
    }),
  }
  return state
})
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
      setSelection: rowSelection.setSelection,
    }),
  }
})

/** The programmer's scope, flipped by the test rather than by a band. `null` on the plain lists. */
const programmerScope = vi.hoisted(() => ({ value: null as ProgrammerScope | null }))
vi.mock('../programmer/ProgrammerScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../programmer/ProgrammerScope')>()),
  useProgrammerScope: () => programmerScope.value,
}))

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
// The plain lists' row C reads the press mask through the store; there is no Provider here, and
// on these routes the answer is the marquee's own families anyway (they never bridge).
vi.mock('@/store/selection', () => ({
  usePressFamilies: (local: unknown) => local,
  useDeskSelectionSnapshot: () => ({ targets: [], families: null, source: null }),
}))
// The plain lists draw the kit's selection bar as their row C (CLAUDE.md §List shell), and it asks
// the viewport's height; jsdom has no `matchMedia`, and a desk is tall.
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
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
  closeEditorCell: null as { rowId: string; col: ColumnKey } | null,
  /** Draw the DOM shape of an open cell editor, which is how the container finds one to close. */
  editorOpen: false,
}))
vi.mock('./FixturesTable', () => ({
  FixturesTable: (props: {
    rows: readonly Row[]
    cellSelection: CellSelection<ColumnKey>
    onBeginCellEdit: (row: Row, col: ColumnKey) => void
    onBackgroundClick?: () => void
    closeEditorCell?: { rowId: string; col: ColumnKey } | null
  }) => {
    table.cellSelection = props.cellSelection
    table.rows = props.rows
    if (props.closeEditorCell) table.closeEditorCell = props.closeEditorCell
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
        {/* The real grid's addressing contract, which `openCellEditorTarget` reads to find the
            open editor: a `data-state="open"` anchor inside a `[data-cell]` inside a
            `[data-row-id]`. Rendered only when this stub is told an editor is open. */}
        {table.editorOpen && (
          <div data-row-id="fixture:a">
            <div data-cell="dimmer">
              <span data-state="open" />
            </div>
          </div>
        )}
      </>
    )
  },
}))

const { FixturesListContainer } = await import('./FixturesListContainer')

beforeEach(() => {
  rowSelection.ids = new Set()
  rowSelection.select.mockClear()
  rowSelection.clear.mockClear()
  rowSelection.setSelection.mockClear()
  programmerScope.value = null
  clearCellEffects.enabled = undefined
  table.cellSelection = undefined
  table.closeEditorCell = null
  table.editorOpen = false
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

  it('leaves the plain lists alone: no scope, so nothing to switch', () => {
    // `useProgrammerScope` is null on these two routes, so the scope effect fires once on mount and
    // finds no marquee. Pinned because the conversion below writes through the row door, and a
    // mount-time write there would be a `set([])` published to the desk by the programmer's bridge.
    render(<FixturesListContainer grouped={false} selectionScope="fixtures" />)
    expect(rowSelection.setSelection).not.toHaveBeenCalled()
  })

  it("mounts the cell clear's effect sweep, so ⌫ means one thing on every list", () => {
    // Gated on `showOwnership` until this session, which would have left ⌫ here clearing the
    // values while the effect driving them kept running — indistinguishable, on the rig, from the
    // key having done nothing.
    render(<FixturesListContainer grouped={false} selectionScope="fixtures" />)
    expect(clearCellEffects.enabled).toBe(true)
  })
})

/**
 * A scope switch under a marquee (multi-screen session 1 follow-up A).
 *
 * The cells are scope-local and must go — eight cells in Local are eight of *your* values, and in a
 * layer they are eight of a Look's rows. The *heads* are not, and since the two selections became
 * one, clearing the cells outright emptied `selectedRowIds`: the bridge published `set([])` and
 * every other screen's target band and family pill went with it. So the switch converts the
 * marquee to its rows through the row door, and only the mask is dropped.
 */
describe('FixturesListContainer across a programmer scope switch', () => {
  it('drops a marquee to its rows rather than to nothing', () => {
    programmerScope.value = { kind: 'local' }
    const { rerender } = render(
      <FixturesListContainer grouped={false} selectionScope="programmer" showOwnership />,
    )
    fireEvent.click(screen.getByTestId('cell'))
    expect(screen.getByTestId('cell')).toHaveTextContent('1 cells')
    expect(rowSelection.setSelection).not.toHaveBeenCalled()

    programmerScope.value = { kind: 'output' }
    rerender(<FixturesListContainer grouped={false} selectionScope="programmer" showOwnership />)

    expect(rowSelection.setSelection).toHaveBeenCalledWith(['fixture:a'])
    expect(rowSelection.clear).not.toHaveBeenCalled()
    expect(screen.getByTestId('cell')).toHaveTextContent('0 cells')
    expect([...rowSelection.ids]).toEqual(['fixture:a'])
  })

  it('does not re-mint the cells on the way back', () => {
    // The reverse direction: with the marquee already converted there is nothing left to convert,
    // so switching back to Local leaves the rows exactly as they are and writes nothing.
    // A fresh element each time: React bails out of re-rendering a reference-equal one, and the
    // scope here is read through a mocked hook rather than through context, so a bail-out would
    // mean the switch never reached the component at all and the test would pass vacuously.
    const view = () => (
      <FixturesListContainer grouped={false} selectionScope="programmer" showOwnership />
    )
    const { rerender } = render(view())
    fireEvent.click(screen.getByTestId('cell'))
    programmerScope.value = { kind: 'output' }
    rerender(view())
    expect(screen.getByTestId('cell')).toHaveTextContent('0 cells')
    rowSelection.setSelection.mockClear()

    programmerScope.value = { kind: 'local' }
    rerender(view())

    expect(rowSelection.setSelection).not.toHaveBeenCalled()
    expect(screen.getByTestId('cell')).toHaveTextContent('0 cells')
    expect([...rowSelection.ids]).toEqual(['fixture:a'])
  })
})

/**
 * The other half of a scope switch: an editor that was already open when it happened.
 *
 * This used to be closed by accident. Under a marquee the row selection is empty, so the old
 * `clearCells()` took `selectionEmpty` (`selection.count === 0 && cellCount === 0`) across its
 * false→true edge and `useCellEditorOpen` shut the panel. Converting the marquee to rows keeps
 * that flag false, so the edge never comes — and an open panel is *not* inert in a read-only
 * scope: `disabled` reaches the cell's trigger, never the fields inside an open popover, and
 * `useCellWriters` has no Output or template arm, so a commit falls through to a live write into
 * Local. The close has to be said rather than fall out of the selection going away.
 */
describe('FixturesListContainer closes an open cell editor on a scope switch', () => {
  it('asks the table to close whichever editor is open', () => {
    programmerScope.value = { kind: 'local' }
    table.editorOpen = true
    const view = () => (
      <FixturesListContainer grouped={false} selectionScope="programmer" showOwnership />
    )
    const { rerender } = render(view())
    fireEvent.click(screen.getByTestId('cell'))
    expect(table.closeEditorCell).toBeNull()

    programmerScope.value = { kind: 'output' }
    rerender(view())

    expect(table.closeEditorCell).toEqual({ rowId: 'fixture:a', col: 'dimmer' })
  })

  it('asks for no close when the switch happens with no editor open', () => {
    // The request is a one-shot the table drops on the next commit, and a standing one re-opens
    // the editor it names — so a scope switch must not mint one for a cell nobody was editing.
    programmerScope.value = { kind: 'local' }
    table.editorOpen = false
    const view = () => (
      <FixturesListContainer grouped={false} selectionScope="programmer" showOwnership />
    )
    const { rerender } = render(view())
    fireEvent.click(screen.getByTestId('cell'))

    programmerScope.value = { kind: 'output' }
    rerender(view())

    expect(table.closeEditorCell).toBeNull()
  })
})
