// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CueStack, CueStackCueEntry } from '@/api/cueStacksApi'

/**
 * The cue sheet's own rules on the kit (CLAUDE.md §Sheet kit), and above all **the lock as the
 * sheet's read-only scope**: locked, every value cell is inert in the four places the programmer's
 * Output scope is — the wrapper's `pointer-events-none`, the trigger's `disabled`, the keyboard
 * through the permission, and the bar's Set · Clear · Fan with the reason — while the marquee
 * still works and a click on the Cue column arms the cue as next. Unlocked, a cell writes one
 * PATCH per cue, and Fan on Fade spreads first→last.
 */
const patchCue = vi.fn(() => ({ unwrap: () => Promise.resolve() }))
vi.mock('@/store/cues', () => ({ usePatchProjectCueMutation: () => [patchCue] }))
vi.mock('@/store/errorToastMiddleware', () => ({ ignoreReportedError: () => {} }))
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
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

import { CueSheet } from './CueSheet'
import { resetCellEditorSurfaceMedia } from '@/components/sheet/cells/CellEditorSurface'

const cue = (id: number, over: Partial<CueStackCueEntry> = {}): CueStackCueEntry => ({
  id,
  name: `Cue ${id}`,
  sortOrder: id,
  layerCount: 0,
  adHocEffectCount: 0,
  autoAdvance: false,
  autoAdvanceDelayMs: null,
  fadeDurationMs: 1000,
  fadeCurve: 'LINEAR',
  cueNumber: String(id),
  cueNumberAuto: false,
  notes: null,
  cueType: 'STANDARD',
  ...over,
})

const STACK: CueStack = {
  id: 10,
  name: 'Act 1',
  loop: false,
  sortOrder: 0,
  type: 'STACK',
  label: null,
  cues: [cue(1), cue(2), cue(3, { cueType: 'MARKER', name: 'Interval' }), cue(4), cue(5)],
  activeCueId: null,
  nextCueId: null,
  canEdit: true,
  canDelete: true,
}

function draw(over: Partial<React.ComponentProps<typeof CueSheet>> = {}) {
  return render(<CueSheet stack={STACK} projectId={1} activeCueId={null} onOpenCue={() => {}} {...over} />)
}

/** The first column spans 0..100; Name 100..300, Fade 300..388 — rows are 36px from a 0-high header. */
function stubFlatLayout() {
  const rect = (left: number, right: number) =>
    ({ left, top: 0, right, bottom: 0, width: right - left, height: 0, x: left, y: 0, toJSON: () => ({}) }) as DOMRect
  const bands: Record<string, [number, number]> = {
    name: [100, 300],
    fade: [300, 388],
    curve: [388, 506],
    follow: [506, 602],
    book: [602, 678],
    layers: [678, 754],
    fx: [754, 810],
    notes: [810, 1010],
  }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-grid-name-header')) return rect(0, 100)
    const col = this.getAttribute('data-column-header')
    if (col && bands[col]) return rect(...bands[col])
    return rect(0, 1100)
  })
}

function row(cueId: number): HTMLElement {
  return document.querySelector(`[data-row-id="cue:${cueId}"]`) as HTMLElement
}
function fadeCell(cueId: number): HTMLElement {
  return within(row(cueId)).getAllByRole('button').find((b) => b.closest('[data-cell="fade"]'))!
}

/** A marquee down the Fade column over the drawn rows `from`..`to`. */
function dragFade(from: number, to: number) {
  const cell = fadeCell(STACK.cues[from].id)
  fireEvent.pointerDown(cell, { button: 0, clientX: 340, clientY: from * 36 + 10 })
  fireEvent.pointerMove(cell, { button: 0, buttons: 1, clientX: 350, clientY: to * 36 + 26 })
  fireEvent.pointerUp(cell, { button: 0, clientX: 350, clientY: to * 36 + 26 })
  fireEvent.click(cell)
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
  patchCue.mockClear()
})

