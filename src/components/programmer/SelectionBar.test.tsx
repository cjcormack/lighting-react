// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CellRef } from '@/components/sheet/cellSelectionModel'
import type { ColumnKey } from '@/components/fixtures-list/columns'

/**
 * Row C's phone arm (`PD-SELECTION-BAR-DENSITY`, `PD-CLEAR-SELECTION-TOUCH`).
 *
 * jsdom evaluates no container query, so what is pinned is *which* element carries the fold
 * class — the fixture count and the family badge do, the cell count does not. The Deselect is the
 * toolbar's (`selection`) whichever shape the selection is in, since rows and cells became one
 * selection; this bar drew a second X for the cells-only case until then.
 */
vi.mock('./TemplateStrip', () => ({ TemplateStrip: () => <div data-testid="strip" /> }))
const shortViewport = vi.hoisted(() => ({ current: false }))
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => shortViewport.current }))

const { SelectionBar } = await import('./SelectionBar')
import { MID_FOLDED_CLASS, PHONE_FOLDED_CLASS } from '@/components/sheet/toolbarFolds'

const CELLS: CellRef<ColumnKey>[] = [
  { rowId: 'fixture:a', col: 'colour' },
  { rowId: 'fixture:b', col: 'colour' },
]

function bar(over: Partial<React.ComponentProps<typeof SelectionBar>> = {}) {
  return (
    <SelectionBar
      projectId={1}
      selection={null}
      cells={CELLS}
      cellEntryKey={false}
      cellClearKey={false}
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
  shortViewport.current = false
})
afterEach(cleanup)

describe('SelectionBar', () => {
  it('folds the fixture count at 800 and the family badge at 600, and keeps the cell count', () => {
    render(bar())
    // The count goes early, with Locate and Highlight, because that is what buys the template row
    // its chips on an iPad portrait; the badge is a phone-arm fold like the rest of the bar.
    expect(screen.getByText('2 fixtures')).toHaveClass(MID_FOLDED_CLASS)
    expect(screen.getByText('2 fixtures')).not.toHaveClass(PHONE_FOLDED_CLASS)
    expect(screen.getByText('Colour')).toHaveClass(PHONE_FOLDED_CLASS)
    expect(screen.getByText('2 cells')).not.toHaveClass(MID_FOLDED_CLASS)
    expect(screen.getByText('2 cells')).not.toHaveClass(PHONE_FOLDED_CLASS)
  })

  it('keeps the fixture count at every width when it is the only count', () => {
    // Rows selected and no cells: the row toolbar is there, and the count is the only one.
    render(bar({ cells: [], selection: <button type="button">Deselect all</button> }))
    expect(screen.getByText('2 fixtures')).not.toHaveClass(MID_FOLDED_CLASS)
    expect(screen.getByText('2 fixtures')).not.toHaveClass(PHONE_FOLDED_CLASS)
  })

  it('says the fixture count on the cell count’s hover, since the phone shows it nowhere else', () => {
    render(bar())
    expect(screen.getByText('2 cells')).toHaveAttribute(
      'title',
      expect.stringMatching(/^2 fixtures · /),
    )
  })

  it('draws no Deselect of its own — the toolbar carries it for cells and rows alike', () => {
    render(bar({ selection: <button type="button">Deselect all</button> }))
    expect(screen.queryByRole('button', { name: 'Deselect cells' })).not.toBeInTheDocument()
    expect(screen.getByText('Deselect all')).toBeInTheDocument()
  })

  it('draws no Deselect of its own with nothing selected', () => {
    render(bar({ cells: [], templateTargets: [] }))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Nothing selected')).toBeInTheDocument()
  })

  it('is a 40px line in both arms — the chrome system', () => {
    // Rows A, B and C are all 40 with 32px controls, so the verbs on this bar sit at the same
    // inset as the tools above them. It was 34, a 1px inset over 32px verbs and 26px chips.
    const live = render(bar())
    expect(live.container.firstElementChild!.className).toContain('h-10')
    expect(live.container.firstElementChild!.className).not.toContain('h-[34px]')
    live.unmount()
    const reserved = render(bar({ cells: [], templateTargets: [] }))
    expect(reserved.container.firstElementChild!.className).toContain('h-10')
  })
})
