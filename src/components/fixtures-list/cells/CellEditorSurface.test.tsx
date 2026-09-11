// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CELL_EDITOR_SHEET_QUERY,
  CellEditorSurface,
  resetCellEditorSurfaceMedia,
} from './CellEditorSurface'

/**
 * Which of the three shapes a cell editor takes, and the listeners behind the decision.
 *
 * Three things here can fail silently on a desk and only show up on a phone: a query string
 * `matchMedia` cannot parse (it answers `false` rather than throwing, so the fold simply never
 * happens — the trap `shortViewport.test.ts` guards for the rest of the short-viewport arm), the
 * precedence between the two queries (a landscape phone matches *both*, and answering it with the
 * bottom sheet gives it the one shape that needs the height it has not got), and the media
 * subscription quietly becoming per-cell, which costs a listener per visible cell on a rig of any
 * size and is invisible in every rendering of the grid.
 */

/** A `matchMedia` this file controls the answers of, counting the listeners hung off it. */
function stubMatchMedia({ narrow, short }: { narrow: boolean; short: boolean }): {
  listenerCount: () => number
} {
  let count = 0
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width') ? narrow : query.includes('max-height') ? short : false,
    media: query,
    onchange: null,
    addEventListener: () => {
      count += 1
    },
    removeEventListener: () => {
      count -= 1
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
  return { listenerCount: () => count }
}

function Surface({ title = 'Dimmer' }: { title?: string }) {
  return (
    <CellEditorSurface
      open
      onOpenChange={() => {}}
      title={title}
      contentClassName="w-64"
      trigger={<button type="button">cell</button>}
    >
      <p>editor body</p>
    </CellEditorSurface>
  )
}

/** What the mounted editor is drawing itself as, from the attribute the surface stamps. */
function form(): string | null {
  return document.querySelector('[data-cell-editor-surface]')?.getAttribute('data-cell-editor-surface') ?? null
}

beforeEach(() => {
  resetCellEditorSurfaceMedia()
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetCellEditorSurfaceMedia()
})

describe('CellEditorSurface', () => {
  it('floats a popover at desk sizes', () => {
    stubMatchMedia({ narrow: false, short: false })
    render(<Surface />)

    expect(form()).toBe('popover')
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
    expect(screen.getByText('editor body')).toBeVisible()
  })

  it('drops a bottom sheet on an upright phone, titled by the column', () => {
    stubMatchMedia({ narrow: true, short: false })
    render(<Surface title="Colour" />)

    expect(form()).toBe('bottom-sheet')
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull()
    // A sheet is a Radix dialog, and a dialog with no accessible name is unreadable. The title is
    // also the only thing on screen saying which column the editor belongs to, since a sheet is
    // anchored to the screen rather than to the cell.
    expect(screen.getByText('Colour')).toBeVisible()
    expect(screen.getByText('editor body')).toBeVisible()
  })

  it('uses the right-hand sheet where the viewport is short but not narrow', () => {
    stubMatchMedia({ narrow: false, short: true })
    render(<Surface />)

    expect(form()).toBe('side-sheet')
  })

  it('prefers the side sheet when the viewport is short AND narrow', () => {
    // A landscape phone matches both queries. The bottom sheet is the one shape that needs the
    // vertical room a short viewport has not got, so short has to win — this is the assertion that
    // fails if the two arms are ever reordered.
    stubMatchMedia({ narrow: true, short: true })
    render(<Surface />)

    expect(form()).toBe('side-sheet')
  })

  it('shares one media listener per query, however many cells are mounted', () => {
    const media = stubMatchMedia({ narrow: false, short: false })
    render(
      <>
        <Surface title="Dimmer" />
        <Surface title="Colour" />
        <Surface title="Position" />
      </>,
    )

    // Two queries, three editors. Not "at most six": the point is that the count does not track
    // the number of editors, which the grid mounts one of per visible cell.
    expect(media.listenerCount()).toBe(2)
  })

  it('asks a width question `matchMedia` can parse, one pixel below the `sm` breakpoint', () => {
    // `matchMedia` answers `false` for a string it cannot parse rather than throwing, so a typo
    // here is a fold that silently never happens on the only devices that want it — and jsdom
    // implements no `matchMedia` to parse it with, so the shape is pinned instead. The height
    // query's spelling is pinned beside its four siblings in `shortViewport.test.ts`.
    const match = /^\(max-width: (\d+)px\)$/.exec(CELL_EDITOR_SHEET_QUERY)
    expect(match, `${CELL_EDITOR_SHEET_QUERY} is not a max-width query`).not.toBeNull()
    // The sheet primitive's own `sm:max-w-sm` is the other half of this decision: below the width
    // at which a sheet stops filling the screen is exactly where a popover stops having room.
    expect(Number(match?.[1])).toBe(639)
  })
})
