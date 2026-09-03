// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The successor to `ProgrammerPane.test.tsx`.
 *
 * That suite mount-counted the three tab bodies, because Radix mounts only the active tab's content
 * and `useListSelection` clears its Redux scope on unmount — so glancing at the layer stack silently
 * discarded the fixture selection Record scopes on. The pane needed a `forceMount` escape hatch for
 * exactly that. Here there is nothing to force, and these assertions are what keeps it that way:
 * all three surfaces on screen at once, and the grid mounted exactly once.
 */
const gridMounts = vi.fn()
vi.mock('@/components/programmer/ProgrammerGrid', async () => {
  const { useEffect } = await import('react')
  return {
    ProgrammerGrid: () => {
      // In an effect, not in the render body: a re-render is fine and expected, a re-MOUNT is the
      // thing that would throw the selection away.
      useEffect(() => gridMounts(), [])
      return <div data-testid="grid" />
    },
  }
})
vi.mock('@/components/programmer/ProgrammerLookStack', () => ({
  ProgrammerLookStack: () => <div data-testid="layers" />,
}))
vi.mock('@/components/programmer/ProgrammerFxList', () => ({
  ProgrammerFxList: () => <div data-testid="fx" />,
}))
vi.mock('@/components/programmer/ProgrammerSourceStrip', () => ({
  ProgrammerSourceStrip: () => <div data-testid="source-strip" />,
}))
vi.mock('@/components/programmer/ProgrammerActionBar', () => ({
  ProgrammerActionBar: ({ sheetControls }: { sheetControls?: React.ReactNode }) => (
    <div data-testid="action-bar">{sheetControls}</div>
  ),
}))
vi.mock('@/components/programmer/ProgrammerSheets', () => ({
  ProgrammerSheetsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useProgrammerSheets: () => ({
    openRecord: vi.fn(),
    openRecordLook: vi.fn(),
    openInclude: vi.fn(),
    openUpdate: vi.fn(),
  }),
}))
vi.mock('@/components/ShowHeader', () => ({
  ShowHeader: ({ view }: { view: string }) => <div data-testid="header">{view}</div>,
}))
vi.mock('@/components/ShowBar', () => ({ ShowBar: () => <div data-testid="show-bar" /> }))
vi.mock('@/components/programmer/EditorContext', () => ({
  EditorContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/programmer/useInclude', () => ({
  useInclude: () => ({ includeCue: vi.fn() }),
}))
vi.mock('@/hooks/useShowBarProps', () => ({
  useShowBarProps: () => ({
    isShowActive: true,
    showBarProps: {},
    showHeaderProps: { isShowActive: true, canStart: false, onStart: vi.fn(), onStop: vi.fn() },
  }),
}))
vi.mock('@/store/programmer', () => ({
  useProgrammerSummaryQuery: () => ({ data: { blind: false, entryCount: 0, lastIncluded: null } }),
  useProgrammerLayersQuery: () => ({ data: [] }),
  useProgrammerRevision: () => 0,
  programmerClearAll: vi.fn(),
}))
vi.mock('@/store/projects', () => ({
  useCurrentProjectQuery: () => ({ data: { id: 1 }, isLoading: false }),
  useProjectQuery: () => ({ data: { id: 1, name: 'Hamlet' }, isLoading: false }),
}))
// `LookRowStoreProvider` is mounted unconditionally so the tree shape never changes with the
// scope — which means its queries run here even with nothing focused.
vi.mock('@/store/looks', () => ({
  useLookQuery: () => ({ data: undefined, isSuccess: false }),
  useSaveLookMutation: () => [vi.fn()],
}))
// Same reason as `@/store/looks` above, for `FocusedTemplateLayerProvider`: `skip` stops the
// *request*, not the hook, so the query still reaches for the store.
vi.mock('@/store/templates', () => ({ useTemplateListQuery: () => ({ data: [] }) }))
vi.mock('@/store/fixtures', () => ({ useFixtureListQuery: () => ({ data: [] }) }))
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import { ProgrammerPage } from './ProgrammerPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
})

function draw() {
  return render(
    <MemoryRouter initialEntries={['/projects/1/programmer']}>
      <Routes>
        <Route path="/projects/:projectId/programmer" element={<ProgrammerPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProgrammerPage', () => {
  it('shows values, layers and effects at once', () => {
    draw()
    expect(screen.getByTestId('grid')).toBeTruthy()
    expect(screen.getByTestId('layers')).toBeTruthy()
    expect(screen.getByTestId('fx')).toBeTruthy()
  })

  it('has no tabs at all', () => {
    // The three are readings of ONE live object. A switcher between them is the thing this view
    // exists to delete.
    draw()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('always names what is loaded, above the verbs that act on it', () => {
    draw()
    expect(screen.getByTestId('source-strip')).toBeTruthy()
    expect(screen.getByTestId('action-bar')).toBeTruthy()
  })

  it('mounts the value grid exactly once, across a state change elsewhere on the page', () => {
    // The load-bearing one. `useListSelection` clears its Redux scope on unmount, so anything that
    // remounts the grid — a tab, a collapse, a conditional — silently discards the fixture
    // selection Record and Record-look scope on. Toggling Groups is a real page-state change; the
    // grid must re-render through it, never remount.
    draw()
    expect(gridMounts).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTitle('Show group rows with their members'))
    expect(gridMounts).toHaveBeenCalledTimes(1)
  })

  it('mounts the value grid exactly once across a scope change', () => {
    // The same rule, for the thing session 2a adds. Switching Output/Local/one layer must be a
    // re-render of one grid, never a swap between per-scope grids — the moment it becomes a
    // conditional mount or a `key`, the fixture selection is silently gone.
    draw()
    expect(gridMounts).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Show the composed output'))
    fireEvent.click(screen.getByLabelText('Show only the values you set'))
    expect(gridMounts).toHaveBeenCalledTimes(1)
  })

  it('names what the grid is pointed at', () => {
    draw()
    // Local is the landing scope: the programmer opens on what you are about to busk, not on a
    // read-only view of the cook.
    expect(screen.getByLabelText('Show only the values you set')).toHaveAttribute(
      'data-state',
      'on',
    )
    fireEvent.click(screen.getByLabelText('Show the composed output'))
    expect(screen.getByLabelText('Show the composed output')).toHaveAttribute('data-state', 'on')
  })

  it('offers no layer segment while no layer is focused', () => {
    // Focusing happens on the stack row in the rail. A picker here would be a second way to say
    // the same thing, and this segment is a read-out of that choice.
    draw()
    expect(screen.queryByLabelText('Show the focused layer')).toBeNull()
  })
})
