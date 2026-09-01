// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The busk view is the fourth live view, and that is nearly all this page is: the same header and
 * the same bar as the other three, from the same hook, over a body of its own.
 *
 * Two props it must **not** pass are what these assert, because getting either wrong is invisible
 * until a desk is running: `canOperate` would gate GO on this page alone (busking is the live use
 * — the plan's D9), and `showShortcuts` would advertise transport keys nothing here binds.
 */
const showBarProps = vi.fn()
vi.mock('@/components/ShowHeader', () => ({
  ShowHeader: ({ view }: { view: string }) => <div data-testid="header">{view}</div>,
}))
vi.mock('@/components/ShowBar', () => ({
  ShowBar: (props: Record<string, unknown>) => {
    showBarProps(props)
    return <div data-testid="show-bar" />
  },
}))
vi.mock('@/components/busking/BuskingView', () => ({
  BuskingView: () => <div data-testid="busking-view" />,
}))
const showBarOptions = vi.fn()
vi.mock('@/hooks/useShowBarProps', () => ({
  useShowBarProps: (_projectId: number, opts: Record<string, unknown> = {}) => {
    showBarOptions(opts)
    return {
      showBarProps: { goDisabled: false },
      showHeaderProps: { isShowActive: true, canStart: false, onStart: vi.fn(), onStop: vi.fn() },
    }
  },
}))
vi.mock('../store/projects', () => ({
  useCurrentProjectQuery: () => ({ data: { id: 1 }, isLoading: false }),
  useProjectQuery: () => ({ data: { id: 1, name: 'Hamlet' }, isLoading: false }),
}))
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import { ProjectBusk } from './Busk'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function draw(at = '/projects/1/busk') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/projects/:projectId/busk" element={<ProjectBusk />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProjectBusk', () => {
  it('is a live view: one header naming itself, one bar, one body', () => {
    draw()
    expect(screen.getByTestId('header')).toHaveTextContent('busk')
    expect(screen.getAllByTestId('show-bar')).toHaveLength(1)
    expect(screen.getByTestId('busking-view')).toBeInTheDocument()
  })

  it('does not gate the transport — GO works from a busk pad', () => {
    draw()
    expect(showBarOptions).toHaveBeenCalledWith(
      expect.not.objectContaining({ canOperate: expect.anything() }),
    )
    expect(showBarProps).toHaveBeenCalledWith(
      expect.not.objectContaining({ showShortcuts: expect.anything() }),
    )
  })

  /** Nothing here reads `transport`, so a running fade must not re-render the pad grid per frame. */
  it('opts out of frame-rate fade progress', () => {
    draw()
    expect(showBarOptions).toHaveBeenCalledWith(
      expect.objectContaining({ frameRateProgress: false }),
    )
  })
})
