// @vitest-environment jsdom
import { useEffect } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  valuesMounts: 0,
  fxMounts: 0,
  layersMounts: 0,
}))

// Counted in an effect, not in the render body: a re-render is not a remount, and the property
// under test is that the values sheet is never *unmounted* (which is what drops its selection).
vi.mock('./ProgrammerSheet', () => ({
  ProgrammerSheet: () => {
    useEffect(() => {
      mocks.valuesMounts += 1
    }, [])
    return <div>values sheet</div>
  },
}))
vi.mock('./FxSheet', () => ({
  FxSheet: () => {
    useEffect(() => {
      mocks.fxMounts += 1
    }, [])
    return <div>fx sheet</div>
  },
}))
vi.mock('./ProgrammerLookStack', () => ({
  ProgrammerLookStack: () => {
    useEffect(() => {
      mocks.layersMounts += 1
    }, [])
    return <div>layer stack</div>
  },
}))
vi.mock('../../store/programmer', () => ({
  useProgrammerSummaryQuery: () => ({ data: { blind: false, entryCount: 3, referenceCount: 0, lastIncluded: null } }),
}))

import { ProgrammerPane } from './ProgrammerPane'

beforeEach(() => {
  localStorage.clear()
  mocks.valuesMounts = 0
  mocks.fxMounts = 0
  mocks.layersMounts = 0
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * Render the pane and make sure it is expanded.
 *
 * The open state is persisted, so a second render in one test arrives already open — clicking
 * unconditionally would collapse it again.
 */
function open() {
  render(<ProgrammerPane />)
  const toggle = screen.getByRole('button', { name: /Programmer/ })
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
}

/**
 * Radix tabs activate on `mouseDown` (or focus, in automatic mode) rather than on `click`, so a
 * bare `fireEvent.click` leaves the tab where it was and every assertion below it passes for the
 * wrong reason.
 */
function selectTab(name: RegExp) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 })
}

describe('ProgrammerPane', () => {
  it('starts collapsed, and shows the entry count without being opened', () => {
    // The whole point of the indicator: you never have to open something to learn the programmer
    // is holding values.
    render(<ProgrammerPane />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('values sheet')).not.toBeInTheDocument()
  })

  it('opens on Values', () => {
    open()
    expect(screen.getByText('values sheet')).toBeInTheDocument()
  })

  it('keeps the values sheet mounted across a tab switch', () => {
    // `useListSelection` clears its scope on unmount, and its own comment explains that a plain
    // teardown clear was safe because "only one list per scope is ever mounted at a time (the three
    // scopes belong to mutually exclusive routes)". Tabs broke that premise: without `forceMount`,
    // glancing at the layer stack silently discards the fixture selection Record scopes on.
    open()
    expect(mocks.valuesMounts).toBe(1)

    selectTab(/Layers/)

    expect(screen.getByText('layer stack')).toBeInTheDocument()
    expect(screen.getByText('values sheet')).toBeInTheDocument()
    expect(mocks.valuesMounts).toBe(1)
  })

  it('hides the values sheet while another tab is showing', () => {
    // `forceMount` alone is not enough: Radix computes `present = forceMount || isSelected`, so with
    // it set the content is never hidden and both tabs would render at once. The explicit `hidden`
    // wins because Radix writes its own before spreading props.
    open()
    const panel = screen.getByText('values sheet').closest('[role="tabpanel"]')
    expect(panel).not.toHaveAttribute('hidden')

    selectTab(/Layers/)
    expect(screen.getByText('values sheet').closest('[role="tabpanel"]')).toHaveAttribute('hidden')
  })

  it('mounts the FX sheet only when its tab is chosen', () => {
    // The other half of the argument: both sheets build the whole fixture row model, so FX is
    // mount-on-demand even though Values is not.
    open()
    expect(mocks.fxMounts).toBe(0)

    selectTab(/FX/)
    expect(screen.getByText('fx sheet')).toBeInTheDocument()
    expect(mocks.fxMounts).toBeGreaterThan(0)
  })

  it('reopens on Values after the FX tab was the last one used', () => {
    // FX is a diagnostic read of what is running. Landing there because you last looked at it —
    // rather than on the values you came to edit — would be the wrong default, so the persisted tab
    // is reset on mount.
    open()
    selectTab(/FX/)
    expect(screen.getByText('fx sheet')).toBeInTheDocument()
    cleanup()

    open()
    expect(screen.queryByText('fx sheet')).not.toBeInTheDocument()
    expect(screen.getByText('values sheet')).toBeInTheDocument()
  })
})
