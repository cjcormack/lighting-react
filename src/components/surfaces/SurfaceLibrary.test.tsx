// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AvailableProperty } from '@/hooks/useTargetProperties'

/**
 * The library's rows and chips, and the one rule that is invisible until a drag is in flight.
 *
 * The drop mapping itself is `lib/surfaceDrop.test.ts` — pure, because jsdom's rects are all zero.
 * What is asserted here is what the *palette* decides: which rows exist, which chips a target
 * offers, and that a property the desk cannot drive from a fader is never offered as one.
 */

const groups = [
  { name: 'Movers', memberCount: 4, capabilities: [], symmetricMode: 'NONE', defaultDistribution: 'LINEAR', compatibleLookIds: [] },
]
const fixtures = [{ key: 'par-1', name: 'PAR 1', typeKey: 'par', model: 'LED PAR 64' }]
const stacks = [
  {
    id: 3,
    type: 'STACK',
    name: 'Act 1',
    cues: [
      { id: 12, name: 'Chorus', cueNumber: '4', cueType: 'CUE' },
      { id: 13, name: 'End marker', cueNumber: '5', cueType: 'MARKER' },
    ],
  },
]

/** Slider and colour are continuous; a position pair and a setting are not (see the hook). */
const targetProperties: AvailableProperty[] = [
  { name: 'dimmer', displayName: 'dimmer', type: 'slider', category: 'dimmer', continuous: true },
  { name: 'rgbColour', displayName: 'colour', type: 'colour', category: 'colour', continuous: true },
  { name: 'position', displayName: 'position', type: 'position', category: 'position', continuous: false },
  { name: 'gobo', displayName: 'gobo', type: 'setting', category: 'gobo', continuous: false },
]
const rigProperties: AvailableProperty[] = [
  { name: 'dimmer', displayName: 'dimmer', type: 'slider', category: 'dimmer', continuous: true },
  { name: 'pan', displayName: 'pan', type: 'slider', category: 'pan', continuous: true },
]

vi.mock('@/store/groups', () => ({ useGroupListQuery: () => ({ data: groups }) }))
vi.mock('@/store/fixtures', () => ({ useFixtureListQuery: () => ({ data: fixtures }) }))
vi.mock('@/store/cueStacks', () => ({ useProjectCueStackListQuery: () => ({ data: stacks }) }))
vi.mock('@/hooks/useTargetProperties', () => ({
  useTargetProperties: () => ({ properties: targetProperties, isLoading: false }),
  useRigProperties: () => rigProperties,
}))

import { SurfaceLibrary } from './SurfaceLibrary'

afterEach(cleanup)

function draw(placements = new Map<string, string>()) {
  return render(
    <DndContext>
      <SurfaceLibrary
        projectId={1}
        banks={[{ id: 'layer-a', name: 'A' }]}
        deviceTypeKey="xtc"
        placements={placements}
      />
    </DndContext>,
  )
}

/** Every draggable label in one row. Rows are addressed by key: several say "Selection". */
function chipsOf(key: string): string[] {
  return [...screen.getByTestId(`library-row:${key}`).querySelectorAll('button')].map(
    (b) => b.textContent ?? '',
  )
}

function row(key: string): HTMLElement | null {
  return screen.queryByTestId(`library-row:${key}`)
}

describe('SurfaceLibrary', () => {
  it('draws the seven kinds this pass carries and nothing that needs session 4', () => {
    draw()
    for (const key of [
      'group:Movers',
      'fixture:par-1',
      'selection',
      'encoder-bank',
      'stack:3',
      'cue:12',
      'desk',
    ]) {
      expect(row(key)).not.toBeNull()
    }
    // Templates, Looks and busk pages arrive in session 4, beside the targets they bind — the
    // router cannot dispatch one yet, so a pad for one would be dead on arrival.
    expect(screen.queryByText('Looks')).toBeNull()
  })

  it('offers only the properties a fader can actually drive', () => {
    // `PropertyChannelResolver` writes a slider and a colour, refuses a setting by name and has no
    // arm for a position pair — so a `position` chip would be a control that silently does nothing.
    draw()
    const chips = chipsOf('group:Movers')
    expect(chips).toContain('dimmer')
    expect(chips).toContain('colour')
    expect(chips).toContain('select')
    expect(chips).not.toContain('position')
    expect(chips).not.toContain('gobo')
  })

  it('gives a group and a fixture the strip handle, and the deskwide rows none', () => {
    // A row lands on a strip; Selection, Encoder bank and Desk have no target for a strip to
    // follow, so there is nothing to lift.
    draw()
    expect(chipsOf('group:Movers')).toContain('Strip')
    expect(chipsOf('selection')).not.toContain('Strip')
    expect(chipsOf('encoder-bank')).not.toContain('Strip')
  })

  it('skips a MARKER cue, which cannot be fired', () => {
    draw()
    expect(screen.queryByText('End marker')).toBeNull()
  })

  it('names the device’s own banks on the Desk row', () => {
    draw()
    expect(chipsOf('desk')).toContain('Bank A')
  })

  it('says where a row already sits', () => {
    draw(new Map([['group:Movers', 'strip 3']]))
    expect(screen.getByText('strip 3')).toBeInTheDocument()
  })

  it('filters chips by family, and keeps a row whose strip handle survives', () => {
    // A family cannot partition *targets* — a group has every family its heads have — so it selects
    // which attributes to bind. The strip handle is a whole-strip gesture covering every family.
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Colour' }))
    const chips = chipsOf('group:Movers')
    expect(chips).toContain('colour')
    expect(chips).not.toContain('dimmer')
    expect(chips).toContain('Strip')
  })

  it('narrows to one kind', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Cues' }))
    expect(row('stack:3')).not.toBeNull()
    expect(row('group:Movers')).toBeNull()
    expect(row('desk')).toBeNull()
  })

  it('searches by name', () => {
    draw()
    fireEvent.change(screen.getByLabelText('Search the binding library'), {
      target: { value: 'mov' },
    })
    expect(row('group:Movers')).not.toBeNull()
    expect(row('fixture:par-1')).toBeNull()
  })

  it('gives the Selection row the rig-wide vocabulary plus its two actions', () => {
    // A selection names no head, so the union of the patch is the only honest vocabulary — a
    // property no selected head declares drops its move, which is a fact about the selection.
    draw()
    const chips = chipsOf('selection')
    expect(chips).toEqual(expect.arrayContaining(['dimmer', 'pan', 'Clear', 'Locate']))
  })

  it('gives a row two ways to reach the same strip gesture', () => {
    // The grip and the *Strip* chip lift the same payload: the grip is small and the chip is
    // labelled, and a palette that only had one of them would be either fiddly or unexplained.
    draw()
    const handles = within(screen.getByTestId('library-row:group:Movers')).getAllByLabelText(
      'Place Movers on a strip',
    )
    expect(handles).toHaveLength(2)
  })
})
