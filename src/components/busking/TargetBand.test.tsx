// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroupSummary } from '@/api/groupsApi'
import type { DeskSelectionSnapshot } from '@/api/selectionApi'
import type { AttributeFamily } from '@/lib/attributeFamily'
import { resetDeskFollowStores, unlinkFromDesk } from '@/lib/deskFollow'
import type { Fixture } from '@/store/fixtures'
import { buskingTargetKey, type BuskingTarget } from './buskingTypes'

let groups: GroupSummary[] = []
let fixtures: Fixture[] = []
vi.mock('@/store/groups', () => ({ useGroupListQuery: () => ({ data: groups }) }))
vi.mock('@/store/fixtures', () => ({ useFixtureListQuery: () => ({ data: fixtures }) }))

// The desk chip's three readers: the desk's fact, this tab's name, and (real) follow/local.
let snapshot: DeskSelectionSnapshot = { targets: [], families: null, source: null }
vi.mock('@/store/selection', () => ({ useDeskSelectionSnapshot: () => snapshot }))
vi.mock('@/lib/windowIdentity', () => ({ useWindowName: () => 'Screen 2' }))
// The chip resolves "this window" through the windows registry now; an empty registry means it
// falls back to comparing names, which is what these tests were written against.
vi.mock('@/store/windows', () => ({ useDeskWindows: () => [], thisWindowRow: () => null }))

import { TargetBand } from './TargetBand'

beforeEach(() => {
  snapshot = { targets: [], families: null, source: null }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.sessionStorage.clear()
  resetDeskFollowStores()
})

function group(name: string, memberCount: number): GroupSummary {
  return {
    name,
    memberCount,
    capabilities: [],
    symmetricMode: 'NONE',
    defaultDistribution: 'NONE',
    compatibleLookIds: [],
  }
}

function fixture(key: string, name: string): Fixture {
  return { key, name } as Fixture
}

function draw(
  selected: BuskingTarget[] = [],
  handlers: Partial<Parameters<typeof TargetBand>[0]> = {},
  families: AttributeFamily[] | null = null,
) {
  const map = new Map(selected.map((t) => [buskingTargetKey(t), t]))
  return render(
    <TargetBand
      selectedTargets={map}
      families={families}
      onToggle={handlers.onToggle ?? (() => {})}
      onClear={handlers.onClear ?? (() => {})}
      onOpenPicker={handlers.onOpenPicker ?? (() => {})}
    />,
  )
}

describe('TargetBand', () => {
  it('lists groups before fixtures, and badges only the groups', () => {
    groups = [group('All Movers', 8)]
    fixtures = [fixture('mac-1', 'MAC 250 #1')]
    draw()

    const pads = screen.getAllByRole('button', { name: /All Movers|MAC 250/ })
    expect(pads.map((p) => p.textContent)).toEqual(['All Movers8', 'MAC 250 #1'])
  })

  /**
   * The gesture change this component makes. `TargetListItem`, which it replaces, was
   * left-click-replace and right-click-toggle — a pair with no touchscreen equivalent and no
   * discoverable mouse one. A pad toggles, full stop.
   */
  it('toggles rather than replacing the selection', () => {
    groups = [group('Front Wash', 6)]
    fixtures = []
    const onToggle = vi.fn()
    draw([], { onToggle })

    fireEvent.click(screen.getByRole('button', { name: /Front Wash/ }))
    expect(onToggle).toHaveBeenCalledWith({
      type: 'group',
      name: 'Front Wash',
      group: groups[0],
    })
  })

  it('marks a selected pad pressed and summarises the selection', () => {
    groups = [group('All Movers', 8)]
    fixtures = [fixture('mac-1', 'MAC 250 #1')]
    const selected: BuskingTarget[] = [
      { type: 'group', name: 'All Movers', group: groups[0] },
      { type: 'fixture', key: 'mac-1', fixture: fixtures[0] },
    ]
    draw(selected)

    expect(screen.getByRole('button', { name: /All Movers/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('2 selected · All Movers, MAC 250 #1')).toBeInTheDocument()
  })

  it('says so, and disables Clear, when nothing is selected', () => {
    groups = [group('All Movers', 8)]
    fixtures = []
    draw()

    expect(screen.getByText('nothing selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
  })

  it('clears through the handler', () => {
    groups = [group('All Movers', 8)]
    fixtures = []
    const onClear = vi.fn()
    draw([{ type: 'group', name: 'All Movers', group: groups[0] }], { onClear })

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('explains an empty rig rather than drawing an empty grid', () => {
    groups = []
    fixtures = []
    draw()

    expect(screen.getByText('No fixtures or groups configured')).toBeInTheDocument()
  })

  /**
   * The selection's attribute mask, as a pill beside the count (multi-screen plan §4): a marquee
   * over Colour cells on another screen lights these heads and says Colour here, which is what a
   * pad press on this screen will be masked to. No mask, no pill.
   */
  it('draws the selection’s families as a pill, and none for every attribute', () => {
    groups = [group('All Movers', 8)]
    fixtures = []
    const view = draw([{ type: 'group', name: 'All Movers', group: groups[0] }], {}, ['COLOUR', 'POSITION'])
    expect(screen.getByText('Colour · Position')).toBeInTheDocument()
    view.unmount()
    draw([{ type: 'group', name: 'All Movers', group: groups[0] }], {}, null)
    expect(screen.queryByText(/Colour/)).not.toBeInTheDocument()
  })

  /**
   * The desk chip's four readings (plan §4, D7): the last *mover*, never this window when this
   * window moved it, and dashed `This window` once unlinked.
   */
  describe('the desk chip', () => {
    beforeEach(() => {
      groups = [group('All Movers', 8)]
      fixtures = []
    })

    it('reads `Desk` when nobody has moved the selection', () => {
      draw()
      expect(screen.getByRole('button', { name: 'Desk' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('reads `Desk` when this window moved it last', () => {
      snapshot = { targets: [], families: null, source: { kind: 'window', name: 'Screen 2' } }
      draw()
      expect(screen.getByRole('button', { name: 'Desk' })).toBeInTheDocument()
      expect(screen.queryByText(/from/)).not.toBeInTheDocument()
    })

    it('names another window that moved it last', () => {
      snapshot = { targets: [], families: null, source: { kind: 'window', name: 'Screen 1' } }
      draw()
      expect(screen.getByRole('button', { name: 'Desk · from Screen 1' })).toBeInTheDocument()
    })

    it('says `from the desk` for a control surface', () => {
      snapshot = { targets: [], families: null, source: { kind: 'surface', name: 'Control surface' } }
      draw()
      expect(screen.getByRole('button', { name: 'Desk · from the desk' })).toBeInTheDocument()
    })

    it('reads a dashed `This window` once unlinked, and a click flips it back', () => {
      snapshot = {
        targets: [{ type: 'group', key: 'All Movers' }],
        families: ['COLOUR'],
        source: { kind: 'window', name: 'Screen 1' },
      }
      draw()
      fireEvent.click(screen.getByRole('button', { name: 'Desk · from Screen 1' }))
      const chip = screen.getByRole('button', { name: 'This window' })
      expect(chip).toHaveAttribute('aria-pressed', 'false')
      expect(chip.className).toContain('border-dashed')
      fireEvent.click(chip)
      expect(screen.getByRole('button', { name: 'Desk · from Screen 1' })).toBeInTheDocument()
    })

    it('starts unlinked when the tab already is', () => {
      unlinkFromDesk({ targets: [], families: null })
      draw()
      expect(screen.getByRole('button', { name: 'This window' })).toBeInTheDocument()
    })
  })
})
