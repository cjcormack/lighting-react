// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProgrammerLayer } from '@/api/programmerWsApi'
import type { LookSummary } from '@/api/looksApi'

const mocks = vi.hoisted(() => ({
  layers: [] as ProgrammerLayer[],
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
vi.mock('react-router', () => ({ useParams: () => ({ projectId: '1' }) }))
// The picker drags in the whole look/target/timing wizard, and nothing here presses Add.
vi.mock('@/components/cues/editor/AddLayerSheet', () => ({ AddLayerSheet: () => null }))

import { ProgrammerLookStack } from './ProgrammerLookStack'

function look(id: number, name: string): LookSummary {
  return {
    id,
    uuid: `u${id}`,
    name,
    notes: null,
    sortOrder: 0,
    families: ['COLOUR'],
    rowCount: 1,
    effectCount: 0,
    targetCount: 1,
    hasDeferredRows: false,
    editorFixtureType: null,
    preview: [],
    layerCount: 1,
  }
}

const LOOKS = [look(7, 'Warm Wash'), look(8, 'Slow Pulse'), look(9, 'Draft')]

function layer(overrides: Partial<ProgrammerLayer> = {}): ProgrammerLayer {
  return {
    layerId: 1,
    lookId: 7,
    lookName: 'Warm Wash',
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
})

describe('ProgrammerLookStack', () => {
  it('addresses a layer by its id, not by the row it was drawn at', () => {
    // The whole point of the index → `layerId` translation: `layerId`s are not positions and are
    // not dense, so acting on the array index would hit the wrong layer.
    mocks.layers = [layer({ layerId: 40 }), layer({ layerId: 12, lookId: 8, lookName: 'Slow Pulse' })]
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
    mocks.layers = [layer({ layerId: 40 }), layer({ layerId: 12, lookId: 8, lookName: 'Slow Pulse' })]
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

  it('keeps the preview layer out of the reorderable stack', () => {
    // It holds an unsaved draft, is never recorded, and the server pins it to the tail whatever
    // index a move asks for — so a drag handle, an amount field and a remove button would all lie.
    mocks.layers = [layer({ layerId: 40 }), layer({ layerId: 99, lookId: 9, lookName: 'Draft', isPreview: true })]
    render(<ProgrammerLookStack />)

    expect(screen.getAllByLabelText('Reorder layer')).toHaveLength(1)
    expect(screen.getAllByLabelText('Layer amount (%)')).toHaveLength(1)
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('does not let a preview layer shift the ids the rows act on', () => {
    // The server sorts the preview last, but a client that filtered *after* indexing would map row
    // 1 onto it. This is the failure that would silently retarget every control by one.
    mocks.layers = [
      layer({ layerId: 99, lookId: 9, lookName: 'Draft', isPreview: true }),
      layer({ layerId: 40 }),
      layer({ layerId: 41, lookId: 8, lookName: 'Slow Pulse' }),
    ]
    render(<ProgrammerLookStack />)

    fireEvent.click(screen.getAllByLabelText('Disable layer')[0])
    expect(mocks.patchLayer).toHaveBeenCalledWith(40, { enabled: false })
  })

  it('addresses a blend or mask change by layerId, not by index', async () => {
    // Same index→id translation the other ops get, and the same reason: the rendered list is
    // filtered, so position N is not layer N.
    mocks.layers = [
      layer({ layerId: 99, lookId: 9, lookName: 'Draft', isPreview: true }),
      layer({ layerId: 40 }),
    ]
    render(<ProgrammerLookStack />)

    fireEvent.click(screen.getByTitle(/How this layer combines/))
    fireEvent.click(await screen.findByLabelText('Colour'))
    expect(mocks.patchLayer).toHaveBeenCalledWith(40, { propertyMask: 'COLOUR' })
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
})
