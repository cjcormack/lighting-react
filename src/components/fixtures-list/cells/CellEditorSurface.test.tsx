// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CELL_EDITOR_SHEET_QUERY,
  CellEditorSurface,
  cellEditorIsOpen,
  resetCellEditorSurfaceMedia,
} from './CellEditorSurface'
import { openCellEditorTarget } from '../cellEntry'

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

/**
 * A cell whose click behaves the programmer's way: the trigger selects and never opens, and the
 * editor — when something else opens it — is anchored at the button passed in rather than at the
 * cell. `openFromOutside` stands in for the selection bar's Set.
 */
function SelectOnlySurface({ withAnchor = true }: { withAnchor?: boolean }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  return (
    <>
      <button type="button" ref={anchorRef} onClick={() => setOpen(true)}>
        Set
      </button>
      <CellEditorSurface
        open={open}
        onOpenChange={setOpen}
        title="Dimmer"
        contentClassName="w-64"
        triggerOpens={false}
        anchorRef={withAnchor ? anchorRef : undefined}
        trigger={
          <button type="button" onClick={() => selected()}>
            cell
          </button>
        }
      >
        <p>editor body</p>
      </CellEditorSurface>
    </>
  )
}

const selected = vi.fn()

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

describe('CellEditorSurface click behaviour', () => {
  beforeEach(() => {
    selected.mockClear()
    stubMatchMedia({ narrow: false, short: false })
  })

  it('a click on the trigger selects instead of opening, where `triggerOpens` is false', () => {
    // The whole of item 3: on the programmer's grid a click says *what* to edit, and Set says
    // *edit it*. The trigger is a `PopoverAnchor` there rather than a `PopoverTrigger`, so Radix
    // has nothing to toggle and the button's own `onClick` is all a click does.
    render(<SelectOnlySurface />)
    fireEvent.click(screen.getByText('cell'))
    expect(selected).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('editor body')).toBeNull()
  })

  it('opens at the anchor it is given, not at the cell', async () => {
    // floating-ui measures whatever Radix hands it as the reference element, so the proof that the
    // Set button is the anchor is that the Set button is what gets measured — and that the cell is
    // not. Nothing else about the position is observable in jsdom, which lays nothing out.
    render(<SelectOnlySurface />)
    const setButton = screen.getByText('Set')
    const cell = screen.getByText('cell')
    const setRect = vi.spyOn(setButton, 'getBoundingClientRect')
    const cellRect = vi.spyOn(cell, 'getBoundingClientRect')

    fireEvent.click(setButton)

    expect(screen.getByText('editor body')).toBeVisible()
    // floating-ui measures from an effect and resolves a promise, so the read is a tick behind
    // the open.
    await waitFor(() => expect(setRect).toHaveBeenCalled())
    expect(cellRect).not.toHaveBeenCalled()
  })

  it('opens beside the cell when the opener passes no anchor — the keyboard\'s case', async () => {
    // Enter and a typed character are gestures made *at the selection*, with the operator's eye on
    // the grid, so their editor belongs beside the cell. The cells express that by withholding the
    // anchor (`atButton ? editorAnchorRef : undefined`) rather than by a second prop here.
    render(<SelectOnlySurface withAnchor={false} />)
    const cell = screen.getByText('cell')
    const setButton = screen.getByText('Set')
    const cellRect = vi.spyOn(cell, 'getBoundingClientRect')
    const setRect = vi.spyOn(setButton, 'getBoundingClientRect')

    fireEvent.click(setButton)

    await waitFor(() => expect(cellRect).toHaveBeenCalled())
    expect(setRect).not.toHaveBeenCalled()
  })

  it('falls back to the cell when there is no anchor to open at', async () => {
    // A `virtualRef` whose `current` is null would set Radix's anchor to null and the content
    // would never be positioned at all, so "no Set button" has to mean the cell rather than
    // nothing. The two plain list routes pass no anchor and are the case this protects.
    render(<SelectOnlySurface withAnchor={false} />)
    const cell = screen.getByText('cell')
    const cellRect = vi.spyOn(cell, 'getBoundingClientRect')

    fireEvent.click(screen.getByText('Set'))

    expect(screen.getByText('editor body')).toBeVisible()
    await waitFor(() => expect(cellRect).toHaveBeenCalled())
  })
})

describe('cellEditorIsOpen', () => {
  // The grid's window-level Escape asks this instead of asking where the key was pressed, because
  // Radix closes an open editor from a document listener wherever focus is — so the two questions
  // disagree exactly when focus has been left somewhere unexpected, which is what pressing Set
  // twice does. Answering it from the DOM is what keeps one bit from becoming a subscription per
  // cell.
  it('is false with nothing open and true while an editor is on screen', () => {
    stubMatchMedia({ narrow: false, short: false })
    expect(cellEditorIsOpen()).toBe(false)

    const { unmount } = render(<SelectOnlySurface />)
    expect(cellEditorIsOpen()).toBe(false)

    fireEvent.click(screen.getByText('Set'))
    expect(cellEditorIsOpen()).toBe(true)

    unmount()
    expect(cellEditorIsOpen()).toBe(false)
  })

  it('sees a sheet as readily as a popover — Escape must behave in all three forms', () => {
    stubMatchMedia({ narrow: true, short: false })
    render(<SelectOnlySurface />)
    fireEvent.click(screen.getByText('Set'))
    expect(form()).toBe('bottom-sheet')
    expect(cellEditorIsOpen()).toBe(true)
  })
})

/**
 * `data-state` on the trigger is the grid's addressing contract: it is what says *which cell* the
 * open editor belongs to once the panel itself is anchored somewhere else (the Set button) or
 * portalled to the screen edge (either sheet). The selection bar's Set reads it to decide which
 * editor to shut, so it has to be there in **all three** forms, not just the popover.
 */
describe('CellEditorSurface trigger state', () => {
  function cellGrid(children: React.ReactNode) {
    return (
      <div data-row-id="fixture:a">
        <div data-cell="dimmer">{children}</div>
      </div>
    )
  }

  function SurfaceInCell({ withAnchor = true }: { withAnchor?: boolean }) {
    const anchorRef = useRef<HTMLButtonElement | null>(null)
    return cellGrid(
      <>
        <button type="button" ref={anchorRef}>
          Set
        </button>
        <CellEditorSurface
          open
          onOpenChange={() => {}}
          title="Dimmer"
          contentClassName="w-64"
          triggerOpens={false}
          anchorRef={withAnchor ? anchorRef : undefined}
          trigger={<button type="button">cell</button>}
        >
          <p>editor body</p>
        </CellEditorSurface>
      </>,
    )
  }

  it('marks the cell in every form, so Set can find the editor it opened', () => {
    // The sheet forms are what this caught: a sheet is portalled to `body` exactly as a popover is,
    // so with the marker left off nothing inside `[data-cell]` said an editor was open and Set's
    // second press could never close one on a phone or a short viewport.
    for (const media of [
      { narrow: false, short: false },
      { narrow: true, short: false },
      { narrow: false, short: true },
    ]) {
      resetCellEditorSurfaceMedia()
      stubMatchMedia(media)
      const { unmount } = render(<SurfaceInCell />)
      expect(openCellEditorTarget()).toEqual({ rowId: 'fixture:a', col: 'dimmer' })
      unmount()
      vi.unstubAllGlobals()
    }
  })

})
