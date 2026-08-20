// @vitest-environment jsdom
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// The store slices this component pulls in subscribe to lightingApi at module load, which opens
// a real WebSocket — jsdom has none.
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import { PaletteRefPresetAssignmentsBanner } from './PaletteRefPresetAssignmentsBanner'
import { store } from '@/store'
import type { FxPresetPropertyAssignment } from '@/api/fxPresetsApi'

const REF = 'ref:11111111-2222-3333-4444-555555555555'

function renderBanner(
  assignments: FxPresetPropertyAssignment[],
  blockedReason: string | null = null,
) {
  return render(
    <Provider store={store}>
      <PaletteRefPresetAssignmentsBanner
        projectId={1}
        presetId={7}
        presetName="warm-pulse"
        assignments={assignments}
        blockedReason={blockedReason}
        onHardened={() => {}}
      />
    </Provider>,
  )
}

describe('PaletteRefPresetAssignmentsBanner', () => {
  afterEach(cleanup)

  it('stays out of the way when no row references a palette', () => {
    const { container } = renderBanner([{ propertyName: 'dimmer', value: '200' }])
    expect(container.textContent).toBe('')
  })

  it('counts only the referencing rows and names their properties', () => {
    renderBanner([
      { propertyName: 'dimmer', value: '200' },
      { propertyName: 'colour', value: REF },
      { propertyName: 'uv', value: REF },
    ])
    expect(screen.getByText(/2 rows reference a palette/)).toBeTruthy()
    expect(screen.getByText(/colour, uv/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Make hard' }).hasAttribute('disabled')).toBe(false)
  })

  it('singularises one row', () => {
    renderBanner([{ propertyName: 'colour', value: REF }])
    expect(screen.getByText(/1 row references a palette/)).toBeTruthy()
  })

  it('disables Make hard while the draft is dirty, and says why', () => {
    renderBanner([{ propertyName: 'colour', value: REF }], 'Save or discard your changes first.')
    expect(screen.getByRole('button', { name: 'Make hard' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Save or discard your changes first.')).toBeTruthy()
  })
})
