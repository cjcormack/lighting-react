// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProgrammerLayer } from '@/api/programmerWsApi'
import type { CueLayer } from '@/api/cuesApi'
import type { LookSummary } from '@/api/looksApi'

const mocks = vi.hoisted(() => ({
  layers: [] as ProgrammerLayer[],
  picked: {} as CueLayer,
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  moveLayer: vi.fn(),
  patchLayer: vi.fn(),
}))

vi.mock('@/store/programmer', () => ({
  useProgrammerLayersQuery: () => ({ data: mocks.layers }),
  programmerAddLayer: mocks.addLayer,
  programmerRemoveLayer: mocks.removeLayer,
  programmerMoveLayer: mocks.moveLayer,
  programmerPatchLayer: mocks.patchLayer,
}))
vi.mock('@/store/looks', () => ({
  useLookListQuery: () => ({ data: LOOKS }),
}))
// The stack loads both libraries now, because a layer can apply either. Mocked as loaded-and-empty:
// these tests are about layer *addressing*, and an unmocked query has no Provider to read.
vi.mock('@/store/templates', () => ({
  useTemplateListQuery: () => ({ data: [] }),
}))
vi.mock('react-router', () => ({ useParams: () => ({ projectId: '1' }) }))
// The picker drags in the whole look/target/timing wizard. Stubbed down to the one thing this
// file cares about: the `CueLayer` it hands back, and what `handleAdd` then puts on the wire.
vi.mock('@/components/programmer/AddLayerSheet', () => ({
  AddLayerSheet: ({ open, onAdd }: { open: boolean; onAdd: (layer: CueLayer) => void }) =>
    open ? <button onClick={() => onAdd(mocks.picked)}>confirm picked layer</button> : null,
}))

import { ProgrammerLookStack } from './ProgrammerLookStack'

function look(id: number, name: string): LookSummary {
  return {
    id,
    uuid: `u${id}`,
    name,
    notes: null,
    families: ['COLOUR'],
    rowCount: 1,
    effectCount: 0,
    targetCount: 1,
    hasDeferredEffects: false,
    preview: [],
    layerCount: 1,
  }
}

const LOOKS = [look(7, 'Warm Wash'), look(8, 'Slow Pulse')]

function layer(overrides: Partial<ProgrammerLayer> = {}): ProgrammerLayer {
  return {
    layerId: 1,
    source: { kind: 'LOOK', id: 7, uuid: 'u7', name: 'Warm Wash' },
    sortOrder: 0,
    enabled: true,
    targets: [{ type: 'group', key: 'front-wash' }],
    blendMode: 'OVERRIDE',
    amount: 1,
    stomp: false,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.layers = []
  mocks.picked = {} as CueLayer
})

