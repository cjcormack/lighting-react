// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Everything store-connected is mocked away: the point of this suite is the GESTURE, not the data.
// `aggregateCellValue` is passed through to the real thing: the scoped-value path runs a staged
// value through the *same* aggregation the live read uses, and stubbing it would test nothing.
vi.mock('./useRowValues', async () => ({
  aggregateCellValue: (await vi.importActual<typeof import('./useRowValues')>('./useRowValues'))
    .aggregateCellValue,
  useRowValues: () => ({
    dimmer: { kind: 'slider', min: 0.5, max: 0.5, isUniform: true },
  }),
  buildRowCells: () => [
    {
      col: 'dimmer',
      // A real channel ref, because the scoped-value path stages a value onto a resolution's
      // channels before aggregating it — the same maths as the live read, by construction.
      resolutions: [
        {
          kind: 'slider',
          property: {
            name: 'dimmer',
            category: 'dimmer',
            min: 0,
            max: 255,
            channel: { universe: 0, channelNo: 1 },
          },
        },
      ],
      targetKeys: ['a'],
      keys: [],
    },
  ],
}))
const ownership = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('./useRowOwnership', () => ({ useRowOwnership: () => ownership.current }))

// The programmer's scope, driven directly rather than through its provider — that one needs a
// Redux store, and what is under test here is how a *cell* renders per scope.
const scopeState = vi.hoisted(() => ({
  current: null as null | { kind: 'output' | 'local' | 'layer'; layerId?: number },
}))
const scopeActions = vi.hoisted(() => ({
  setScope: vi.fn(),
  // Answers "is this layer in the programmer's stack?" — false for a cue's layer id, which is the
  // guard the jump overlay leans on.
  focusLayer: vi.fn((layerId: number) => layerId === 7),
}))
vi.mock('../programmer/ProgrammerScope', () => ({
  useProgrammerScope: () => scopeState.current,
  useProgrammerScopeActions: () => scopeActions,
}))
const lookStore = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../programmer/LookRowStore', async () => ({
  useLookRowStore: () => lookStore.current,
  lookRowKey: (await vi.importActual<typeof import('../programmer/lookRowKey')>(
    '../programmer/lookRowKey',
  )).lookRowKey,
}))
// The *template* half of layer scope, driven the same way. Mutually exclusive with `lookStore` by
// construction: a layer applies one or the other.
const focusedTemplate = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../programmer/FocusedTemplateLayer', () => ({
  useFocusedTemplateLayer: () => focusedTemplate.current,
}))

/** A focused template layer, in the shape `FocusedTemplateLayer` provides. */
function templateLayer(over: Record<string, unknown> = {}) {
  return {
    layerId: 7,
    templateId: 4,
    name: 'Amber Breathe',
    template: {
      kind: 'effect',
      effect: { beatDivision: 0.5, timingSource: 'BEAT' },
    },
    kind: 'effect',
    mask: [],
    targetedKeys: null,
    targets: [],
    ...over,
  }
}

/** A focused-layer store with no pending edits — the draft is exercised in its own suite. */
function layerStore(over: Record<string, unknown>) {
  return {
    lookId: 3,
    draft: { get: () => undefined, subscribe: () => () => {} },
    setValue: () => {},
    serverRows: new Map(),
    targetedKeys: null,
    propertyMask: null,
    deferredRows: [],
    elementRows: [],
    loaded: true,
    ...over,
  }
}
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
// The socket's readyState, driven directly for the same reason the scope is: the real hook is an
// RTK Query subscription and this suite deliberately mounts without a Provider.
const deskConnected = vi.hoisted(() => ({ current: true }))
vi.mock('../../store/status', () => ({
  useIsDeskConnected: () => deskConnected.current,
}))

