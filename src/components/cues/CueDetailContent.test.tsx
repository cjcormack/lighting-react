// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Cue, CueLayerDetail } from '@/api/cuesApi'
import type { LookSummary } from '@/api/looksApi'

vi.mock('@/store/fixtureFx', () => ({
  useEffectLibraryQuery: () => ({ data: [] }),
}))
vi.mock('@/store/looks', () => ({
  useLookListQuery: () => ({ data: LOOKS }),
}))

import { CueDetailContent } from './CueDetailContent'

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
  },
]

function layer(over: Partial<CueLayerDetail> = {}): CueLayerDetail {
  return {
    lookId: 7,
    lookName: 'Warm Wash',
    sortOrder: 0,
    enabled: true,
    targets: [{ type: 'fixture', key: 'hex-1' }],
    propertyMask: null,
    blendMode: 'OVERRIDE',
    amount: 1,
    stomp: false,
    ...over,
  }
}

function cue(over: Partial<Cue> = {}): Cue {
  return {
    id: 1,
    name: 'Act 1 Warm',
    cueNumber: '1',
    cueNumberAuto: false,
    sortOrder: 0,
    palette: [],
    layers: [],
    adHocEffects: [],
    propertyAssignments: [],
    triggers: [],
    ...over,
  } as Cue
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * The first test in this tree, and it covers more than one component's worth of surface.
 *
 * `CueDetailContent` **is** the cue read surface: `RunCueCard` reaches it through `RunOutputPane`,
 * and `RunMobileCueCard` and the Prompt Book rail through `CueCardBody`. None of those four render
 * cue content of their own, so what is asserted here is what all four show — which is why plan §4.5's
 * "four independent read renderers" collapsed to one file.
 */
describe('CueDetailContent', () => {
  it('renders each layer in order, named and with its targets', () => {
    render(
      <CueDetailContent
        cue={cue({ layers: [layer(), layer({ lookName: 'Second', sortOrder: 1 })] })}
        projectId={1}
      />,
    )
    expect(screen.getByText('Warm Wash')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    // Both layers name the same fixture, so this is deliberately getAll — one target chip per row.
    expect(screen.getAllByText('hex-1')).toHaveLength(2)
  })

  it('shows a masked layer’s families, so a colour-only layer explains itself', () => {
    // The migration sets a mask on every layer folded from a value-level reference, so this is the
    // common case. It reads the same here as in the editor because both draw `LayerRow`.
    render(<CueDetailContent cue={cue({ layers: [layer({ propertyMask: 'COLOUR' })] })} projectId={1} />)
    expect(screen.getByText('[Colour]')).toBeInTheDocument()
  })

  it('offers no editing controls at all', () => {
    // The property that makes sharing `LayerRow` with the authoring surface safe. `readOnly` strips
    // amount, enable, remove and the combine popover; a regression here would put live controls on
    // the Run card and the Prompt Book rail, where there is no mutation behind them.
    render(
      <CueDetailContent
        cue={cue({ layers: [layer({ propertyMask: 'COLOUR', blendMode: 'MAX', amount: 0.5 })] })}
        projectId={1}
      />,
    )
    expect(screen.queryByLabelText('Layer amount (%)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Disable layer')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Remove')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Reorder layer')).not.toBeInTheDocument()
    expect(screen.queryByTitle(/How this layer combines/)).not.toBeInTheDocument()
    // Read-only still *reports* both, or the operator cannot explain the cue — and words the mask
    // exactly as the editable trigger does.
    expect(screen.getByText('[Colour]')).toBeInTheDocument()
    expect(screen.getByText('MAX')).toBeInTheDocument()
  })

  it('says a layer with no targets takes them from the look', () => {
    render(<CueDetailContent cue={cue({ layers: [layer({ targets: [] })] })} projectId={1} />)
    expect(screen.getByText(/look’s own targets/)).toBeInTheDocument()
  })

  it('offers an empty state rather than a blank section', () => {
    render(<CueDetailContent cue={cue()} projectId={1} />)
    expect(screen.getByText('Layers')).toBeInTheDocument()
    expect(screen.getAllByText('None.').length).toBeGreaterThan(0)
  })
})
