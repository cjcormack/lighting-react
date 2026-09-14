// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The DMX sheet's own rules on the kit (CLAUDE.md §Sheet kit): a 16-wide grid of every address,
 * a marquee across a row selects addresses, Set writes each through `channels.update`, Clear
 * writes 0, Park parks each at its current value — and an offline desk is the read-only scope, in
 * the four places the programmer's is.
 */
const updateChannel = vi.fn(() => ({ unwrap: () => Promise.resolve() }))
const parkChannel = vi.fn(() => ({ unwrap: () => Promise.resolve() }))
const unparkChannel = vi.fn(() => ({ unwrap: () => Promise.resolve() }))
vi.mock('@/store/channels', () => ({ useUpdateChannelMutation: () => [updateChannel] }))
vi.mock('@/store/park', () => ({
  useParkChannelMutation: () => [parkChannel],
  useUnparkChannelMutation: () => [unparkChannel],
}))
vi.mock('@/store/fixtures', () => ({ useFixtureListQuery: () => ({ data: [] }) }))
vi.mock('@/store/errorToastMiddleware', () => ({ ignoreReportedError: () => {} }))
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
// Live values, driven directly: channel 7 sits at 100, everything else at 0.
vi.mock('@/hooks/usePropertyValues', () => ({
  useChannelValue: ({ channelNo }: { channelNo: number }) => (channelNo === 7 ? 100 : 0),
}))
vi.mock('@/api/lightingApi', () => ({
  lightingApi: {
    channels: { get: (_u: number, c: number) => (c === 7 ? 100 : 0) },
    programmer: {
      subscribe: () => ({ unsubscribe() {} }),
      subscribeToKey: () => ({ unsubscribe() {} }),
      getKeyState: () => ({}),
      isBlind: () => false,
    },
  },
}))
// jsdom lays nothing out, so the real virtualizer renders no rows. Stubbed to render the first
// two — 32 cells, each a Radix popover — which is what a short viewport would show; rendering all
// 512 is what a real desk never does and what times a jsdom test out under a loaded suite.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 2) }, (_, index) => ({
        index,
        key: index,
        start: index * estimateSize(),
        size: estimateSize(),
      })),
    scrollToIndex: () => {},
  }),
}))

import { DmxSheet, DMX_ROW_HEIGHT } from './DmxSheet'
import { resetCellEditorSurfaceMedia } from '@/components/sheet/cells/CellEditorSurface'

const MAPPINGS = {
  1: { fixtureKey: 'par-1', fixtureName: 'Front PAR 1', description: 'Dim' },
  2: { fixtureKey: 'par-1', fixtureName: 'Front PAR 1', description: 'Red' },
  7: { fixtureKey: 'par-2', fixtureName: 'Front PAR 2', description: 'Dim' },
  8: { fixtureKey: 'par-2', fixtureName: 'Front PAR 2', description: 'Red' },
}

function draw(over: Partial<React.ComponentProps<typeof DmxSheet>> = {}) {
  return render(
    <DmxSheet universe={1} connected mappings={MAPPINGS} parkValueMap={new Map()} {...over} />,
  )
}

/** The sixteen column bands, 64px each after a 48px row head; rows are 44px from a 0-high header. */
function stubFlatLayout() {
  const rect = (left: number, right: number) =>
    ({ left, top: 0, right, bottom: 0, width: right - left, height: 0, x: left, y: 0, toJSON: () => ({}) }) as DOMRect
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const col = this.getAttribute('data-column-header')
    if (col) {
      const i = Number(col.slice(1))
      return rect(48 + i * 64, 48 + (i + 1) * 64)
    }
    return rect(0, 1100)
  })
}

/** The address cell's trigger, found by its zero-padded number on the first line. */
function cell(channelNo: number): HTMLElement {
  // The row head says `001` too, so take the one inside a cell trigger.
  const match = screen
    .getAllByText(String(channelNo).padStart(3, '0'))
    .map((el) => el.closest('button'))
    .find((button): button is HTMLButtonElement => button != null)
  if (!match) throw new Error(`no cell for ${channelNo}`)
  return match
}

