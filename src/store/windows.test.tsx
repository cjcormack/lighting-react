// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { windowsWs } from '@/test/backendMock'

// lightingApi opens a real WebSocket at import time (jsdom has none). The mock's `windows`
// namespace remembers the subscriber and every announce.
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())
vi.mock('@/lib/windowIdentity', () => ({
  windowId: () => 'w-1',
  windowName: () => identity.name,
  useWindowName: () => identity.name,
  renameWindow: (next: string) => {
    identity.renamed.push(next)
    return true
  },
}))
const identity = { name: 'Screen 1', renamed: [] as string[] }

const toasts: unknown[] = []
vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => toasts.push(args), { error: (...args: unknown[]) => toasts.push(args) }),
}))

import { resetDeskFollowStores, unlinkFromDesk } from '@/lib/deskFollow'
import { getFullscreenState, resetFullscreenState } from '@/lib/fullscreen'
import { resetUnsavedSheets, setSheetUnsaved } from '@/lib/unsavedSheets'
import { store } from './index'
import { restApi } from './restApi'
import { thisWindowRow, useDeskWindows, useThisWindow } from './windows'
import { handleWindowCommand, useWindowsBridge } from '@/components/screens/useWindowsBridge'
import type { DeskWindow } from '@/api/windowsApi'

/**
 * The windows registry's cache entry and the bridge hook (multi-screen plan §3.4, D9, D11): the
 * announce on every change the router or the tab makes; the commands acted on only by the window
 * whose row id they name, this window's own rebroadcasts included; the guarded decline.
 */
const row = (id: string, windowId: string, name: string, view = '/projects/1/programmer'): DeskWindow => ({
  id,
  windowId,
  name,
  view,
  fullscreen: false,
  follows: true,
  user: null,
})

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>
}

beforeEach(() => {
  windowsWs.reset()
  store.dispatch(restApi.util.resetApiState())
})

afterEach(() => {
  toasts.length = 0
  identity.renamed.length = 0
  identity.name = 'Screen 1'
  window.sessionStorage.clear()
  resetDeskFollowStores()
  resetFullscreenState()
  resetUnsavedSheets()
})

describe('the cache entry', () => {
  it('seeds from the connect snapshot and follows every state frame', async () => {
    windowsWs.last = [row('s-1', 'w-1', 'Screen 1')]
    const { result } = renderHook(() => useDeskWindows(), { wrapper })
    await waitFor(() => expect(result.current).toHaveLength(1))

    act(() => {
      windowsWs.fire([row('s-1', 'w-1', 'Screen 1'), row('s-2', 'w-2', 'Screen 2')])
    })
    await waitFor(() => expect(result.current.map((w) => w.id)).toEqual(['s-1', 's-2']))
  })

  it('finds this window by windowId, first match, and null before the announce landed', async () => {
    expect(thisWindowRow([row('s-2', 'w-2', 'Screen 2')], 'w-1')).toBeNull()
    expect(thisWindowRow([row('s-2', 'w-2', 'Screen 2'), row('s-1', 'w-1', 'Screen 1'), row('s-3', 'w-1', 'Twin')], 'w-1')?.id).toBe('s-1')

    windowsWs.last = [row('s-9', 'w-1', 'Screen 1')]
    const { result } = renderHook(() => useThisWindow(), { wrapper })
    await waitFor(() => expect(result.current?.id).toBe('s-9'))
  })
})

function Probe() {
  useWindowsBridge()
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <span data-testid="path">{location.pathname}</span>
      <button onClick={() => navigate('/projects/1/busk')}>go busk</button>
    </>
  )
}

