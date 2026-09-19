// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as sidePanel from './sidePanel'
import { CHROME_ROW_CLASS } from './sheetFrame'
import {
  SIDE_PANEL_BODY_CLASS,
  SIDE_PANEL_ENTER_CLASS,
  SIDE_PANEL_STRIP_CELL_CLASS,
  SIDE_PANEL_STRIP_CLASS,
  usePanelEnter,
} from './sidePanel'

/**
 * The shared docked-panel chrome, and the one piece of it that is code.
 *
 * The class strings are pinned the way `ProgrammerWorkspace.test.tsx` pins the frames': jsdom
 * lays nothing out, so what a test can hold is the contract — the measurements the chrome system
 * settles, so a change to one of them is a change to this file and not a silent drift in one of
 * the two surfaces. `usePanelEnter` is pinned as behaviour, because its two rules (never on the
 * first render, latched while open) are each a real defect if they go.
 */

afterEach(cleanup)

describe('the shared side-panel chrome', () => {
  it('states the strip’s measurements once: 40px wide, on a 40px cell', () => {
    expect(SIDE_PANEL_STRIP_CLASS).toContain('w-10')
    expect(SIDE_PANEL_STRIP_CLASS).toContain('border-l')
    expect(SIDE_PANEL_STRIP_CELL_CLASS).toContain('h-10')
    expect(SIDE_PANEL_STRIP_CELL_CLASS).toContain('w-10')
  })

  it('does not restate the 40px chrome row — a panel header is `sheetFrame.ts`’s', () => {
    // The whole point of the module is one measurement in one place, so a header constant here
    // would be the drift it exists to close: `CHROME_ROW_CLASS` already says 40px on a 12px
    // gutter, and both panels import it directly.
    expect(CHROME_ROW_CLASS).toBe('flex h-10 shrink-0 items-center gap-2 border-b px-3')
    expect(Object.keys(sidePanel)).not.toContain('SIDE_PANEL_HEADER_CLASS')
    for (const value of Object.values(sidePanel)) {
      if (typeof value === 'string') expect(value).not.toBe(CHROME_ROW_CLASS)
    }
  })

  it('fills the body opaquely — both panels have an overlay arm over live content', () => {
    expect(SIDE_PANEL_BODY_CLASS).toContain('color-mix')
    expect(SIDE_PANEL_BODY_CLASS).toContain('border-l')
    // A translucent fill is the thing the mix exists to avoid; catch a revert to it by name.
    expect(SIDE_PANEL_BODY_CLASS).not.toContain('bg-card/40')
  })

  it('enters from the right rather than merely fading, and declares no exit', () => {
    expect(SIDE_PANEL_ENTER_CLASS).toContain('animate-in')
    expect(SIDE_PANEL_ENTER_CLASS).toContain('slide-in-from-right-4')
    expect(SIDE_PANEL_ENTER_CLASS).not.toContain('animate-out')
  })
})

/** A stand-in panel: the flag, a toggle for it, and the class the hook answers with. */
function Panel({ initial }: { initial: boolean }) {
  const [open, setOpen] = useState(initial)
  // A counter rather than `setOpen(open)`: React bails out of a state write that changes nothing,
  // so re-rendering has to be asked for with something that actually moves.
  const [, setTick] = useState(0)
  const enter = usePanelEnter(open)
  return (
    <>
      <button onClick={() => setOpen((previous) => !previous)}>toggle</button>
      <button onClick={() => setTick((previous) => previous + 1)}>re-render</button>
      <div data-testid="panel" data-enter={enter ? 'yes' : 'no'} />
    </>
  )
}

function enterState() {
  return screen.getByTestId('panel').getAttribute('data-enter')
}

describe('usePanelEnter', () => {
  it('does not animate a panel that is already open on the first render', () => {
    render(<Panel initial />)
    expect(enterState()).toBe('no')
  })

  it('animates when the panel opens, and stops offering it once it closes again', () => {
    render(<Panel initial={false} />)
    expect(enterState()).toBe('no')
    fireEvent.click(screen.getByText('toggle'))
    expect(enterState()).toBe('yes')
    fireEvent.click(screen.getByText('toggle'))
    expect(enterState()).toBe('no')
  })

  it('latches the class while the panel stays open — a re-render must not cut the animation off', () => {
    render(<Panel initial={false} />)
    fireEvent.click(screen.getByText('toggle'))
    expect(enterState()).toBe('yes')
    // Both panels re-render freely while open: a layer arrives, a marquee moves, a tempo ticks.
    fireEvent.click(screen.getByText('re-render'))
    fireEvent.click(screen.getByText('re-render'))
    expect(enterState()).toBe('yes')
  })

  it('is safe under StrictMode’s double render — the flag is state, not a mutated ref', () => {
    render(
      <StrictMode>
        <Panel initial={false} />
      </StrictMode>,
    )
    expect(enterState()).toBe('no')
    fireEvent.click(screen.getByText('toggle'))
    expect(enterState()).toBe('yes')
  })
})
