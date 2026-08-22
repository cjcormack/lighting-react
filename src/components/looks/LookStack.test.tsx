// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LayerRow, LookStack, type LookStackLayer } from './LookStack'
import type { LookSummary } from '@/api/looksApi'

/**
 * The shared component's own contract, driven with plain spies.
 *
 * `LayersPane.test.tsx` covers the same rows through the *cue*, asserting the PATCH payload it
 * builds; this covers what the rows promise their host, which is what the programmer relies on.
 * The two are not duplicates: a handler shape that changed would break one and not the other.
 */

function look(overrides: Partial<LookSummary> = {}): LookSummary {
  return {
    id: 7,
    uuid: 'u7',
    name: 'Warm Wash',
    notes: null,
    sortOrder: 0,
    families: ['COLOUR'],
    rowCount: 3,
    effectCount: 0,
    targetCount: 3,
    hasDeferredRows: false,
    editorFixtureType: null,
    preview: [],
    layerCount: 1,
    ...overrides,
  }
}

const LOOKS = new Map([
  [7, look()],
  [8, look({ id: 8, uuid: 'u8', name: 'Slow Pulse', families: ['INTENSITY'] })],
])

function layer(overrides: Partial<LookStackLayer> = {}): LookStackLayer {
  return {
    lookId: 7,
    lookName: 'Warm Wash',
    enabled: true,
    targets: [{ type: 'group', key: 'front-wash' }],
    propertyMask: null,
    blendMode: 'OVERRIDE',
    amount: 1,
    stomp: false,
    ...overrides,
  }
}

function handlers() {
  return {
    onRemove: vi.fn(),
    onMove: vi.fn(),
    onSetEnabled: vi.fn(),
    onSetAmount: vi.fn(),
    onSetBlendMode: vi.fn(),
    onSetPropertyMask: vi.fn(),
    onSetStomp: vi.fn(),
  }
}