function mountBridge(initialPath = '/projects/1/programmer') {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('the announce', () => {
  it('goes out on mount with exactly the five keys, and again on a route change', async () => {
    const view = mountBridge()
    await waitFor(() => expect(windowsWs.announced).toHaveLength(1))
    expect(windowsWs.announced[0]).toEqual({
      windowId: 'w-1',
      name: 'Screen 1',
      view: '/projects/1/programmer',
      fullscreen: false,
      follows: true,
    })
    expect(Object.keys(windowsWs.announced[0] as object).sort()).toEqual(['follows', 'fullscreen', 'name', 'view', 'windowId'])

    act(() => {
      view.getByText('go busk').click()
    })
    await waitFor(() => expect(windowsWs.announced).toHaveLength(2))
    expect(windowsWs.announced[1]).toMatchObject({ view: '/projects/1/busk' })
  })

  it('re-announces when the tab unlinks from the desk, reporting follows: false', async () => {
    mountBridge()
    await waitFor(() => expect(windowsWs.announced).toHaveLength(1))
    act(() => {
      unlinkFromDesk({ targets: [], families: null })
    })
    await waitFor(() => expect(windowsWs.announced).toHaveLength(2))
    expect(windowsWs.announced[1]).toMatchObject({ follows: false })
  })
})

describe('handleWindowCommand', () => {
  const ctx = () => ({ myRowId: 's-1', navigate: vi.fn(), unsaved: () => false, rename: vi.fn(), exit: vi.fn(), askToReturn: vi.fn() })

  it('ignores a show aimed at another row — including this window’s own rebroadcast', () => {
    const c = ctx()
    // This window sent `show s-2`; the desk rebroadcasts it to everyone, this window included.
    expect(handleWindowCommand({ type: 'show', targetId: 's-2', view: '/projects/1/busk' }, c)).toBe('ignored')
    expect(c.navigate).not.toHaveBeenCalled()
  })

  it('ignores every command before this window has a row', () => {
    const c = { ...ctx(), myRowId: null }
    expect(handleWindowCommand({ type: 'rename', targetId: 's-1', name: 'X' }, c)).toBe('ignored')
    expect(c.rename).not.toHaveBeenCalled()
  })

  it('navigates on a show aimed at this row', () => {
    const c = ctx()
    expect(handleWindowCommand({ type: 'show', targetId: 's-1', view: '/projects/1/busk' }, c)).toBe('navigated')
    expect(c.navigate).toHaveBeenCalledWith('/projects/1/busk')
  })

  it('declines a show while a sheet holds unsaved work, and toasts with a button that goes', () => {
    const c = { ...ctx(), unsaved: () => true }
    expect(handleWindowCommand({ type: 'show', targetId: 's-1', view: '/projects/1/busk' }, c)).toBe('declined')
    expect(c.navigate).not.toHaveBeenCalled()
    expect(toasts).toHaveLength(1)
    const [message, options] = toasts[0] as [string, { action: { label: string; onClick: () => void }; className: string }]
    expect(message).toBe('Another window asked to show Busk — you have unsaved changes')
    expect(options.action.label).toBe('Go to Busk')
    expect((toasts[0] as [string, { className: string }])[1].className).toBe('pointer-events-auto')
    options.action.onClick()
    expect(c.navigate).toHaveBeenCalledWith('/projects/1/busk')
  })

  it('reads the real dirty-sheet count when no seam is given', () => {
    const c = { myRowId: 's-1', navigate: vi.fn() }
    setSheetUnsaved(Symbol('editor'), true)
    expect(handleWindowCommand({ type: 'show', targetId: 's-1', view: '/projects/1/busk' }, c)).toBe('declined')
    resetUnsavedSheets()
    expect(handleWindowCommand({ type: 'show', targetId: 's-1', view: '/projects/1/busk' }, c)).toBe('navigated')
  })

  it('renames this window locally on a rename aimed at it — the target applies it, not the desk', () => {
    const c = ctx()
    expect(handleWindowCommand({ type: 'rename', targetId: 's-1', name: 'Screen 2' }, c)).toBe('renamed')
    expect(c.rename).toHaveBeenCalledWith('Screen 2')
  })

  it('exits full screen on {on:false} and only raises the banner on {on:true}', () => {
    const c = ctx()
    expect(handleWindowCommand({ type: 'fullscreen', targetId: 's-1', on: false }, c)).toBe('exited')
    expect(c.exit).toHaveBeenCalledTimes(1)
    expect(handleWindowCommand({ type: 'fullscreen', targetId: 's-1', on: true }, c)).toBe('asked')
    expect(c.askToReturn).toHaveBeenCalledTimes(1)
    expect(c.exit).toHaveBeenCalledTimes(1)
  })
})

describe('the mounted bridge', () => {
  it('navigates this window on a rebroadcast show that names its row, and not another’s', async () => {
    windowsWs.last = [row('s-1', 'w-1', 'Screen 1'), row('s-2', 'w-2', 'Screen 2')]
    const view = mountBridge()
    await waitFor(() => expect(windowsWs.commandCallback).not.toBeNull())

    act(() => {
      windowsWs.command({ type: 'show', targetId: 's-2', view: '/projects/1/busk' })
    })
    expect(view.getByTestId('path')).toHaveTextContent('/projects/1/programmer')

    act(() => {
      windowsWs.command({ type: 'show', targetId: 's-1', view: '/projects/1/busk' })
    })
    await waitFor(() => expect(view.getByTestId('path')).toHaveTextContent('/projects/1/busk'))
  })

  it('applies a rename to itself and re-announces under the new name', async () => {
    windowsWs.last = [row('s-1', 'w-1', 'Screen 1')]
    mountBridge()
    await waitFor(() => expect(windowsWs.commandCallback).not.toBeNull())
    act(() => {
      windowsWs.command({ type: 'rename', targetId: 's-1', name: 'Desk left' })
    })
    expect(identity.renamed).toEqual(['Desk left'])
  })

  it('exits full screen on {on:false} and raises the banner on {on:true}', async () => {
    windowsWs.last = [row('s-1', 'w-1', 'Screen 1')]
    const exit = vi.fn(async () => {})
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.documentElement })
    document.exitFullscreen = exit
    mountBridge()
    await waitFor(() => expect(windowsWs.commandCallback).not.toBeNull())
    act(() => {
      windowsWs.command({ type: 'fullscreen', targetId: 's-1', on: false })
    })
    await waitFor(() => expect(exit).toHaveBeenCalledTimes(1))

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null })
    resetFullscreenState()
    act(() => {
      windowsWs.command({ type: 'fullscreen', targetId: 's-1', on: true })
    })
    expect(getFullscreenState().wanted).toBe(true)
    expect(exit).toHaveBeenCalledTimes(1)
  })
})
