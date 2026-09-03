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