/** A marquee along row 0 from column `from` to column `to`. */
function dragRow0(from: number, to: number) {
  const el = cell(from + 1)
  fireEvent.pointerDown(el, { button: 0, clientX: 48 + from * 64 + 10, clientY: 10 })
  fireEvent.pointerMove(el, { button: 0, buttons: 1, clientX: 48 + to * 64 + 30, clientY: 20 })
  fireEvent.pointerUp(el, { button: 0, clientX: 48 + to * 64 + 30, clientY: 20 })
  fireEvent.click(el)
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
  updateChannel.mockClear()
  parkChannel.mockClear()
  unparkChannel.mockClear()
})

describe('DmxSheet', () => {
  it('draws sixteen addresses to a row at 44px, naming a fixture on the first cell of its run', () => {
    draw()
    expect(screen.getAllByText('+15')).toHaveLength(1)
    expect(cell(1)).toHaveTextContent('Front PAR 1')
    expect(cell(2)).toHaveTextContent('Red')
    expect(cell(2)).not.toHaveTextContent('Front PAR 1')
    expect(cell(7)).toHaveTextContent('100')
    expect(DMX_ROW_HEIGHT).toBe(44)
  })

  it('selects a run of addresses with a marquee and sets them with one editor', async () => {
    draw()
    // 007–010: columns 6..9 of row 0.
    dragRow0(6, 9)
    expect(screen.getByText('4 channels')).toBeInTheDocument()
    expect(screen.getByText('Value')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    const field = await screen.findByLabelText('Value')
    fireEvent.change(field, { target: { value: '178' } })
    for (const channelNo of [7, 8, 9, 10]) {
      expect(updateChannel).toHaveBeenCalledWith({ universe: 1, channelNo, value: 178 })
    }
  })

  it('clears the selected addresses to 0 and parks them at their current values', () => {
    draw()
    dragRow0(6, 7)
    fireEvent.click(screen.getByRole('button', { name: 'Clear cells' }))
    expect(updateChannel).toHaveBeenCalledWith({ universe: 1, channelNo: 7, value: 0 })
    expect(updateChannel).toHaveBeenCalledWith({ universe: 1, channelNo: 8, value: 0 })
    fireEvent.click(screen.getByRole('button', { name: /Park$/ }))
    expect(parkChannel).toHaveBeenCalledWith({ universe: 1, channelNo: 7, value: 100 })
    expect(parkChannel).toHaveBeenCalledWith({ universe: 1, channelNo: 8, value: 0 })
  })

  it('unparks only the parked addresses in the selection', () => {
    draw({ parkValueMap: new Map([[8, 60]]) })
    dragRow0(6, 7)
    expect(cell(8)).toHaveTextContent('60')
    fireEvent.click(screen.getByRole('button', { name: /Unpark/ }))
    expect(unparkChannel).toHaveBeenCalledTimes(1)
    expect(unparkChannel).toHaveBeenCalledWith({ universe: 1, channelNo: 8 })
  })

  it('makes every cell inert with the desk offline — pointer, keyboard, verbs and Fan', async () => {
    draw({ connected: false })
    // The trigger is disabled and its wrapper takes no pointer, so Tab-then-Enter goes nowhere.
    expect(cell(7)).toBeDisabled()
    expect(cell(7).closest('[data-cell]')!.className).toContain('pointer-events-none')
    // The marquee still arms — its press sits on the rows wrapper — and the verbs then say why.
    dragRow0(6, 7)
    expect(screen.getByText('2 channels')).toBeInTheDocument()
    for (const name of ['Set', 'Clear cells', 'Fan']) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', expect.stringMatching(/desk|connect/i))
    }
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' })
      fireEvent.keyDown(window, { key: 'Backspace' })
    })
    expect(updateChannel).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Value')).toBeNull()
  })
})
