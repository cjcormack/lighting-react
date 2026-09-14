// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FixturePatch } from '@/api/patchApi'

/**
 * The patch list's own rules on the sheet kit (CLAUDE.md §Sheet kit):
 *
 *  - **Set over N addresses lands them consecutively by footprint from the typed one**, in
 *    visible-row order — one PUT per head whose channel moved, never N heads on one address.
 *  - **Fan on Address is From + Step** (blank step = footprint), in visible-row order.
 *  - **The overlap is on the cell**: a destructive ring, the other head on the title, a legend
 *    line under the sheet.
 *  - **Clear is refused on Address** — an address cannot be empty — and the refusal is the
 *    button's title.
 *
 * Everything store-connected is mocked away; the point is the gesture and the write it produces.
 */
const updatePatch = vi.fn(() => ({ unwrap: () => Promise.resolve() }))
vi.mock('@/store/patches', () => ({
  useUpdatePatchMutation: () => [updatePatch],
  useDeletePatchMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve() }))],
}))
vi.mock('@/store/fixtures', () => ({ useFixtureListQuery: () => ({ data: [] }) }))
vi.mock('@/store/locate', () => ({
  useLocateStateQuery: () => ({ data: { targets: [] } }),
  useToggleLocateMutation: () => [vi.fn()],
}))
vi.mock('@/store/errorToastMiddleware', () => ({ ignoreReportedError: () => {} }))
// The selection bar asks the viewport's height; jsdom has no `matchMedia`, and a desk is tall.
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
vi.mock('@/components/fixtures-list/useHighlight', () => ({
  useHighlight: () => ({ press: () => {}, release: () => {}, isActive: false }),
}))
// jsdom lays nothing out, so the real virtualizer measures a zero-height scroller and renders no
// rows at all. Stubbed to render them all — this suite is about the gesture, not windowing.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
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

import { PatchSheet, patchRowId, type PatchSheetRow } from './PatchSheet'
import { resetCellEditorSurfaceMedia } from '@/components/sheet/cells/CellEditorSurface'

function patch(id: number, name: string, startChannel: number, channelCount = 6, universe = 1): FixturePatch {
  return {
    id,
    key: name.toLowerCase().replace(/\s+/g, '-'),
    displayName: name,
    fixtureTypeKey: 'par-hex',
    startChannel,
    channelCount,
    manufacturer: 'Chauvet',
    model: 'Freedom Par Hex',
    modeName: '6ch',
    universe,
    subnet: 0,
    sortOrder: id,
    groups: [],
    stageX: null,
    stageY: null,
    stageZ: null,
    baseYawDeg: null,
    basePitchDeg: null,
    riggingUuid: null,
    beamAngleDeg: null,
    gelCode: null,
    kindOverride: null,
    stageHidden: false,
  }
}

const RIG = [
  patch(1, 'PAR 1', 1),
  patch(2, 'PAR 2', 100),
  patch(3, 'PAR 3', 200),
  patch(4, 'Bar SL', 25, 18),
]

const rows: PatchSheetRow[] = RIG.map((p) => ({
  id: patchRowId(p.id),
  patch: p,
  riggingName: null,
  acceptsBeamAngle: false,
  acceptsGel: false,
}))

function draw(over: Partial<React.ComponentProps<typeof PatchSheet>> = {}) {
  return render(
    <PatchSheet
      projectId={1}
      rows={rows}
      allPatches={RIG}
      riggings={[]}
      visibleColumns={['address', 'type', 'key']}
      onEditPatch={() => {}}
      onEditGroup={() => {}}
      {...over}
    />,
  )
}

function row(name: string): HTMLElement {
  return screen.getByText(name).closest('[data-row-id]') as HTMLElement
}

function addressCell(name: string): HTMLElement {
  const row = screen.getByText(name).closest('[data-row-id]')!
  return within(row as HTMLElement).getByText(/^\d-\d{3}$/).closest('button')!
}

beforeEach(() => {
  stubFlatLayout()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
  resetCellEditorSurfaceMedia()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  updatePatch.mockClear()
})

/**
 * Give the sheet a layout, so the marquee resolves to cells. jsdom reports every rect as zero, so
 * the first column's header spans x = 0..240, the Address column's 240..344, and the rest follow;
 * rows are 36px from a zero-height header, so row *i* is y = 36i..36i+36.
 */
function stubFlatLayout() {
  const rect = (left: number, right: number) =>
    ({ left, top: 0, right, bottom: 0, width: right - left, height: 0, x: left, y: 0, toJSON: () => ({}) }) as DOMRect
  const bands: Record<string, [number, number]> = {
    address: [240, 344],
    type: [344, 600],
    key: [600, 740],
    mount: [240, 358],
    gel: [358, 454],
  }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-grid-name-header')) return rect(0, 240)
    const col = this.getAttribute('data-column-header')
    if (col && bands[col]) return rect(...bands[col])
    return rect(0, 1000)
  })
}

/** A single click on an address cell selects that one cell — the programmer's rule, kept. */
function clickAddress(name: string) {
  fireEvent.click(addressCell(name))
}

/** A marquee down the Address column over rows `from`..`to` (indices into the drawn rows). */
function dragAddresses(from: number, to: number) {
  const cell = addressCell(screen.getAllByText(/^(PAR \d|Bar SL)$/)[from].textContent!)
  fireEvent.pointerDown(cell, { button: 0, clientX: 300, clientY: from * 36 + 10 })
  fireEvent.pointerMove(cell, { button: 0, buttons: 1, clientX: 320, clientY: to * 36 + 26 })
  fireEvent.pointerUp(cell, { button: 0, clientX: 320, clientY: to * 36 + 26 })
  // The click a real release generates, which the marquee swallows — without it the swallow would
  // eat the next click this test makes, on Set or Fan.
  fireEvent.click(cell)
}

