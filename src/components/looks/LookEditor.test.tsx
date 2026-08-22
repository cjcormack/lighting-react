// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LookDetails } from '@/api/looksApi'

// The editor reaches the fixture, fixture-type and effect-library reads, and `lightingApi` opens a
// real WebSocket at import. Stubbing the store modules keeps the import graph away from both.
vi.mock('@/store/fixtureFx', () => ({
  useEffectLibraryQuery: () => ({ data: [] }),
  buildEffectLibraryLookup: () => new Map(),
}))
vi.mock('@/store/fixtures', () => ({
  useFixtureTypeListQuery: () => ({ data: [] }),
  useFixtureListQuery: () => ({ data: [] }),
}))
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())
// Stubbed rather than provided with a store: it exists to push a preview layer at the live desk,
// which is the one thing a seeding test must not do.
vi.mock('./LookLivePreview', () => ({ LookLivePreview: () => null }))

import { LookEditor } from './LookEditor'

function look(overrides: Partial<LookDetails> = {}): LookDetails {
  return {
    id: 7,
    uuid: 'u7',
    name: 'Warm Wash',
    notes: null,
    sortOrder: 0,
    families: ['COLOUR'],
    editorFixtureType: 'mh-spot',
    palette: [],
    rows: [],
    effects: [],
    layerCount: 0,
    refRowCount: 0,
    usedByCueIds: [],
    usedByCueNames: [],
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * `FU-FE-LOOK-SAVE-GUARD-TEST`.
 *
 * Both halves of one bug: the editor seeds its form from `look` **once per id**, so before the
 * detail fetch lands an existing Look renders as an empty *create* draft. Saving that PUTs
 * `rows: []`, which the backend reads as "clear them"; and when the detail arrives late the
 * re-seed silently discards anything typed, with `isDirty` reading false the whole time.
 */
describe('LookEditor while its detail is loading', () => {
  it('disables Save and says why', () => {
    render(
      <LookEditor
        open
        onOpenChange={vi.fn()}
        look={null}
        isLoading
        onSave={vi.fn()}
        isSaving={false}
      />,
    )
    expect(screen.getByText(/Loading this look/)).toBeInTheDocument()
    // Named "Create" because there is no `look` yet — which is exactly the misleading state this
    // guard exists for. What matters is that it cannot be pressed.
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('never calls onSave, even with a name typed', () => {
    const onSave = vi.fn()
    render(
      <LookEditor
        open
        onOpenChange={vi.fn()}
        look={null}
        isLoading
        onSave={onSave}
        isSaving={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('enables Save once the detail lands', () => {
    const { rerender } = render(
      <LookEditor open onOpenChange={vi.fn()} look={null} isLoading onSave={vi.fn()} isSaving={false} />,
    )
    rerender(
      <LookEditor
        open
        onOpenChange={vi.fn()}
        look={look()}
        isLoading={false}
        onSave={vi.fn()}
        isSaving={false}
      />,
    )
    expect(screen.queryByText(/Loading this look/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update' })).toBeEnabled()
    expect(screen.getByLabelText(/Name/)).toHaveValue('Warm Wash')
  })

  it('keeps a typed edit when the look refetches under it', () => {
    // The seed is keyed by **id**, not by object identity: `useLookQuery` hands back a fresh
    // object on every `Look` tag invalidation, and re-seeding on that would stomp the operator's
    // in-progress edit while `isDirty` still read false.
    const { rerender } = render(
      <LookEditor open onOpenChange={vi.fn()} look={look()} onSave={vi.fn()} isSaving={false} />,
    )
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Warm Wash 2' } })

    rerender(
      <LookEditor open onOpenChange={vi.fn()} look={look()} onSave={vi.fn()} isSaving={false} />,
    )

    expect(screen.getByLabelText(/Name/)).toHaveValue('Warm Wash 2')
  })

  it('is not gated when creating, where a null look is the normal state', () => {
    // Gating on the query alone rather than on "an existing look is being edited" would leave
    // New Look permanently loading.
    render(
      <LookEditor
        open
        onOpenChange={vi.fn()}
        look={null}
        isLoading={false}
        onSave={vi.fn()}
        isSaving={false}
        defaultEditorFixtureType="mh-spot"
      />,
    )
    expect(screen.queryByText(/Loading this look/)).not.toBeInTheDocument()
  })
})