describe('ProgrammerLookStack', () => {
  it('addresses a layer by its id, not by the row it was drawn at', () => {
    // The whole point of the index → `layerId` translation: `layerId`s are not positions and are
    // not dense, so acting on the array index would hit the wrong layer.
    mocks.layers = [layer({ layerId: 40 }), layer({ layerId: 12, source: { kind: 'LOOK', id: 8, uuid: 'u8', name: 'Slow Pulse' } })]
    render(<ProgrammerLookStack />)

    fireEvent.click(screen.getAllByLabelText('Disable layer')[1])
    expect(mocks.patchLayer).toHaveBeenCalledWith(12, { enabled: false })

    fireEvent.click(screen.getAllByLabelText('Remove')[0])
    expect(mocks.removeLayer).toHaveBeenCalledWith(40)
  })

  it('toggles stomp against the layer id', () => {
    // Stomp is the programmer's escape hatch from the Layer 3/4 boundary: a busking effect below
    // fighting a value a Look above sets. It goes through `patchLayer` like every other field —
    // deliberately *not* through the pads' `looks/{id}/toggle`, which owns add/remove only.
    mocks.layers = [layer({ layerId: 40 }), layer({ layerId: 12, source: { kind: 'LOOK', id: 8, uuid: 'u8', name: 'Slow Pulse' } })]
    render(<ProgrammerLookStack />)

    fireEvent.click(screen.getAllByLabelText('Stomp lower layers')[1])
    expect(mocks.patchLayer).toHaveBeenCalledWith(12, { stomp: true })
  })

  it('commits an amount against the layer id', () => {
    mocks.layers = [layer({ layerId: 40, amount: 1 })]
    render(<ProgrammerLookStack />)

    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '60' } })
    fireEvent.blur(input)

    expect(mocks.patchLayer).toHaveBeenCalledWith(40, { amount: 0.6 })
  })

  it('addresses a blend or mask change by layerId, not by index', async () => {
    // Same index→id translation the other ops get, and worth its own case because blend and mask
    // arrive from a popover rather than from the row: the second row must still reach layer 41.
    mocks.layers = [
      layer({ layerId: 40 }),
      layer({ layerId: 41, source: { kind: 'LOOK', id: 8, uuid: 'u8', name: 'Slow Pulse' } }),
    ]
    render(<ProgrammerLookStack />)

    fireEvent.click(screen.getAllByTitle(/How this layer combines/)[1])
    fireEvent.click(await screen.findByLabelText('Colour'))
    expect(mocks.patchLayer).toHaveBeenCalledWith(41, { propertyMask: 'COLOUR' })
  })

  it('clears a mask with an empty string, because an omitted field means leave alone', async () => {
    // `programmer.patchLayer` treats a missing field as "don't touch". Sending `undefined` for a
    // cleared mask would make un-masking a silent no-op, so null has to travel as ''.
    mocks.layers = [layer({ layerId: 40, propertyMask: 'COLOUR' })]
    render(<ProgrammerLookStack />)

    fireEvent.click(screen.getByTitle(/How this layer combines/))
    fireEvent.click(await screen.findByLabelText('Colour'))
    expect(mocks.patchLayer).toHaveBeenCalledWith(40, { propertyMask: '' })
  })

  it('says the operator’s own values beat every layer', () => {
    // The flip an operator arriving from presets is most likely to be surprised by, so it is
    // stated in the pane rather than left to be discovered.
    mocks.layers = [layer()]
    render(<ProgrammerLookStack />)
    expect(screen.getByText(/values you set yourself win over all of them/)).toBeInTheDocument()
  })

  it('offers an empty state rather than a blank pane', () => {
    render(<ProgrammerLookStack />)
    expect(screen.getByText(/No layers\./)).toBeInTheDocument()
  })

  it('forwards the picker’s property mask, and drops only its timing', () => {
    // `handleAdd` rebuilds the wire frame field by field, so anything the picker sets and it
    // forgets is silently lost. `propertyMask` was: the picker masks a template layer to the
    // template's own family so the row cannot read as "this could touch anything", and the same
    // picker was producing a masked layer in a cue and an unmasked one here. The timing fields
    // stay dropped on purpose — a programmer layer fires now.
    mocks.picked = {
      templateId: 11,
      targets: [{ type: 'group', key: 'front-wash' }],
      propertyMask: 'COLOUR',
      speedMasterUuid: 'aaaaaaaa-0000-0000-0000-000000000002',
      rateSpeedMasterUuid: null,
      delayMs: 3000,
      intervalMs: 500,
      randomWindowMs: 250,
    }
    render(<ProgrammerLookStack />)

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'confirm picked layer' }))

    expect(mocks.addLayer).toHaveBeenCalledWith({
      lookId: undefined,
      templateId: 11,
      targets: [{ type: 'group', key: 'front-wash' }],
      propertyMask: 'COLOUR',
      speedMasterUuid: 'aaaaaaaa-0000-0000-0000-000000000002',
      rateSpeedMasterUuid: undefined,
    })
  })
})