function renderStack(layers: LookStackLayer[], extra: Partial<Parameters<typeof LookStack>[0]> = {}) {
  const h = handlers()
  const onAdd = vi.fn()
  render(
    <LookStack
      layers={layers}
      looksById={LOOKS}
      looksLoaded
      handlers={h}
      onAdd={onAdd}
      emptyNote="No layers yet."
      precedenceNote="Later layers win."
      {...extra}
    />,
  )
  return { handlers: h, onAdd }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LookStack', () => {
  it('renders the layers in order, labelled and numbered', () => {
    renderStack([layer(), layer({ lookId: 8, lookName: 'Slow Pulse' })])

    const warm = screen.getByText('Warm Wash')
    const pulse = screen.getByText('Slow Pulse')
    // Order is the composition, so document order has to match array order.
    expect(warm.compareDocumentPosition(pulse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // The position badges. Queried within the rows rather than globally: the section header carries
    // a count badge that reads "2" for a two-layer stack.
    const positions = screen
      .getAllByText(/^[0-9]+$/)
      .filter((el) => el.className.includes('font-mono'))
      .map((el) => el.textContent)
    expect(positions).toEqual(['1', '2'])
  })

  it('states what the order means, rather than leaving it implied', () => {
    // The one thing an operator arriving from presets is most likely to be surprised by, so it is
    // in the section body rather than a tooltip.
    renderStack([layer()])
    expect(screen.getByText('Later layers win.')).toBeInTheDocument()
  })

  it('shows the empty note and no precedence note when there are no layers', () => {
    renderStack([])
    expect(screen.getByText('No layers yet.')).toBeInTheDocument()
    expect(screen.queryByText('Later layers win.')).not.toBeInTheDocument()
  })

  it('reports the index it was rendered at, not the layer', () => {
    // The host maps index → whatever addresses a layer in its own world (a cue array position, a
    // programmer `layerId`). Getting this wrong disables or removes the wrong row.
    const { handlers: h } = renderStack([layer(), layer({ lookId: 8, lookName: 'Slow Pulse' })])

    fireEvent.click(screen.getAllByLabelText('Disable layer')[1])
    expect(h.onSetEnabled).toHaveBeenCalledWith(1, false)

    fireEvent.click(screen.getAllByLabelText('Remove')[0])
    expect(h.onRemove).toHaveBeenCalledWith(0)
  })

  it('flips the enable control label so the button says what it will do', () => {
    renderStack([layer({ enabled: false })])
    fireEvent.click(screen.getByLabelText('Enable layer'))
    expect(screen.queryByLabelText('Disable layer')).not.toBeInTheDocument()
  })

  it('commits an amount on blur, as a fraction', () => {
    const { handlers: h } = renderStack([layer()])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '50' } })
    // Not per keystroke: every commit is a write, and typing "50" would fire one for "5".
    expect(h.onSetAmount).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(h.onSetAmount).toHaveBeenCalledWith(0, 0.5)
  })

  it('commits an amount on Enter, and clamps out of range', () => {
    // Starting below full, or the clamped 100% would equal the current value and be suppressed by
    // the no-op guard the test two below this one pins.
    const { handlers: h } = renderStack([layer({ amount: 0.5 })])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '400' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(h.onSetAmount).toHaveBeenCalledWith(0, 1)
  })

  it('sends nothing for a retype to the current value', () => {
    const { handlers: h } = renderStack([layer({ amount: 1 })])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '100' } })
    fireEvent.blur(input)
    expect(h.onSetAmount).not.toHaveBeenCalled()
  })

  it('treats an emptied amount field as undecided, not as 0%', () => {
    // `Number('')` is 0, so the naive read silently mutes the layer.
    const { handlers: h } = renderStack([layer()])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(h.onSetAmount).not.toHaveBeenCalled()
  })

  it('abandons an amount edit on Escape', () => {
    const { handlers: h } = renderStack([layer()])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(h.onSetAmount).not.toHaveBeenCalled()
  })

  it('reads a layer’s mask and blend off the trigger', () => {
    // The mask and blend became editable in session 4, so the trigger *is* the read-out — an
    // operator who cannot see the mask cannot explain why a layer only moves colour.
    renderStack([layer({ propertyMask: 'COLOUR', blendMode: 'MAX' })])
    expect(screen.getByText('[Colour]')).toBeInTheDocument()
    expect(screen.getByText('MAX')).toBeInTheDocument()
  })

  it('toggles stomp by index, and renders the control in both states', () => {
    // Unlike the mask and blend badges beside it, the stomp control has to render when the flag is
    // *off* too — otherwise there is no way to switch it on. `aria-pressed` is the read-out.
    const { handlers: off } = renderStack([layer({ stomp: false })])
    const on = screen.getByRole('button', { name: 'Stomp lower layers' })
    expect(on).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(on)
    expect(off.onSetStomp).toHaveBeenCalledWith(0, true)

    cleanup()

    const { handlers: h } = renderStack([layer({ stomp: true })])
    const stomping = screen.getByRole('button', { name: 'Stop stomping lower layers' })
    expect(stomping).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(stomping)
    expect(h.onSetStomp).toHaveBeenCalledWith(0, false)
  })

  it('keeps STOMP a read-only badge on a read-only row', () => {
    // The preview layer and a cue's detail sheet get facts, not controls — a toggle there would
    // write to a layer the operator does not own.
    render(
      <LayerRow
        layer={layer({ stomp: true })}
        index={0}
        look={LOOKS.get(7)}
        looksLoaded
        // Handed the full handler set on purpose: what suppresses the toggle has to be `readOnly`
        // itself, not the absence of something to call.
        handlers={handlers()}
        sortable={false}
        readOnly
      />,
    )
    expect(screen.getByText('STOMP')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /stomp/i })).not.toBeInTheDocument()
  })

  it('reports a mask change by index, normalising all-four to no mask', async () => {
    // The load-bearing half of `serializePropertyMask`: a mask naming all four families composes
    // identically to no mask, so storing one would render a badge that says nothing.
    //
    // Only the *mask* half of the popover is driven here. `MaskPicker` is plain checkboxes, but the
    // blend control is a portalled Radix Select, and nothing in this repo opens one — the same call
    // dnd-kit gets, where the pointer sequence isn't drivable so the handle and the pure helper are
    // asserted instead. Here that means the trigger's read-out below plus `attributeFamily`'s own
    // round-trip tests, rather than a fake select that would only prove the mock works.
    const { handlers: h } = renderStack([layer({ propertyMask: 'INTENSITY,POSITION,COLOUR' })])
    fireEvent.click(screen.getByTitle(/How this layer combines/))
    fireEvent.click(await screen.findByLabelText('Beam'))
    expect(h.onSetPropertyMask).toHaveBeenCalledWith(0, null)
  })

  it('offers the combine control once per row, addressed by index', () => {
    renderStack([layer(), layer({ lookId: 8 })])
    expect(screen.getAllByTitle(/How this layer combines/)).toHaveLength(2)
  })

  it('says a layer with no targets uses the look’s own', () => {
    renderStack([layer({ targets: [] })])
    expect(screen.getByText(/look’s own targets/)).toBeInTheDocument()
  })

  it('gives every layer a drag handle', () => {
    // dnd-kit's pointer sequence isn't drivable with fireEvent and nothing in this repo drives
    // one, so the drag itself is covered by the pure reorder helper in `cueUtils.test.ts`. What
    // this pins is that the affordance exists once per row.
    renderStack([layer(), layer({ lookId: 8 }), layer()])
    expect(screen.getAllByLabelText('Reorder layer')).toHaveLength(3)
  })

  it('marks a look the library no longer has, but only once the list has loaded', () => {
    // An in-flight list leaves the map empty; treating that as "missing" paints every healthy
    // layer in the cue as broken for as long as the fetch takes.
    const { unmount } = render(
      <LookStack
        layers={[layer({ lookId: 99, lookName: null })]}
        looksById={new Map()}
        looksLoaded={false}
        handlers={handlers()}
        onAdd={vi.fn()}
        emptyNote="none"
        precedenceNote="order"
      />,
    )
    expect(screen.queryByText(/missing/i)).not.toBeInTheDocument()
    unmount()

    renderStack([layer({ lookId: 99, lookName: null })])
    expect(screen.getByText(/missing/i)).toBeInTheDocument()
  })

  it('renders a footer under the list, for a host with something to add', () => {
    // The programmer's read-only preview layer lives here.
    renderStack([layer()], { footer: <p>Previewing an unsaved look</p> })
    expect(screen.getByText('Previewing an unsaved look')).toBeInTheDocument()
  })

  it('offers no amount, enable or remove control on a read-only row', () => {
    // How the programmer renders the Look editor's live preview: it holds an unsaved draft, is
    // never recorded, and is pinned to the tail server-side, so all three controls would lie.
    render(
      <LayerRow
        layer={layer({ lookName: 'Draft' })}
        index={0}
        look={LOOKS.get(7)}
        looksLoaded
        handlers={handlers()}
        sortable={false}
        showTargets
        readOnly
      />,
    )
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.queryByLabelText('Layer amount (%)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Disable layer')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Remove')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Reorder layer')).not.toBeInTheDocument()
    expect(screen.queryByTitle(/How this layer combines/)).not.toBeInTheDocument()
  })
})