describe('PatchSheet', () => {
  it('lands a Set over N addresses consecutively by footprint from the typed one', async () => {
    draw()
    // PAR 1 (6ch) and PAR 2 (6ch), in visible order, set from 7: 7 and 13.
    dragAddresses(0, 1)
    expect(screen.getByText('2 cells')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    const field = await screen.findByLabelText('Start channel')
    fireEvent.change(field, { target: { value: '7' } })
    // The preview names the landing before Apply.
    expect(screen.getByText(/PAR 1 → 1-007 · PAR 2 → 1-013/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(updatePatch).toHaveBeenCalledTimes(2)
    expect(updatePatch).toHaveBeenCalledWith({ projectId: 1, patchId: 1, startChannel: 7 })
    expect(updatePatch).toHaveBeenCalledWith({ projectId: 1, patchId: 2, startChannel: 13 })
  })

  it('names the collision before Apply and refuses it — the PUT has no overlap check of its own', async () => {
    draw()
    // PAR 1 → 19 (19–24) is clear; PAR 2 → 25 lands on Bar SL (25–42).
    dragAddresses(0, 1)
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    const field = await screen.findByLabelText('Start channel')
    fireEvent.change(field, { target: { value: '19' } })
    expect(screen.getByText(/1-025 overlaps Bar SL/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(updatePatch).not.toHaveBeenCalled()
  })

  it('refuses Clear on Address, with the reason on the button', () => {
    draw()
    clickAddress('PAR 1')
    const clear = screen.getByRole('button', { name: 'Clear cells' })
    expect(clear).toBeDisabled()
    expect(clear).toHaveAttribute('title', 'An address cannot be empty')
    expect(screen.getByRole('button', { name: 'Set' })).not.toBeDisabled()
  })

  it('fans addresses From + Step in visible-row order, blank step meaning each footprint', async () => {
    // Drawn in this order: PAR 1 (6), Bar SL (18), PAR 2 (6).
    draw({ rows: [rows[0], rows[3], rows[1], rows[2]] })
    dragAddresses(0, 2)
    expect(screen.getByText('3 cells')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fan' }))
    const from = await screen.findByLabelText('From')
    fireEvent.change(from, { target: { value: '300' } })
    // Visible order is PAR 1 (6), Bar SL (18), PAR 2 (6): 300, 306, 324.
    expect(screen.getByText(/1-300, 1-306, 1-324/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: '20' } })
    expect(screen.getByText(/1-300, 1-320, 1-340/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(updatePatch).toHaveBeenCalledWith({ projectId: 1, patchId: 1, startChannel: 300 })
    expect(updatePatch).toHaveBeenCalledWith({ projectId: 1, patchId: 4, startChannel: 320 })
    expect(updatePatch).toHaveBeenCalledWith({ projectId: 1, patchId: 2, startChannel: 340 })
  })

  it('a commit reaches only its own column — a rigging picked over a Mount→Gel marquee is never a gel code', async () => {
    // Every patch column takes a string, so the kit's shape test cannot tell a rigging uuid from a
    // gel code. Mount and Gel are drawn side by side, and a marquee across both on one head, then
    // a mount picked from the Mount editor, must PUT riggingUuid alone.
    const gelRows = rows.map((r) => ({ ...r, acceptsGel: true }))
    draw({ rows: gelRows, riggings: [{ uuid: 'rig-1', name: 'FOH truss' }], visibleColumns: ['mount', 'gel'] })
    const mount = within(row('PAR 1')).getByText('Free').closest('button')!
    fireEvent.pointerDown(mount, { button: 0, clientX: 250, clientY: 10 })
    fireEvent.pointerMove(mount, { button: 0, buttons: 1, clientX: 400, clientY: 20 })
    fireEvent.pointerUp(mount, { button: 0, clientX: 400, clientY: 20 })
    fireEvent.click(mount)
    expect(screen.getByText('2 cells')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    fireEvent.click(await screen.findByRole('option', { name: 'FOH truss' }))
    expect(updatePatch).toHaveBeenCalledTimes(1)
    expect(updatePatch).toHaveBeenCalledWith({ projectId: 1, patchId: 1, riggingUuid: 'rig-1' })
  })

  it('rings an overlapping address, names the other head, and says so under the sheet', () => {
    // Bar SL at 25–42 and a par dropped onto 30.
    const clash = patch(5, 'PAR 5', 30)
    const all = [...RIG, clash]
    const clashRow: PatchSheetRow = { id: patchRowId(5), patch: clash, riggingName: null, acceptsBeamAngle: false, acceptsGel: false }
    draw({ rows: [...rows, clashRow], allPatches: all })
    const cell = addressCell('PAR 5').closest('[data-cell="address"]')!
    expect(cell.className).toContain('ring-destructive')
    expect(cell).toHaveAttribute('title', expect.stringContaining('Overlaps Bar SL'))
    expect(screen.getByText(/2 addresses overlap another fixture/)).toBeInTheDocument()
    expect(addressCell('PAR 1').closest('[data-cell="address"]')!.className).not.toContain('ring-destructive')
  })

  it('opens the address editor from Enter, seeded from a typed digit, and applies on Enter', async () => {
    draw()
    clickAddress('PAR 3')
    await act(async () => {
      fireEvent.keyDown(window, { key: '9' })
    })
    const field = await screen.findByLabelText('Start channel')
    expect(field).toHaveValue(9)
    fireEvent.change(field, { target: { value: '90' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(updatePatch).toHaveBeenCalledWith({ projectId: 1, patchId: 3, startChannel: 90 })
  })
})
