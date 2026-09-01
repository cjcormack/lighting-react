// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GroupSummary } from '@/api/groupsApi'
import type { Fixture } from '@/store/fixtures'
import { buskingTargetKey, type BuskingTarget } from './buskingTypes'

let groups: GroupSummary[] = []
let fixtures: Fixture[] = []
vi.mock('@/store/groups', () => ({ useGroupListQuery: () => ({ data: groups }) }))
vi.mock('@/store/fixtures', () => ({ useFixtureListQuery: () => ({ data: fixtures }) }))

import { TargetBand } from './TargetBand'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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

function draw(selected: BuskingTarget[] = [], handlers: Partial<Parameters<typeof TargetBand>[0]> = {}) {
  const map = new Map(selected.map((t) => [buskingTargetKey(t), t]))
  return render(
    <TargetBand
      selectedTargets={map}
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
})
