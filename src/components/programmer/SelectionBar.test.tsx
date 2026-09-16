// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
// The desk chip's readers: the desk's fact and this tab's name; follow/local is the real store.
const desk = vi.hoisted(() => ({
  snapshot: { targets: [], families: null, source: null } as DeskSelectionSnapshot,
}))
vi.mock('@/store/selection', async () => {
  const { useDeskFollow } = await import('@/lib/deskFollow')
  return {
    useDeskSelectionSnapshot: () => desk.snapshot,
    // The press mask: the desk's while following, the marquee's own when not — the real rule, over
    // the mocked snapshot and the real (subscribed) follow store.
    usePressFamilies: (local: AttributeFamily[] | null) =>
      useDeskFollow() ? desk.snapshot.families : local,
  }
})
vi.mock('@/lib/windowIdentity', () => ({ useWindowName: () => 'Screen 1' }))
// The chip resolves "this window" through the windows registry now; an empty registry means it
// falls back to comparing names, which is what these tests were written against.
vi.mock('@/store/windows', () => ({ useDeskWindows: () => [], thisWindowRow: () => null }))

const { SelectionBar } = await import('./SelectionBar')
import { MID_FOLDED_CLASS, PHONE_FOLDED_CLASS } from '@/components/sheet/toolbarFolds'
import type { DeskSelectionSnapshot } from '@/api/selectionApi'
import type { AttributeFamily } from '@/lib/attributeFamily'
import { resetDeskFollowStores } from '@/lib/deskFollow'

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
  desk.snapshot = { targets: [], families: null, source: null }
})
afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  resetDeskFollowStores()
})

describe('SelectionBar', () => {
  it('folds the fixture count at 800 and the family badge at 600, and keeps the cell count', () => {
    desk.snapshot = { targets: [], families: ['COLOUR'], source: null }
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
    expect(screen.queryByRole('button', { name: /Deselect/ })).not.toBeInTheDocument()
    expect(screen.getByText('Nothing selected')).toBeInTheDocument()
  })

  /**
   * The family pill is the mask the next press carries (multi-screen plan D4): the desk's while
   * following — even over a row-only selection, which is how the bridge lands another window's
   * mask — and the marquee's own when unlinked. The plain lists keep the marquee's reading.
   */
  describe('the family pill', () => {
    it('reads the desk’s mask while following, over rows with no cells', () => {
      desk.snapshot = { targets: [], families: ['POSITION'], source: { kind: 'window', name: 'Screen 2' } }
      render(bar({ cells: [], selection: <button type="button">Deselect all</button> }))
      expect(screen.getByText('Position')).toBeInTheDocument()
    })

    it('draws none while following an unmasked desk, whatever the marquee names', () => {
      desk.snapshot = { targets: [], families: null, source: null }
      render(bar())
      expect(screen.queryByText('Colour')).not.toBeInTheDocument()
    })

    it('reads the marquee’s own families once unlinked', () => {
      desk.snapshot = { targets: [], families: ['POSITION'], source: null }
      render(bar())
      fireEvent.click(screen.getByRole('button', { name: 'Desk' }))
      expect(screen.getByText('Colour')).toBeInTheDocument()
      expect(screen.queryByText('Position')).not.toBeInTheDocument()
    })

    it('reads the marquee’s families on the plain lists, which never bridge', () => {
      desk.snapshot = { targets: [], families: ['POSITION'], source: null }
      render(bar({ projectId: undefined }))
      expect(screen.getByText('Colour')).toBeInTheDocument()
    })
  })

  /**
   * The desk chip (multi-screen plan §4, D7): between the family pill and the strip, on the
   * programmer only — the plain lists never bridge to the desk (D1), so a chip there would name a
   * link that does not exist. Four readings, the last mover never being this window.
   */
  describe('the desk chip', () => {
    it('sits between the family pill and the strip', () => {
      desk.snapshot = { targets: [], families: ['COLOUR'], source: null }
      render(bar())
      const chip = screen.getByRole('button', { name: 'Desk' })
      const pill = screen.getByText('Colour')
      const strip = screen.getByTestId('strip')
      expect(pill.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(chip.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('is drawn with nothing selected too, so a window can unlink before it selects', () => {
      render(bar({ cells: [], templateTargets: [] }))
      expect(screen.getByRole('button', { name: 'Desk' })).toBeInTheDocument()
    })

    it('is not drawn on the plain lists', () => {
      render(bar({ projectId: undefined }))
      expect(screen.queryByRole('button', { name: /Desk|This window/ })).not.toBeInTheDocument()
    })

    it('reads `Desk` when this window moved the selection last', () => {
      desk.snapshot = { targets: [], families: null, source: { kind: 'window', name: 'Screen 1' } }
      render(bar())
      expect(screen.getByRole('button', { name: 'Desk' })).toBeInTheDocument()
    })

    it('names the other window, or the desk, that moved it last', () => {
      desk.snapshot = { targets: [], families: null, source: { kind: 'window', name: 'Screen 2' } }
      const first = render(bar())
      expect(screen.getByRole('button', { name: 'Desk · from Screen 2' })).toBeInTheDocument()
      first.unmount()
      desk.snapshot = { targets: [], families: null, source: { kind: 'surface', name: 'Control surface' } }
      render(bar())
      expect(screen.getByRole('button', { name: 'Desk · from the desk' })).toBeInTheDocument()
    })

    it('flips to a dashed `This window` on a click, and back', () => {
      render(bar())
      fireEvent.click(screen.getByRole('button', { name: 'Desk' }))
      const local = screen.getByRole('button', { name: 'This window' })
      expect(local.className).toContain('border-dashed')
      fireEvent.click(local)
      expect(screen.getByRole('button', { name: 'Desk' })).toBeInTheDocument()
    })
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
