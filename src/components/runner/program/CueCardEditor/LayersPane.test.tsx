// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Cue, CueLayerDetail } from '@/api/cuesApi'
import type { LookSummary } from '@/api/looksApi'

const patchCue = vi.fn()

vi.mock('@/store/cues', () => ({
  usePatchProjectCueMutation: () => [patchCue, { isLoading: false }],
}))
vi.mock('@/store/fixtureFx', () => ({
  useEffectLibraryQuery: () => ({ data: [] }),
}))
vi.mock('@/store/looks', () => ({
  useLookListQuery: () => ({ data: LOOKS }),
}))
// The add-sheets pull in the whole picker tree (target picker, speed masters, effect library) and
// none of them matter to what this file asserts, which is the PATCH each control sends.
vi.mock('./AddAssignmentSheet', () => ({ AddAssignmentSheet: () => null }))
vi.mock('./AddEffectSheet', () => ({ AddEffectSheet: () => null }))
vi.mock('./AddLayerSheet', () => ({ AddLayerSheet: () => null }))

import { LayersPane } from './LayersPane'

const LOOKS: LookSummary[] = [
  {
    id: 7,
    uuid: 'u7',
    name: 'Warm Wash',
    notes: null,
    sortOrder: 0,
    families: ['COLOUR'],
    rowCount: 3,
    effectCount: 0,
    targetCount: 3,
    hasDeferredRows: false,
    editorFixtureType: null,
    preview: [],
    layerCount: 1,
    refRowCount: 0,
  },
  {
    id: 8,
    uuid: 'u8',
    name: 'Slow Pulse',
    notes: null,
    sortOrder: 1,
    families: ['INTENSITY'],
    rowCount: 1,
    effectCount: 1,
    targetCount: 0,
    hasDeferredRows: true,
    editorFixtureType: 'mh-spot',
    preview: [],
    layerCount: 1,
    refRowCount: 0,
  },
]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function layer(overrides: Partial<CueLayerDetail> = {}): CueLayerDetail {
  return {
    lookId: 7,
    lookName: 'Warm Wash',
    sortOrder: 0,
    enabled: true,
    targets: [{ type: 'group', key: 'front-wash' }],
    propertyMask: null,
    blendMode: 'OVERRIDE',
    amount: 1,
    stomp: false,
    speedMasterUuid: null,
    rateSpeedMasterUuid: null,
    delayMs: null,
    intervalMs: null,
    randomWindowMs: null,
    ...overrides,
  }
}

function cue(layers: CueLayerDetail[]): Cue {
  return {
    id: 12,
    name: 'Act 1 Warm',
    palette: [],
    updateGlobalPalette: false,
    layers,
    adHocEffects: [],
    propertyAssignments: [],
    triggers: [],
    cueStackId: 1,
    cueStackName: 'show',
    sortOrder: 0,
    autoAdvance: false,
    autoAdvanceDelayMs: null,
    fadeDurationMs: null,
    fadeCurve: 'LINEAR',
    cueNumber: null,
    cueNumberAuto: true,
    notes: null,
    cueType: 'STANDARD',
    canEdit: true,
    canDelete: true,
  }
}

function renderPane(layers: CueLayerDetail[]) {
  return render(
    <LayersPane cue={cue(layers)} projectId={1} mode="by-layer" targets={[]} />,
  )
}

