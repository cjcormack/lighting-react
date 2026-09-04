// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { TemplateInput, TemplateSummary } from '@/api/templatesApi'

/**
 * The editor's two identity choices and the write boundary's first rule.
 *
 * **Holds** is the session's whole point — a template holds a value *or* an effect, never both —
 * and three things about it are load-bearing rather than cosmetic:
 *
 *  - it is **locked after creation**, like the family, because the cook's template arm reads one
 *    half or the other and flipping it is a different template;
 *  - **Effect is refused under Beam**, and shown disabled with the reason rather than omitted,
 *    because the backend refuses `beam` *by name* and an operator has to learn where a beam chase
 *    lives instead;
 *  - a save sends **exactly one** of `rows` / `effect`, because a body naming the other half is a
 *    400 rather than a no-op.
 */
const library: EffectLibraryEntry[] = [
  {
    name: 'Colour Pulse',
    category: 'colour',
    outputType: 'COLOUR',
    effectMode: 'STANDARD',
    timingSource: 'BEAT',
    description: 'Pulses between two colours on the beat.',
    parameters: [{ name: 'colourA', type: 'Colour', defaultValue: '#FF9D4A', description: '' }],
    compatibleProperties: ['rgbColour'],
  },
  {
    name: 'Rainbow Cycle',
    category: 'colour',
    outputType: 'COLOUR',
    effectMode: 'STANDARD',
    timingSource: 'BEAT',
    parameters: [],
    compatibleProperties: ['rgbColour'],
  },
  {
    name: 'Sine Dim',
    category: 'dimmer',
    outputType: 'LEVEL',
    effectMode: 'STANDARD',
    timingSource: 'BEAT',
    parameters: [],
    compatibleProperties: ['dimmer'],
  },
]

vi.mock('@/store/fixtureFx', () => ({ useEffectLibraryQuery: () => ({ data: library }) }))
vi.mock('@/store/fixtures', () => ({ useFixtureListQuery: () => ({ data: [] }) }))
vi.mock('@/store/speedMasters', () => ({
  // The D8 stamp: an effect authored under Colour picks up the master whose usage is `colour`.
  useSpeedMasterForCategory: () => (category: string | null) =>
    category === 'colour' ? 'master-2-uuid' : null,
  useSpeedMasterDisplay: () => null,
  useSpeedMasterBpm: () => 120,
  useMaster1Uuid: () => 'master-1-uuid',
  useSpeedMasterLiveQuery: () => ({ data: [] }),
}))
vi.mock('@/store/templates', () => ({
  useResolveTemplateMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve({ entries: [] }) })),
    { isLoading: false },
  ],
  useTemplateListQuery: () => ({ data: [], isLoading: false }),
}))
vi.mock('react-router', () => ({ useParams: () => ({ projectId: '1' }) }))
// The speed-master picker reaches for the live bank; the branch under test is the form around it.
vi.mock('@/components/fx/SpeedMasterSelect', () => ({ SpeedMasterSelect: () => null }))

const { TemplateEditor } = await import('./TemplateEditor')

function template(over: Partial<TemplateSummary> = {}): TemplateSummary {
  return {
    id: 1,
    uuid: 'u1',
    name: 'Amber Key',
    notes: null,
    fadeDurationMs: null,
    family: 'COLOUR',
    isGeneric: true,
    kind: 'value',
    rows: [
      { targetType: 'deferred', targetKey: '', propertyName: 'rgbColour', value: '#FF9D4A;policy=extract' },
    ],
    effect: null,
    layerCount: 0,
    ...over,
  }
}

function renderEditor(over: { template?: TemplateSummary | null; onSave?: (i: TemplateInput) => Promise<void> } = {}) {
  const onSave = over.onSave ?? vi.fn(async () => {})
  render(
    <TemplateEditor
      open
      onOpenChange={() => {}}
      projectId={1}
      template={over.template ?? null}
      onSave={onSave}
      isSaving={false}
    />,
  )
  return { onSave }
}

