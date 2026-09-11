// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Fan writes through `useCellWriters`, which reaches `lightingApi` — and the socket opens at import.
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

const focusedTemplate = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../programmer/FocusedTemplateLayer', () => ({
  useFocusedTemplateLayer: () => focusedTemplate.current,
}))
const scopeState = vi.hoisted(() => ({ current: null as null | { kind: 'output' | 'local' } }))
vi.mock('../programmer/ProgrammerScope', () => ({
  useProgrammerScope: () => scopeState.current,
}))

import { FanPopover, type FanColumn } from './FanPopover'
import { buildRows, rowWriteTargets } from './rowModel'
import { chan, makeFixture, sliderProp } from '@/test/fixtureFactories'
import type { WriteTarget } from './rowModel'

/** Two heads with a dimmer and a zoom each — the minimum a fan needs to be a fan rather than a set. */
const FIXTURES = [
  makeFixture('hex-1', [sliderProp('dimmer', 'dimmer', chan(10)), sliderProp('zoom', 'zoom', chan(11))]),
  makeFixture('hex-2', [sliderProp('dimmer', 'dimmer', chan(20)), sliderProp('zoom', 'zoom', chan(21))]),
]

const TARGETS: WriteTarget[] = buildRows({
  fixtures: FIXTURES,
  groups: [],
  expandedGroups: new Set(),
  textFilter: '',
}).flatMap(rowWriteTargets)

const DIMMER: FanColumn = { col: 'dimmer', targets: TARGETS }
const ZOOM: FanColumn = { col: 'zoom', targets: TARGETS }

beforeEach(() => {
  // Radix measures the trigger to size the popover; jsdom has no observer to do it with.
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
  focusedTemplate.current = null
  scopeState.current = null
})

describe('FanPopover', () => {
  it('offers the fan where the selected cells have somewhere to land', () => {
    render(<FanPopover columns={[DIMMER]} />)
    expect(screen.getByRole('button', { name: 'Fan' })).not.toBeDisabled()
  })

  it('is disabled with nothing selected, and says so', () => {
    render(<FanPopover columns={[]} />)
    const button = screen.getByRole('button', { name: 'Fan' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringContaining('Select cells'))
  })

  it('is disabled for one cell — a single point is a set, not a fan', () => {
    render(<FanPopover columns={[{ col: 'dimmer', targets: TARGETS.slice(0, 1) }]} />)
    expect(screen.getByRole('button', { name: 'Fan' })).toBeDisabled()
  })

  it('takes the column from the selection and draws no chooser for one column', () => {
    render(<FanPopover columns={[DIMMER]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fan' }))
    expect(screen.getByText('Dimmer')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Column to fan' })).toBeNull()
    expect(screen.getByText(/across 2 targets/)).toBeInTheDocument()
  })

  it('offers a chooser only when the selection spans more than one fannable column', () => {
    render(<FanPopover columns={[DIMMER, ZOOM]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fan' }))
    expect(screen.getByRole('combobox', { name: 'Column to fan' })).toBeInTheDocument()
  })

  it('opens in the shared cell-editor surface, so it takes the sheet forms with the other editors', () => {
    render(<FanPopover columns={[DIMMER]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fan' }))
    expect(document.querySelector('[data-cell-editor-surface="popover"]')).not.toBeNull()
  })

  it('refuses to fan in Output scope — a read of the cook — with the reason Set and Clear give', () => {
    scopeState.current = { kind: 'output' }
    render(<FanPopover columns={[DIMMER]} />)
    const button = screen.getByRole('button', { name: 'Fan' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringContaining('read of the cook'))
  })

  it('refuses to fan onto a focused template layer, and says why', () => {
    // That scope is a read: its cells are not editable and `useCellWriters` has no arm for it, so
    // an applied fan would fall through to a live write and put literals in Local — silently, on a
    // grid drawing itself read-only. Disabled with the reason rather than hidden, so the gesture
    // stays discoverable.
    focusedTemplate.current = { layerId: 7, templateId: 4, kind: 'effect' }
    render(<FanPopover columns={[DIMMER]} />)
    const button = screen.getByRole('button', { name: 'Fan' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringContaining('switch to Local'))
  })
})
