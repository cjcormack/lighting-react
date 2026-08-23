// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Everything store-connected is mocked away: the point of this suite is the GESTURE, not the data.
vi.mock('./useRowValues', () => ({
  useRowValues: () => ({
    dimmer: { kind: 'slider', min: 0.5, max: 0.5, isUniform: true },
  }),
  buildRowCells: () => [
    {
      col: 'dimmer',
      resolutions: [{ kind: 'slider', property: { min: 0, max: 255 } }],
      keys: [],
    },
  ],
}))
vi.mock('./useRowOwnership', () => ({ useRowOwnership: () => ({}) }))
// jsdom lays nothing out, so the real virtualizer measures a zero-height scroller and renders no
// rows at all. Stubbed to render them all — this suite is about the pointer gesture, not windowing.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number
    estimateSize: () => number
  }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * estimateSize(),
        size: estimateSize(),
      })),
    scrollToIndex: () => {},
  }),
}))
vi.mock('../fixtures/LocateButton', () => ({ LocateButton: () => null }))

import { FixturesTable } from './FixturesTable'
import { useCellSelection } from './useCellSelection'
import type { Row } from './rowModel'
import type { ColumnKey } from './columns'

const ROWS: Row[] = [
  {
    kind: 'fixture',
    id: 'fixture:a',
    depth: 0,
    fixture: { key: 'a', name: 'SL Wash 1' },
  },
  {
    kind: 'fixture',
    id: 'fixture:b',
    depth: 0,
    fixture: { key: 'b', name: 'SL Wash 2' },
  },
] as unknown as Row[]

const onBeginCellEdit = vi.fn()

function Harness() {
  const cellSelection = useCellSelection(new Set(ROWS.map(r => r.id)))
  return (
    <FixturesTable
      rows={ROWS}
      visibleColumns={['dimmer'] as ColumnKey[]}
      isSelected={() => false}
      onRowClick={() => {}}
      onToggleExpand={() => {}}
      onBeginCellEdit={onBeginCellEdit}
      onCellCommit={() => {}}
      batchCountFor={() => 1}
      onShowInfo={() => {}}
      showOwnership
      cellSelection={cellSelection}
    />
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

/** The value cell's popover trigger — the button the marquee must not fight with. */
const cellButton = () =>
  screen.getAllByRole('button').find(b => b.className.includes('h-full'))!

/**
 * jsdom lays nothing out, so the marquee's *geometry* is tested in `cellMarquee.test.ts` where it
 * is pure. What is testable here is the discriminator — press-and-release versus press-drag-release
 * — and that matters because it rests on an assumption about a third-party component: Radix
 * `Popover` opens on `click`, not `pointerdown`. If a shadcn bump ever changed that, drag-select
 * would start opening editors mid-drag and no geometry test would notice.
 */
describe('FixturesTable cell gesture', () => {
  it('a press with no travel is still a click, and opens the editor', () => {
    render(<Harness />)
    const cell = cellButton()
    fireEvent.pointerDown(cell, { button: 0, clientX: 300, clientY: 100 })
    fireEvent.pointerUp(cell, { button: 0, clientX: 300, clientY: 100 })
    fireEvent.click(cell)
    expect(onBeginCellEdit).toHaveBeenCalled()
  })

  it('a press that travels is a marquee, and the trailing click is swallowed', () => {
    // Without the capture-phase suppressor the cell under the release point opens its editor on
    // top of the selection just made.
    render(<Harness />)
    const cell = cellButton()
    fireEvent.pointerDown(cell, { button: 0, clientX: 300, clientY: 100 })
    // `buttons: 1` is what a real drag sends, and the handler relies on it: a `pointermove`
    // with no button held means the press was released somewhere this element never saw, and
    // the armed gesture is disarmed rather than turned into a marquee on a plain hover.
    fireEvent.pointerMove(cell, {
      button: 0,
      buttons: 1,
      clientX: 380,
      clientY: 160,
    })
    fireEvent.pointerUp(cell, { button: 0, clientX: 380, clientY: 160 })
    fireEvent.click(cell)
    expect(onBeginCellEdit).not.toHaveBeenCalled()
  })

  it('disarms a press whose release it never saw, rather than marqueeing on hover', () => {
    // Release over the sticky header, the scrollbar or outside the window: no pointer capture was
    // taken (that only happens past the threshold), so no `pointerup` reaches the rows wrapper. The
    // next plain hover must not resume a gesture from a start point set minutes ago.
    render(<Harness />)
    const cell = cellButton()
    fireEvent.pointerDown(cell, { button: 0, clientX: 300, clientY: 100 })
    fireEvent.pointerMove(cell, { buttons: 0, clientX: 380, clientY: 160 })
    fireEvent.pointerMove(cell, { buttons: 0, clientX: 420, clientY: 200 })

    // THE assertion: no rubber band was ever drawn, i.e. no gesture ran. The *selection* cannot be
    // asserted here — jsdom reports every rect as zero, so `columnRange` matches nothing and the
    // count stays 0 whatever happens (the geometry is covered for real in `cellMarquee.test.ts`).
    // The band is set from the pointer alone, so it is the one part of the gesture jsdom can see.
    expect(screen.queryByTestId('cell-marquee')).toBeNull()

    fireEvent.click(cell)
    expect(onBeginCellEdit).toHaveBeenCalled()
  })

  it('ignores a non-primary button', () => {
    render(<Harness />)
    const cell = cellButton()
    fireEvent.pointerDown(cell, { button: 2, clientX: 300, clientY: 100 })
    fireEvent.pointerMove(cell, {
      button: 2,
      buttons: 2,
      clientX: 380,
      clientY: 160,
    })
    fireEvent.pointerUp(cell, { button: 2, clientX: 380, clientY: 160 })
    fireEvent.click(cell)
    expect(onBeginCellEdit).toHaveBeenCalled()
  })
})