describe('CueSheet', () => {
  it('draws one row per cue and a marker as a divider', () => {
    draw()
    expect(row(1)).toBeInTheDocument()
    expect(row(3)).toHaveTextContent('Interval')
    expect(within(row(3)).queryByRole('button')).toBeNull()
    expect(screen.getByText('4 cues · 1 marker')).toBeInTheDocument()
  })

  it('washes the live row green and the next row blue, as the cards do', () => {
    draw({ activeCueId: 2, standbyCueId: 4 })
    expect(row(2).className).toContain('green')
    expect(row(4).className).toContain('blue')
    expect(row(1).className).not.toContain('green')
  })

  it('unlocked: a cell writes one PATCH per selected cue', async () => {
    draw()
    // Rows 0 and 1 are cues 1 and 2.
    dragFade(0, 1)
    expect(screen.getByText('2 cells')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    const field = await screen.findByLabelText('Fade')
    fireEvent.change(field, { target: { value: '2.5s' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(patchCue).toHaveBeenCalledWith({ projectId: 1, cueId: 1, fadeDurationMs: 2500 })
    expect(patchCue).toHaveBeenCalledWith({ projectId: 1, cueId: 2, fadeDurationMs: 2500 })
    expect(patchCue).toHaveBeenCalledTimes(2)
  })

  it('unlocked: a commit reaches only the columns of its own kind — a fade never becomes a follow or a note', async () => {
    // Name, Fade, Curve, Follow and Notes all take a string, so the kit's shape test cannot tell
    // them apart. A marquee from Fade across to Notes (rows 0 and 1), then `3s` typed into the
    // Fade editor: three fades move, no cue starts auto-advancing, no note is overwritten.
    draw()
    const cell = fadeCell(1)
    fireEvent.pointerDown(cell, { button: 0, clientX: 340, clientY: 10 })
    fireEvent.pointerMove(cell, { button: 0, buttons: 1, clientX: 900, clientY: 62 })
    fireEvent.pointerUp(cell, { button: 0, clientX: 900, clientY: 62 })
    fireEvent.click(cell)
    // Fade, Curve, Follow and Notes for two cues; Book, Layers and FX are read-outs and are never selected.
    expect(screen.getByText('8 cells')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set' }))
    const field = await screen.findByLabelText('Fade')
    fireEvent.change(field, { target: { value: '3s' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(patchCue).toHaveBeenCalledWith({ projectId: 1, cueId: 1, fadeDurationMs: 3000 })
    expect(patchCue).toHaveBeenCalledWith({ projectId: 1, cueId: 2, fadeDurationMs: 3000 })
    expect(patchCue).toHaveBeenCalledTimes(2)
    for (const call of patchCue.mock.calls as unknown as Record<string, unknown>[][]) {
      expect(call[0]).not.toHaveProperty('autoAdvance')
      expect(call[0]).not.toHaveProperty('notes')
      expect(call[0]).not.toHaveProperty('fadeCurve')
    }
  })

  it('selects and scrolls to the cue the URL names — the ?cue= contract holds on the sheet', () => {
    draw({ openedCueId: 4 })
    expect(row(4)).toHaveAttribute('data-state', 'selected')
    expect(row(1)).not.toHaveAttribute('data-state', 'selected')
    expect(screen.getByText('1 cue')).toBeInTheDocument()
  })

  it('consumes the deep link once — a refetched stack does not wipe a marquee made since', () => {
    // Every cell commit refetches the stack and every GO re-mints its cues; neither is an arrival.
    const view = render(
      <CueSheet stack={STACK} projectId={1} activeCueId={null} openedCueId={4} onOpenCue={() => {}} />,
    )
    expect(row(4)).toHaveAttribute('data-state', 'selected')
    dragFade(0, 1)
    expect(screen.getByText('2 cells')).toBeInTheDocument()
    view.rerender(
      <CueSheet
        stack={{ ...STACK, cues: STACK.cues.map((c) => ({ ...c })), activeCueId: 2 }}
        projectId={1}
        activeCueId={2}
        openedCueId={4}
        onOpenCue={() => {}}
      />,
    )
    expect(screen.getByText('2 cells')).toBeInTheDocument()
    expect(row(4)).not.toHaveAttribute('data-state', 'selected')
    // A new id is a new arrival.
    view.rerender(
      <CueSheet stack={STACK} projectId={1} activeCueId={null} openedCueId={5} onOpenCue={() => {}} />,
    )
    expect(row(5)).toHaveAttribute('data-state', 'selected')
    expect(screen.queryByText('2 cells')).toBeNull()
  })

  it('unlocked: Fan on Fade spreads first→last over the selection, in visible order', async () => {
    draw()
    // Rows 3 and 4 are cues 4 and 5 (row 2 is the marker, which a rectangle skips).
    dragFade(0, 4)
    expect(screen.getByText('4 cells')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fan' }))
    const from = await screen.findByLabelText('From')
    fireEvent.change(from, { target: { value: '1s' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '4s' } })
    expect(screen.getByText(/Q1 1.0s · Q2 2.0s · Q4 3.0s · Q5 4.0s/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    // Q1 is already at 1s, so three of the four move.
    expect(patchCue).toHaveBeenCalledWith({ projectId: 1, cueId: 2, fadeDurationMs: 2000 })
    expect(patchCue).toHaveBeenCalledWith({ projectId: 1, cueId: 4, fadeDurationMs: 3000 })
    expect(patchCue).toHaveBeenCalledWith({ projectId: 1, cueId: 5, fadeDurationMs: 4000 })
    expect(patchCue).toHaveBeenCalledTimes(3)
  })

  it('locked: every value cell is inert in all four places, and the marquee still works', async () => {
    draw({ locked: true, onSetStandby: () => {} })
    // 1. The pointer: the wrapper takes no events. 2. The keyboard's own door: the trigger is
    // disabled, so Tab-then-Enter opens nothing.
    const cell = fadeCell(1)
    expect(cell).toBeDisabled()
    expect(cell.closest('[data-cell]')!.className).toContain('pointer-events-none')
    // The marquee arms in every scope — its press sits on the rows wrapper.
    dragFade(0, 1)
    expect(screen.getByText('2 cells')).toBeInTheDocument()
    expect(screen.getByText(/Locked — cells are read-only/)).toBeInTheDocument()
    // 3. The bar's verbs, with the reason. 4. The window keyboard, refused through the permission.
    for (const name of ['Set', 'Clear cells', 'Fan']) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', expect.stringContaining('Locked'))
    }
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' })
      fireEvent.keyDown(window, { key: '2' })
      fireEvent.keyDown(window, { key: 'Backspace' })
    })
    expect(patchCue).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Fade')).toBeNull()
  })

  it('locked: a click on the Cue column arms the cue as next — on the number itself, not only the margins', () => {
    const onSetStandby = vi.fn()
    draw({ locked: true, activeCueId: 1, onSetStandby })
    // The cue number is the largest thing in the column; locked, it is inert text and the click
    // must bubble to the column.
    // `TruncateStart` says the text twice (a measure and a display), so take the first.
    fireEvent.click(within(row(2)).getAllByText('Q2')[0])
    expect(onSetStandby).toHaveBeenCalledWith(2)
    // The live cue cannot be armed against itself.
    fireEvent.click(row(1).firstElementChild as HTMLElement)
    expect(onSetStandby).toHaveBeenCalledTimes(1)
  })

  it('unlocked: a click on the Cue column selects the row rather than arming', () => {
    const onSetStandby = vi.fn()
    draw({ onSetStandby })
    fireEvent.click(row(2).firstElementChild as HTMLElement)
    expect(onSetStandby).not.toHaveBeenCalled()
    expect(screen.getByText('1 cue')).toBeInTheDocument()
  })

  it('leaves the transport keys alone: Space is not a sheet key, and a locked Backspace is not claimed', () => {
    draw({ locked: true, onSetStandby: () => {} })
    dragFade(0, 1)
    const backspace = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true, cancelable: true })
    window.dispatchEvent(backspace)
    expect(backspace.defaultPrevented).toBe(false)
    const space = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })
    window.dispatchEvent(space)
    expect(space.defaultPrevented).toBe(false)
  })
})
