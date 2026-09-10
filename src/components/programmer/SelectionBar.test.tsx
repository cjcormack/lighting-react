// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CellRef } from '@/components/fixtures-list/cellSelectionModel'

/**
 * Row C's phone arm (`PD-SELECTION-BAR-DENSITY`, `PD-CLEAR-SELECTION-TOUCH`).
 *
 * jsdom evaluates no container query, so what is pinned is *which* element carries the fold
 * class — the fixture count and the family badge do, the cell count and the Deselect do not — and
 * the one control this bar draws itself: a Deselect for a cells-only marquee, which the row
 * toolbar (`selection`) has none for because it is gated on selected rows.
 */
vi.mock('./TemplateStrip', () => ({ TemplateStrip: () => <div data-testid="strip" /> }))
const shortViewport = vi.hoisted(() => ({ current: false }))
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => shortViewport.current }))

const { SelectionBar } = await import('./SelectionBar')
import { PHONE_FOLDED_CLASS } from '@/components/fixtures-list/SelectionToolbar'

const CELLS: CellRef[] = [
  { rowId: 'fixture:a', col: 'colour' },
  { rowId: 'fixture:b', col: 'colour' },
]
const clearCells = vi.fn()

function bar(over: Partial<React.ComponentProps<typeof SelectionBar>> = {}) {
  return (
    <SelectionBar
      projectId={1}
      selection={null}
      cells={CELLS}
      cellEntryKey={false}
      cellClearKey={false}
      clearCells={clearCells}
      templateTargets={[
        { type: 'fixture', key: 'a' },
        { type: 'fixture', key: 'b' },
      ]}
      targetFamilies={['COLOUR']}
      targetEmitters={[]}
      marqueeDragging={false}
      {...over}
    />
  )
}

beforeEach(() => {
  clearCells.mockClear()
  shortViewport.current = false
})
afterEach(cleanup)

describe('SelectionBar', () => {
  it('folds the fixture count and the family badge on the phone arm, and keeps the cell count', () => {
    render(bar())
    expect(screen.getByText('2 fixtures')).toHaveClass(PHONE_FOLDED_CLASS)
    expect(screen.getByText('Colour')).toHaveClass(PHONE_FOLDED_CLASS)
    expect(screen.getByText('2 cells')).not.toHaveClass(PHONE_FOLDED_CLASS)
  })

  it('keeps the fixture count at every width when it is the only count', () => {
    // Rows selected and no cells: the row toolbar is there, and the count is the only one.
    render(bar({ cells: [], selection: <button type="button">Deselect all</button> }))
    expect(screen.getByText('2 fixtures')).not.toHaveClass(PHONE_FOLDED_CLASS)
  })

  it('says the fixture count on the cell count’s hover, since the phone shows it nowhere else', () => {
    render(bar())
    expect(screen.getByText('2 cells')).toHaveAttribute(
      'title',
      expect.stringMatching(/^2 fixtures · /),
    )
  })

  it('draws a Deselect for a cells-only marquee, at every width, and it drops the cells', () => {
    render(bar())
    const x = screen.getByRole('button', { name: 'Deselect cells' })
    expect(x).not.toHaveClass(PHONE_FOLDED_CLASS)
    fireEvent.click(x)
    expect(clearCells).toHaveBeenCalledTimes(1)
  })

  it('leaves Deselect to the row toolbar when there is one', () => {
    render(bar({ selection: <button type="button">Deselect all</button> }))
    expect(screen.queryByRole('button', { name: 'Deselect cells' })).not.toBeInTheDocument()
    expect(screen.getByText('Deselect all')).toBeInTheDocument()
  })

  it('draws no Deselect of its own with nothing selected', () => {
    render(bar({ cells: [], templateTargets: [] }))
    expect(screen.queryByRole('button', { name: 'Deselect cells' })).not.toBeInTheDocument()
    expect(screen.getByText('Nothing selected')).toBeInTheDocument()
  })
})