describe('LayersPane layer list', () => {
  it('renders the layers in order, labelled by look', () => {
    renderPane([layer(), layer({ lookId: 8, lookName: 'Slow Pulse', sortOrder: 1 })])
    expect(screen.getByText('Warm Wash')).toBeTruthy()
    expect(screen.getByText('Slow Pulse')).toBeTruthy()
    // The position labels are what make the composition legible — the operator has to be able to
    // see which layer wins without reading `sortOrder` off the wire. Queried by exact text within
    // the rows, because the section header carries a count badge that also reads "2".
    const positions = screen
      .getAllByText(/^[12]$/)
      .map((el) => el.textContent)
    expect(positions).toContain('1')
    expect(positions).toContain('2')
  })

  it('says out loud that later layers win, including for intensity', () => {
    // The one thing about this pane an operator arriving from presets is most likely to get wrong:
    // within a cue, layered intensity is later-wins, not HTP max.
    renderPane([layer()])
    expect(screen.getByText(/Later layers win/)).toBeTruthy()
  })

  it('disabling a layer PATCHes the whole array with that one flag flipped', () => {
    // The whole array, because `layers` is replaced wholesale when the key is present — sending
    // one entry would delete the rest of the composition.
    renderPane([layer(), layer({ lookId: 8, lookName: 'Slow Pulse', sortOrder: 1 })])
    fireEvent.click(screen.getAllByLabelText('Disable layer')[0])

    expect(patchCue).toHaveBeenCalledTimes(1)
    const payload = patchCue.mock.calls[0][0]
    expect(payload.projectId).toBe(1)
    expect(payload.cueId).toBe(12)
    expect(payload.layers).toHaveLength(2)
    expect(payload.layers[0].enabled).toBe(false)
    expect(payload.layers[1].enabled).toBe(true)
  })

  it('re-enables a disabled layer', () => {
    renderPane([layer({ enabled: false })])
    fireEvent.click(screen.getByLabelText('Enable layer'))
    expect(patchCue.mock.calls[0][0].layers[0].enabled).toBe(true)
  })

  it('strips the read-only look name from every PATCHed layer', () => {
    // `lookName` is populated server-side on read and ignored on write. Echoing it back is the
    // same class of mistake as sending `presetName` was, and `buildCueInput` is what prevents it.
    renderPane([layer()])
    fireEvent.click(screen.getByLabelText('Disable layer'))
    expect('lookName' in patchCue.mock.calls[0][0].layers[0]).toBe(false)
  })

  it('commits an amount change as a fraction, on blur', () => {
    // Per-keystroke commits would PATCH the whole cue for "5" on the way to "50".
    renderPane([layer()])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '50' } })
    expect(patchCue).not.toHaveBeenCalled()

    fireEvent.blur(input)
    expect(patchCue).toHaveBeenCalledTimes(1)
    expect(patchCue.mock.calls[0][0].layers[0].amount).toBe(0.5)
  })

  it('commits an amount change on Enter too', () => {
    renderPane([layer()])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(patchCue.mock.calls[0][0].layers[0].amount).toBe(0.25)
  })

  it('clamps an out-of-range amount rather than sending it', () => {
    // Starting from a non-default, so the clamp is observable: clamping 400% down onto a layer
    // already at 100% is a no-op, which the equality guard below covers instead.
    renderPane([layer({ amount: 0.5 })])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '400' } })
    fireEvent.blur(input)
    expect(patchCue.mock.calls[0][0].layers[0].amount).toBe(1)
  })

  it('sends nothing when the amount is retyped to what it already was', () => {
    renderPane([layer({ amount: 0.5 })])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '50' } })
    fireEvent.blur(input)
    expect(patchCue).not.toHaveBeenCalled()
  })

  it('treats an emptied amount field as no change, not as 0%', () => {
    // `Number('')` is 0, so a bare finite-number check would mute the layer outright when the
    // operator selected the value, deleted it, and clicked away without retyping.
    renderPane([layer({ amount: 0.5 })])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(patchCue).not.toHaveBeenCalled()
  })

  it('abandons an in-progress amount edit on Escape', () => {
    renderPane([layer()])
    const input = screen.getByLabelText('Layer amount (%)')
    fireEvent.change(input, { target: { value: '10' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(patchCue).not.toHaveBeenCalled()
  })

  it('removing a layer PATCHes the survivors with dense sort orders', () => {
    // A gap left behind would put a later insert in the middle of the stack, and two layers
    // sharing a sortOrder would leave the tie to insertion order in the cook step.
    renderPane([
      layer(),
      layer({ lookId: 8, lookName: 'Slow Pulse', sortOrder: 1 }),
      layer({ lookId: 7, sortOrder: 2 }),
    ])
    fireEvent.click(screen.getAllByLabelText('Remove')[0])

    const payload = patchCue.mock.calls[0][0]
    expect(payload.layers).toHaveLength(2)
    expect(payload.layers.map((l: { sortOrder: number }) => l.sortOrder)).toEqual([0, 1])
    expect(payload.layers.map((l: { lookId: number }) => l.lookId)).toEqual([8, 7])
  })

  it('shows a mask read-only, so a colour-only layer explains itself', () => {
    // The migration sets a mask on every layer folded from a value-level reference, so this is the
    // common case rather than an exotic one. Editing it is a later session; hiding it would leave
    // an operator unable to see why a layer only moves colour.
    renderPane([layer({ propertyMask: 'COLOUR' })])
    expect(screen.getByText('[COLOUR]')).toBeTruthy()
  })

  it('names a layer that takes its targets from the look', () => {
    // An empty target set is meaningful rather than missing: the Look's own rows decide where it
    // lands. Rendering nothing would read as "no targets, so it does nothing".
    renderPane([layer({ targets: [] })])
    expect(screen.getByText(/look’s own targets/)).toBeTruthy()
  })

  it('offers a reorder handle per layer', () => {
    // dnd-kit's pointer sequence is not drivable with fireEvent, so the drag itself is covered by
    // `reorderCueLayers` in cueUtils.test.ts. What is worth pinning here is that every layer has a
    // handle to drag — a list rendered without them is silently un-orderable.
    renderPane([layer(), layer({ lookId: 8, sortOrder: 1 })])
    expect(screen.getAllByLabelText('Reorder layer')).toHaveLength(2)
  })
})