import { FixturesTable } from './FixturesTable'
import { EditorContextProvider } from '../programmer/EditorContext'
import { useCellSelection } from './useCellSelection'
import type { Row } from './rowModel'
import { lookRowKey } from '../programmer/lookRowKey'
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
  scopeState.current = null
  lookStore.current = null
  focusedTemplate.current = null
  ownership.current = {}
  deskConnected.current = true
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

  it('a marquee ends with focus on the document, not on the trigger the press began on', () => {
    // Chromium focuses a `<button>` on mousedown, and every cell trigger is one — so without this
    // a mouse-drawn marquee left that button focused and the container's window handler read the
    // operator's Enter as "from a focused control", opening one cell's popover instead of the
    // typed-value field. Safari does not focus buttons on mousedown, which hid it there.
    render(<Harness />)
    const cell = cellButton()
    cell.focus()
    expect(document.activeElement).toBe(cell)
    fireEvent.pointerDown(cell, { button: 0, clientX: 300, clientY: 100 })
    fireEvent.pointerMove(cell, { button: 0, buttons: 1, clientX: 380, clientY: 160 })
    fireEvent.pointerUp(cell, { button: 0, clientX: 380, clientY: 160 })
    expect(document.activeElement).toBe(document.body)
    // The trailing click a real release generates; the drag's one-shot swallower is waiting for
    // it, and would otherwise eat the next test's first click.
    fireEvent.click(cell)
  })

  it('a press with no travel leaves focus where the browser put it — Tab-then-Enter still opens the editor', () => {
    render(<Harness />)
    const cell = cellButton()
    cell.focus()
    fireEvent.pointerDown(cell, { button: 0, clientX: 300, clientY: 100 })
    fireEvent.pointerUp(cell, { button: 0, clientX: 300, clientY: 100 })
    expect(document.activeElement).toBe(cell)
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

/** The wrapper the scope classes land on — the cell button's parent. */
const cellWrapper = () => cellButton().parentElement!

const jumpButton = () =>
  screen.queryAllByRole('button').find((b) => b.className.includes('cursor-zoom-in'))

describe('FixturesTable scopes', () => {
  it('leaves a list with no scope exactly as it was', () => {
    // `/fixtures` and `/groups` mount this table with no programmer scope anywhere above them.
    // They must not inherit Output's read-only-ness, or the two plain list routes silently stop
    // being editable — the one regression this seam could cause that nobody would attribute to it.
    render(<Harness />)
    expect(cellWrapper().className).not.toContain('pointer-events-none')
    expect(screen.queryByText('—')).toBeNull()
    expect(screen.getAllByText('0%').length).toBe(ROWS.length)
  })

  it('makes Output a read, not an editor', () => {
    scopeState.current = { kind: 'output' }
    render(<Harness />)
    // The value is still the cook's — Output shows everything — but the cell does not take a click.
    expect(screen.getAllByText('0%').length).toBe(ROWS.length)
    expect(cellWrapper().className).toContain('pointer-events-none')
  })

  it('shows an em-dash, not a zero, where the focused layer holds nothing', () => {
    scopeState.current = { kind: 'layer', layerId: 7 }
    lookStore.current = layerStore({})
    render(<Harness />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    // A zero here would be a lie about a Look that says nothing about this head, and the live
    // reading would be the rig's answer to a question about the Look.
    expect(screen.queryAllByText('0%')).toHaveLength(0)
  })

  it('rings a cell the focused layer does set', () => {
    scopeState.current = { kind: 'layer', layerId: 7 }
    lookStore.current = layerStore({ serverRows: new Map([[lookRowKey('a', 'dimmer'), { kind: 'level', value: 128 }]]) })
    render(<Harness />)
    expect(screen.getAllByText('50%').length).toBe(ROWS.length)
    expect(cellWrapper().className).toContain('ring-primary/70')
  })

  it('greys a column outside the layer mask, and says so rather than hiding it', () => {
    scopeState.current = { kind: 'layer', layerId: 7 }
    // Dimmer is INTENSITY, so a COLOUR-only layer asserts nothing here.
    lookStore.current = layerStore({ propertyMask: 'COLOUR' })
    render(<Harness />)
    expect(cellWrapper().className).toContain('opacity-40')
    expect(cellWrapper().className).toContain('pointer-events-none')
  })

  it('shows the live value, ringed and with the wave, on an effect template layer', () => {
    scopeState.current = { kind: 'layer', layerId: 7 }
    focusedTemplate.current = templateLayer()
    const { container } = render(<Harness />)
    // The **live** read, not an em-dash: an effect is one rule for every head, and what is worth
    // watching is what it is producing right now. Same value Output shows, which is the point.
    expect(screen.getAllByText('0%').length).toBe(ROWS.length)
    expect(cellWrapper().className).toContain('ring-primary/70')
    expect(container.querySelector('svg.lucide-audio-waveform')).not.toBeNull()
    // 0.5 beats is an eighth note — the label the whole desk uses for that division.
    expect(screen.getAllByText('1/8').length).toBeGreaterThan(0)
  })

  it('shows nothing per fixture on a value template layer', () => {
    scopeState.current = { kind: 'layer', layerId: 7 }
    focusedTemplate.current = templateLayer({ kind: 'value', template: { kind: 'value', effect: null } })
    const { container } = render(<Harness />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(container.querySelector('svg.lucide-audio-waveform')).toBeNull()
  })

  it('refuses the edit through the keyboard too, not only the pointer', () => {
    // The pointer guard is `pointer-events-none` on the wrapper; the trigger stays tabbable, so
    // Tab-then-Enter would otherwise open an editor whose commit falls through `useCellWriters`
    // to a **live** write — literals in Local, on a grid drawing itself as a read.
    scopeState.current = { kind: 'layer', layerId: 7 }
    focusedTemplate.current = templateLayer()
    render(<Harness />)
    expect(cellWrapper().className).toContain('pointer-events-none')
    expect(cellButton()).toBeDisabled()
  })

  it('disables an Output cell for the keyboard as well, for the same reason', () => {
    scopeState.current = { kind: 'output' }
    render(<Harness />)
    expect(cellButton()).toBeDisabled()
  })

  it('badges an effect-driven cell with the FX wave, and nothing else', () => {
    // The violet ring alone was too quiet beside the blue ones; the badge is what says "this value
    // is moving and Record will not take it" without a hover.
    ownership.current = {
      dimmer: { source: 'effect', touched: false, isUniform: true, owners: [] },
      colour: { source: 'programmer', touched: true, isUniform: true, owners: [] },
    }
    render(<Harness />)
    // One per effect-owned cell (the harness renders more than one row), and never on the
    // programmer-owned colour cells beside them.
    const badges = screen.getAllByTestId('effect-badge')
    expect(badges.length).toBeGreaterThan(0)
    for (const badge of badges) {
      expect(badge.closest('[data-cell]')).toHaveAttribute('data-cell', 'dimmer')
    }
  })

  it('makes an Output tint a destination — clicking jumps to the layer that won it', () => {
    // What makes the ownership colours worth learning: they are navigational, not decorative.
    scopeState.current = { kind: 'output' }
    ownership.current = {
      dimmer: {
        source: 'cue',
        touched: false,
        isUniform: true,
        owners: [],
        layer: { layerId: 7, lookId: 3, name: 'Warm Wash', mixed: false },
      },
    }
    render(<Harness />)
    fireEvent.click(jumpButton()!)
    expect(scopeActions.focusLayer).toHaveBeenCalledWith(7)
  })

  it('does not offer a jump for a cell more than one layer contributed to', () => {
    // A `mixed` cell has no single owner to name, so a cursor promising a jump would be lying.
    scopeState.current = { kind: 'output' }
    ownership.current = {
      dimmer: {
        source: 'cue',
        touched: false,
        isUniform: false,
        owners: [],
        layer: { mixed: true },
      },
    }
    render(<Harness />)
    expect(jumpButton()).toBeUndefined()
  })

  it("goes nowhere when the layer belongs to a cue rather than the programmer's stack", () => {
    // `ProvenanceEntry.layerId` is present for a cue's layers too. Landing the grid on a layer
    // this stack does not hold is the trap; `focusLayer` reports it and the click falls through.
    scopeState.current = { kind: 'output' }
    ownership.current = {
      dimmer: {
        source: 'cue',
        touched: false,
        isUniform: true,
        owners: [],
        layer: { layerId: 99, lookId: 3, name: 'A cue layer', mixed: false },
      },
    }
    render(<Harness />)
    fireEvent.click(jumpButton()!)
    expect(scopeActions.focusLayer).toHaveBeenCalledWith(99)
    expect(scopeActions.setScope).not.toHaveBeenCalled()
  })

  it('jumps a programmer-owned cell to Local, so every tint has a destination', () => {
    scopeState.current = { kind: 'output' }
    ownership.current = {
      dimmer: { source: 'programmer', touched: true, isUniform: true, owners: ['web'] },
    }
    render(<Harness />)
    fireEvent.click(jumpButton()!)
    expect(scopeActions.setScope).toHaveBeenCalledWith({ kind: 'local' })
  })

  it('offers no jump in Local scope — there is nowhere left to go', () => {
    scopeState.current = { kind: 'local' }
    ownership.current = {
      dimmer: {
        source: 'cue',
        touched: false,
        isUniform: true,
        owners: [],
        layer: { layerId: 7, lookId: 3, name: 'Warm Wash', mixed: false },
      },
    }
    render(<Harness />)
    expect(jumpButton()).toBeUndefined()
  })

  it('dashes a fixture outside the layer targets, and refuses the edit rather than widening them', () => {
    scopeState.current = { kind: 'layer', layerId: 7 }
    // The Look has a value for `a`; this layer's targets exclude it.
    lookStore.current = layerStore({
      serverRows: new Map([[lookRowKey('a', 'dimmer'), { kind: 'level', value: 128 }]]),
      targetedKeys: new Set(['somewhere-else']),
    })
    render(<Harness />)
    // The value still shows — "this Look has a value for it, this layer filters it out" is the
    // useful reading, and hiding it would make the layer look empty.
    expect(screen.getAllByText('50%').length).toBe(ROWS.length)
    expect(cellWrapper().className).toContain('border-dashed')
    // A marquee dragged across the grid must never quietly widen a layer to the whole rig.
    expect(cellWrapper().className).toContain('pointer-events-none')
  })
})

describe('FixturesTable with the desk unreachable', () => {
  it('makes the cells inert rather than taking edits that go nowhere', () => {
    // A cell edit is a `programmer.*` WS write, and the grid reads its values back from the
    // server — so with the socket down the drag does nothing and the cell snaps back with no
    // explanation. Inert says so up front.
    deskConnected.current = false
    render(<Harness />)
    expect(cellWrapper().className).toContain('pointer-events-none')
  })

  it('leaves a focused Look layer editable — that edit is a local draft, not a wire write', () => {
    deskConnected.current = false
    scopeState.current = { kind: 'layer', layerId: 7 }
    lookStore.current = layerStore({
      serverRows: new Map([[lookRowKey('a', 'dimmer'), { kind: 'level', value: 128 }]]),
    })
    render(
      <EditorContextProvider value={{ kind: 'lookLayer', layerId: 7, lookId: 3 }}>
        <Harness />
      </EditorContextProvider>,
    )
    expect(cellWrapper().className).not.toContain('pointer-events-none')
  })
})

/**
 * **Selection is neutral, ownership is colour** — space plan D4.
 *
 * These pin a *colour*, which normally is not worth a test. This one is: the whole session exists
 * because a selected row and a row whose values you own were both `--primary`, and the two facts
 * the grid most needs to keep apart looked alike. A well-meant "make the selection stand out more"
 * that reaches for the accent again would undo it silently — nothing else on this page would
 * break, and the failure only shows at a desk in a blacked-out room.
 *
 * They live here rather than in a programmer suite because `FixturesTable` is shared: D4 reaches
 * `/fixtures/list` and `/groups/list` too, which is intended — a selected row should look the same
 * everywhere.
 */
describe('FixturesTable neutral selection', () => {
  /** The row wrapper — the grid div carrying the wash. */
  const rowOf = (name: string) => screen.getByText(name).closest('.group\\/row')!

  function SelectedHarness() {
    const cellSelection = useCellSelection(new Set(ROWS.map((r) => r.id)))
    return (
      <FixturesTable
        rows={ROWS}
        visibleColumns={['dimmer'] as ColumnKey[]}
        isSelected={(id) => id === 'fixture:a'}
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

  it('washes a selected row in foreground, never in the ownership accent', () => {
    render(<SelectedHarness />)
    const row = rowOf('SL Wash 1')
    expect(row.className).toContain('bg-foreground/[0.06]')
    expect(row.className).not.toContain('primary')
    // And an unselected row is untouched by any of it.
    expect(rowOf('SL Wash 2').className).not.toContain('bg-foreground')
  })

  it('draws the 3px edge on the sticky cell’s overlay, where the opaque background cannot hide it', () => {
    // On the row itself the inset shadow paints under the name cell's `bg-background` and is
    // invisible at every width — the same reason that overlay exists for the wash.
    render(<SelectedHarness />)
    const overlay = rowOf('SL Wash 1').querySelector('.pointer-events-none.absolute.inset-0')!
    expect(overlay.className).toContain('shadow-[inset_3px_0_0_var(--foreground)]')
  })

  it('fills the checkbox with foreground and bolds the name', () => {
    render(<SelectedHarness />)
    const checkbox = screen.getByLabelText('Select SL Wash 1')
    expect(checkbox.className).toContain('accent-foreground')
    expect(checkbox.className).not.toContain('accent-primary')
    expect(screen.getByText('SL Wash 1').className).toContain('font-semibold')
    expect(screen.getByText('SL Wash 2').className).not.toContain('font-semibold')
  })

  it('draws the marquee band in foreground, with no primary anywhere on it', () => {
    // The band is set from the pointer alone, which is the one part of the gesture jsdom can see
    // (its geometry is covered for real in `cellMarquee.test.ts`).
    render(<Harness />)
    const cell = cellButton()
    fireEvent.pointerDown(cell, { button: 0, clientX: 300, clientY: 100 })
    fireEvent.pointerMove(cell, { buttons: 1, clientX: 380, clientY: 160 })

    const band = screen.getByTestId('cell-marquee')
    expect(band.className).toContain('border-foreground')
    expect(band.className).toContain('bg-foreground/5')
    expect(band.className).not.toContain('border-primary')
    expect(band.className).not.toContain('primary')
    // Both corner handles are foreground too — they were `bg-primary`.
    for (const handle of band.querySelectorAll('span')) {
      expect(handle.className).toContain('bg-foreground')
    }

    fireEvent.pointerUp(cell, { button: 0, clientX: 380, clientY: 160 })
  })

  it('reserves a marks gutter wide enough for the widest mark', () => {
    // D5: the effect badge and the layer glyph float over the value's last characters otherwise.
    // On the wrapper, so the ownership ring and the selection outline still trace the whole cell.
    //
    // 18px and not the plan's 16: the effect badge is `size-3.5` at `right-1`, i.e. 18px from the
    // edge, so a 16px gutter still let it overlap the value by 2px — the exact defect D5 removes.
    render(<Harness />)
    expect(cellWrapper().className).toContain('pr-[18px]')
  })
})

describe('FixturesTable sideways scroll fade', () => {
  const scroller = () => document.querySelector('.overflow-auto') as HTMLElement
  const fade = () => screen.queryByTestId('column-scroll-fade')

  /** jsdom lays nothing out, so the numbers the fade is derived from are stubbed. */
  function layOut(el: HTMLElement, scrollWidth: number, clientWidth: number) {
    Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
    Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
  }

  it('says there are more columns only while there are, and only to the right', () => {
    // Space plan D8: on a phone the value columns run off the right of the screen, and the fade
    // is the only thing that says so.
    render(<Harness />)
    const el = scroller()
    // Everything fits: no fade at all. A permanent gradient at a desk width would read as a
    // rendering fault rather than as a promise of more.
    expect(fade()).toBeNull()

    layOut(el, 900, 400)
    el.scrollLeft = 120
    fireEvent.scroll(el)
    expect(fade()).toBeTruthy()
    expect(fade()!.className).toContain('w-6')
    // Never eats a press on the last column.
    expect(fade()!.className).toContain('pointer-events-none')
    // On the scroller's WRAPPER, not inside it — which is the whole reason the wrapper exists.
    // Drawn within the scroller it would slide away with the columns it is describing.
    expect(fade()!.parentElement).toBe(el.parentElement)
    expect(el.contains(fade())).toBe(false)

    // Scrolled to the end, there is nothing left to promise.
    el.scrollLeft = 500
    fireEvent.scroll(el)
    expect(fade()).toBeNull()
  })

  it('reads nothing on a scroll that did not move the columns', () => {
    // `horizontalOnly` in `useScrollEdges`: this scroller is the virtualizer's as well, so most
    // scroll events on it are a fixture list moving vertically and say nothing about the columns.
    // Measuring on each of those is work on the one path this codebase treats as
    // performance-critical.
    render(<Harness />)
    const el = scroller()
    layOut(el, 900, 400)
    el.scrollLeft = 120
    fireEvent.scroll(el)
    expect(fade()).toBeTruthy()

    // A vertical tick. `scrollWidth` is re-defined to count reads *and* to report a width that
    // would hide the fade — so if the guard ever stops working, this fails twice over.
    let reads = 0
    Object.defineProperty(el, 'scrollWidth', {
      get() {
        reads += 1
        return 400
      },
      configurable: true,
    })
    fireEvent.scroll(el)
    expect(reads).toBe(0)
    expect(fade()).toBeTruthy()
  })
})