/** Radix's `Select` needs a real pointer API that jsdom does not ship. */
function chooseEffect(name: string) {
  fireEvent.click(screen.getByRole('combobox'))
  fireEvent.click(screen.getByRole('option', { name }))
}

// Radix's Slider (the beam and intensity controls) measures its thumb; jsdom has no
// ResizeObserver, so stub an inert one — the same stub `EffectParameterForm.test.tsx` uses.
beforeEach(() => {
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
  vi.unstubAllGlobals()
  cleanup()
})

describe('the Holds choice', () => {
  it('starts on Value and offers Effect', () => {
    renderEditor()
    expect(screen.getByRole('button', { name: 'Value' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Effect' })).toBeEnabled()
  })

  it('is locked once the template exists, as the family is', () => {
    // Both halves: the segment itself, and the sentence that says why — a disabled control with no
    // reason reads as breakage rather than as an identity.
    renderEditor({ template: template() })
    expect(screen.getByRole('button', { name: 'Value' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Effect' })).toBeDisabled()
    expect(screen.getByText(/cannot change afterwards/i)).toBeTruthy()
  })

  it('refuses Effect under Beam, disabled with the reason rather than omitted', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Beam' }))
    expect(screen.getByRole('button', { name: 'Effect' })).toBeDisabled()
    expect(screen.getByText(/no beam category/i)).toBeTruthy()
    // Where a beam chase *does* live, because "disabled" on its own teaches nobody.
    expect(screen.getByText(/recorded look/i)).toBeTruthy()
  })

  it('drops an effect draft when the family moves under it', () => {
    // The effect was chosen from the old family's category, so carrying it across would leave the
    // draft claiming a family its effect derives a different one from — which the server refuses.
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Effect' }))
    chooseEffect('Colour Pulse')
    expect(screen.getByText(/pulses between two colours/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Intensity' }))
    expect(screen.queryByText(/pulses between two colours/i)).toBeNull()
  })
})

describe('the effect branch', () => {
  it('offers only the family’s own category', () => {
    // The family is the filter, which is why there is no category step to repeat.
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Effect' }))
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'Colour Pulse' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Rainbow Cycle' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Sine Dim' })).toBeNull()
  })

  it('hides Fade, which an effect has no arrival to time', () => {
    renderEditor()
    expect(screen.getByLabelText(/fade/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Effect' }))
    expect(screen.queryByLabelText(/fade/i)).toBeNull()
  })
})

describe('validity and the save body', () => {
  it('needs a name and one of the two halves', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Effect' }))
    const create = screen.getByRole('button', { name: /create template/i })
    // A name with no effect is not enough, and an effect with no name is not either.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Amber Breathe' } })
    expect(create).toBeDisabled()
    chooseEffect('Colour Pulse')
    expect(create).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } })
    expect(create).toBeDisabled()
  })

  it('sends `effect` and no `rows`, stamped with the family’s usage master', async () => {
    // Never both halves: a body naming the other one is a 400 rather than a no-op. And the master
    // is stamped at authoring time — nothing resolves usage later, so an unstamped effect would
    // silently run on master 1 forever.
    const { onSave } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Effect' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Amber Breathe' } })
    chooseEffect('Colour Pulse')
    fireEvent.click(screen.getByRole('button', { name: /create template/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const body = (onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as TemplateInput
    expect(body.rows).toBeUndefined()
    expect(body.effect).toMatchObject({
      effectType: 'Colour Pulse',
      category: 'colour',
      propertyName: null,
      speedMasterUuid: 'master-2-uuid',
    })
    // Parameters seed from the effect's own declared defaults rather than arriving empty.
    expect(body.effect?.parameters).toEqual({ colourA: '#FF9D4A' })
    // An effect has no fade, and hiding the field has to clear the value rather than leave it.
    expect(body.fadeDurationMs).toBeNull()
  })

  it('sends `rows` and no `effect` for a value template', async () => {
    const { onSave } = renderEditor({ template: template() })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Warm Amber' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const body = (onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as TemplateInput
    expect(body.effect).toBeUndefined()
    expect(body.rows).toHaveLength(1)
  })
})

