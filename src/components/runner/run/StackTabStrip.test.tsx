// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CueStack } from '@/api/cueStacksApi'
import { StackTabStrip } from './StackTabStrip'

// jsdom implements neither, and the strip observes its own scroller.
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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function stack(id: number, overrides: Partial<CueStack> = {}): CueStack {
  return {
    id,
    name: `Act ${id}`,
    palette: [],
    loop: false,
    sortOrder: id,
    type: 'STACK',
    label: null,
    cues: [],
    activeCueId: null,
    standbyCueId: null,
    nextCueId: null,
    canEdit: true,
    canDelete: true,
    ...overrides,
  }
}

describe('StackTabStrip', () => {
  it('renders nothing for a single-stack show', () => {
    // The ShowBar carries the stack name in that case; a one-tab switcher is noise.
    const { container } = render(
      <StackTabStrip
        stacks={[stack(1)]}
        activeStackId={1}
        runnableStackCount={1}
        onSwitchToStack={() => {}}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('scrolls the active tab into view when the server moves it', () => {
    // `activeStackId` changes from the server — another desk, a surface, a script — and the strip
    // used to select a tab that could be off the right-hand edge with nothing indicating it.
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    const stacks = [stack(1), stack(2), stack(3)]
    const { rerender } = render(
      <StackTabStrip
        stacks={stacks}
        activeStackId={1}
        runnableStackCount={3}
        onSwitchToStack={() => {}}
      />,
    )
    scrollIntoView.mockClear()

    rerender(
      <StackTabStrip
        stacks={stacks}
        activeStackId={3}
        runnableStackCount={3}
        onSwitchToStack={() => {}}
      />,
    )

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.instances[0]).toBe(
      document.querySelector('[data-stack-id="3"]'),
    )
    // Determinate, not animated: mid-show a jump beats a scroll you have to wait out.
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto', inline: 'nearest' }),
    )
  })

  it('switches stacks on click, and draws separators as non-interactive', () => {
    const onSwitchToStack = vi.fn()
    const stacks = [
      stack(1),
      stack(2, { type: 'SEPARATOR', label: 'INTERVAL' }),
      stack(3),
    ]
    render(
      <StackTabStrip
        stacks={stacks}
        activeStackId={1}
        runnableStackCount={2}
        onSwitchToStack={onSwitchToStack}
      />,
    )

    expect(screen.getByText('INTERVAL')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Act 3/ }))
    expect(onSwitchToStack).toHaveBeenCalledWith(stacks[2])
  })

  it('offers a scroll affordance only on the side that has more', () => {
    const stacks = [stack(1), stack(2), stack(3)]
    render(
      <StackTabStrip
        stacks={stacks}
        activeStackId={1}
        runnableStackCount={3}
        onSwitchToStack={() => {}}
      />,
    )
    const scroller = document.querySelector('[aria-label="Stack tabs"]') as HTMLElement

    // jsdom lays nothing out, so the widths are stubbed to describe "overflowing, scrolled left".
    Object.defineProperty(scroller, 'scrollWidth', { value: 1200, configurable: true })
    Object.defineProperty(scroller, 'clientWidth', { value: 400, configurable: true })
    scroller.scrollLeft = 0
    fireEvent.scroll(scroller)

    expect(screen.queryByLabelText('Scroll stacks left')).toBeNull()
    expect(screen.getByLabelText('Scroll stacks right')).toBeTruthy()

    scroller.scrollLeft = 800
    fireEvent.scroll(scroller)
    expect(screen.getByLabelText('Scroll stacks left')).toBeTruthy()
    expect(screen.queryByLabelText('Scroll stacks right')).toBeNull()
  })
})
