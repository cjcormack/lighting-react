// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Fan writes through `useCellWriters`, which reaches `lightingApi` — and the socket opens at import.
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

const focusedTemplate = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../programmer/FocusedTemplateLayer', () => ({
  useFocusedTemplateLayer: () => focusedTemplate.current,
}))

import { FanPopover } from './FanPopover'
import { buildRows, rowWriteTargets } from './rowModel'
import { chan, makeFixture, sliderProp } from '@/test/fixtureFactories'
import type { WriteTarget } from './rowModel'

/** Two heads with a dimmer each — the minimum a fan needs to be a fan rather than a set. */
const FIXTURES = [
  makeFixture('hex-1', [sliderProp('dimmer', 'dimmer', chan(10))]),
  makeFixture('hex-2', [sliderProp('dimmer', 'dimmer', chan(20))]),
]

const TARGETS: WriteTarget[] = buildRows({
  fixtures: FIXTURES,
  groups: [],
  expandedGroups: new Set(),
  textFilter: '',
}).flatMap(rowWriteTargets)

afterEach(() => {
  cleanup()
  focusedTemplate.current = null
})

describe('FanPopover', () => {
  it('offers the fan where the values have somewhere to land', () => {
    render(<FanPopover targets={TARGETS} />)
    expect(screen.getByRole('button', { name: /Fan/ })).not.toBeDisabled()
  })

  it('refuses to fan onto a focused template layer, and says why', () => {
    // That scope is a read: its cells are not editable and `useCellWriters` has no arm for it, so
    // an applied fan would fall through to a live write and put literals in Local — silently, on a
    // grid drawing itself read-only. Disabled with the reason rather than hidden, so the gesture
    // stays discoverable.
    focusedTemplate.current = { layerId: 7, templateId: 4, kind: 'effect' }
    render(<FanPopover targets={TARGETS} />)
    const button = screen.getByRole('button', { name: /Fan/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringContaining('switch to Local'))
  })
})
