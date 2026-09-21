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
// `useWindowName` is mocked *subscribably*, not as a constant read: the announce effect is keyed
// on the name, so a plain `() => identity.name` would never re-run it and the rename case below
// could only assert that `renameWindow` was called — not the re-announce its title claims.
vi.mock('@/lib/windowIdentity', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    windowId: () => 'w-1',
    launchImmersive: () => null,
    windowName: () => identity.name,
    useWindowName: () => useSyncExternalStore(identity.subscribe, () => identity.name),
    renameWindow: (next: string) => {
      identity.renamed.push(next)
      identity.name = next
      for (const fn of [...identity.listeners]) fn()
      return true
    },
  }
})
const identity = {
  name: 'Screen 1',
  renamed: [] as string[],
  listeners: new Set<() => void>(),
  subscribe: (fn: () => void) => {
    identity.listeners.add(fn)
    return () => {
      identity.listeners.delete(fn)
    }
  },
}

const toasts: unknown[] = []
vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => toasts.push(args), { error: (...args: unknown[]) => toasts.push(args) }),
}))

import { resetDeskFollowStores, unlinkFromDesk } from '@/lib/deskFollow'
import { getFullscreenState, resetFullscreenState } from '@/lib/fullscreen'
import { resetUnsavedSheets, setSheetUnsaved } from '@/lib/unsavedSheets'
import { getBuskFocus, getBuskSheet, resetBuskWindowStores, setBuskFocus, setBuskSheet } from '@/lib/buskWindow'
import { resetBuskPageFollowStores } from '@/lib/buskPageFollow'
import { isImmersive, resetImmersiveStore, setImmersive } from '@/lib/immersive'
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
  viewOptions: null,
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
  identity.listeners.clear()
  window.sessionStorage.clear()
  resetDeskFollowStores()
  resetFullscreenState()
  resetUnsavedSheets()
  resetBuskWindowStores()
  vi.unstubAllGlobals()
  resetBuskPageFollowStores()
  resetImmersiveStore()
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
  it('goes out on mount with the five keys plus viewOptions on a live view, and again on a route change', async () => {
    const view = mountBridge()
    await waitFor(() => expect(windowsWs.announced).toHaveLength(1))
    // On the programmer the sixth key carries `immersive` alone (busk-chrome plan D9).
    expect(windowsWs.announced[0]).toEqual({
      windowId: 'w-1',
      name: 'Screen 1',
      view: '/projects/1/programmer',
      fullscreen: false,
      follows: true,
      viewOptions: { immersive: 'off' },
    })
    expect(Object.keys(windowsWs.announced[0] as object).sort()).toEqual(['follows', 'fullscreen', 'name', 'view', 'viewOptions', 'windowId'])

    act(() => {
      view.getByText('go busk').click()
    })
    await waitFor(() => expect(windowsWs.announced).toHaveLength(2))
    expect(windowsWs.announced[1]).toMatchObject({ view: '/projects/1/busk' })
    // On the busk view the same key carries the busk facts beside it.
    expect(Object.keys(windowsWs.announced[1] as object).sort()).toEqual(['follows', 'fullscreen', 'name', 'view', 'viewOptions', 'windowId'])
    expect((windowsWs.announced[1] as { viewOptions: Record<string, string> }).viewOptions).toEqual({
      focus: 'split',
      rigRows: '2',
      sheet: 'none',
      pageFollows: 'true',
      immersive: 'off',
    })
  })

  it('re-announces when immersive flips, under whichever live view the window is on', async () => {
    mountBridge('/projects/1/prompt-book')
    await waitFor(() => expect(windowsWs.announced).toHaveLength(1))
    expect((windowsWs.announced[0] as { viewOptions: Record<string, string> }).viewOptions).toEqual({ immersive: 'off' })
    act(() => setImmersive(true))
    await waitFor(() => expect(windowsWs.announced).toHaveLength(2))
    expect((windowsWs.announced[1] as { viewOptions: Record<string, string> }).viewOptions).toEqual({ immersive: 'on' })
  })

  it('re-announces when a busk fact moves, and not when one moves on another view', async () => {
    mountBridge('/projects/1/busk')
    await waitFor(() => expect(windowsWs.announced).toHaveLength(1))
    act(() => setBuskFocus('pads'))
    await waitFor(() => expect(windowsWs.announced).toHaveLength(2))
    expect((windowsWs.announced[1] as { viewOptions: Record<string, string> }).viewOptions).toMatchObject({ focus: 'pads' })
  })

  it('keeps the five-key frame on a view that contributes no options — a library', async () => {
    mountBridge('/projects/1/looks')
    await waitFor(() => expect(windowsWs.announced).toHaveLength(1))
    expect(Object.keys(windowsWs.announced[0] as object)).not.toContain('viewOptions')
    act(() => setBuskFocus('pads'))
    act(() => setImmersive(true))
    // A fact the announce does not carry cannot re-announce it.
    await new Promise((r) => setTimeout(r, 20))
    expect(windowsWs.announced).toHaveLength(1)
  })

  it('does not re-announce a busk fact from another live view', async () => {
    mountBridge('/projects/1/prompt-book')
    await waitFor(() => expect(windowsWs.announced).toHaveLength(1))
    act(() => setBuskFocus('pads'))
    await new Promise((r) => setTimeout(r, 20))
    expect(windowsWs.announced).toHaveLength(1)
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
  const ctx = (currentView = '/projects/1/programmer') => ({ myRowId: 's-1', currentView, navigate: vi.fn(), unsaved: () => false, rename: vi.fn(), exit: vi.fn(), askToReturn: vi.fn() })

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
    const c = { myRowId: 's-1', currentView: '/projects/1/programmer', navigate: vi.fn() }
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

  it('applies viewOptions only while showing the view the frame names', () => {
    const busk = { type: 'viewOptions' as const, targetId: 's-1', view: '/projects/1/busk', options: { focus: 'rig' } }
    // On the Prompt Book a busk frame is ignored: the window would otherwise store a fact for a
    // view it is not showing.
    expect(handleWindowCommand(busk, ctx('/projects/1/prompt-book'))).toBe('ignored')
    expect(getBuskFocus()).toBe('split')
    // Another window's busk frame is not this window's.
    expect(handleWindowCommand({ ...busk, targetId: 's-2' }, ctx('/projects/1/busk'))).toBe('ignored')
    expect(handleWindowCommand(busk, ctx('/projects/1/busk'))).toBe('applied')
    expect(getBuskFocus()).toBe('rig')
    // A view that contributes nothing applies nothing, even addressed correctly.
    expect(handleWindowCommand({ ...busk, view: '/projects/1/looks' }, ctx('/projects/1/looks'))).toBe('ignored')
  })

  it('applies immersive on any of the four live views, and a busk key on none but busk (busk-chrome D9)', () => {
    const frame = (view: string, options: Record<string, string>) => ({ type: 'viewOptions' as const, targetId: 's-1', view, options })
    expect(handleWindowCommand(frame('/projects/1/prompt-book', { immersive: 'on' }), ctx('/projects/1/prompt-book'))).toBe('applied')
    expect(isImmersive()).toBe(true)
    expect(handleWindowCommand(frame('/projects/1/show', { immersive: 'off' }), ctx('/projects/1/show'))).toBe('applied')
    expect(isImmersive()).toBe(false)
    // The per-view gate still holds for it: a Show frame arriving on the Prompt Book is ignored.
    expect(handleWindowCommand(frame('/projects/1/show', { immersive: 'on' }), ctx('/projects/1/prompt-book'))).toBe('ignored')
    expect(isImmersive()).toBe(false)
    // A busk key on the Prompt Book: the frame is taken (the view contributes) but the key is not.
    expect(handleWindowCommand(frame('/projects/1/prompt-book', { focus: 'rig' }), ctx('/projects/1/prompt-book'))).toBe('applied')
    expect(getBuskFocus()).toBe('split')
    // Both at once on busk.
    expect(handleWindowCommand(frame('/projects/1/busk', { focus: 'rig', immersive: 'on' }), ctx('/projects/1/busk'))).toBe('applied')
    expect(getBuskFocus()).toBe('rig')
    expect(isImmersive()).toBe(true)
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
    await waitFor(() => expect(windowsWs.announced).toHaveLength(1))
    act(() => {
      windowsWs.command({ type: 'rename', targetId: 's-1', name: 'Desk left' })
    })
    expect(identity.renamed).toEqual(['Desk left'])
    // The rename is not applied server-side: this tab renames itself and the announce effect —
    // keyed on the name — carries it back. That round trip is what makes the new name survive
    // this tab's reload, so it is the half worth asserting.
    await waitFor(() => expect(windowsWs.announced).toHaveLength(2))
    expect(windowsWs.announced[1]).toMatchObject({ name: 'Desk left' })
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

  it('flips the sheet on {sheet: toggle} aimed at this row on the busk view, and re-announces', async () => {
    windowsWs.last = [row('s-1', 'w-1', 'Screen 1', '/projects/1/busk')]
    // A desk window: jsdom has no matchMedia, which the busk surface reads as below `md` — and
    // there the toggle unfolds onto Colour, since the overlay offers no Speed tab. The bridge is
    // what this test is about, so it states the board.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.startsWith('(min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }))
    setBuskSheet('speed')
    mountBridge('/projects/1/busk')
    await waitFor(() => expect(windowsWs.commandCallback).not.toBeNull())
    await waitFor(() => expect(windowsWs.announced).toHaveLength(1))
    act(() => {
      windowsWs.command({ type: 'viewOptions', targetId: 's-1', view: '/projects/1/busk', options: { sheet: 'toggle' } })
    })
    expect(getBuskSheet()).toBe('none')
    await waitFor(() => expect(windowsWs.announced).toHaveLength(2))
    expect((windowsWs.announced[1] as { viewOptions: Record<string, string> }).viewOptions).toMatchObject({ sheet: 'none' })
    act(() => {
      windowsWs.command({ type: 'viewOptions', targetId: 's-1', view: '/projects/1/busk', options: { sheet: 'toggle' } })
    })
    expect(getBuskSheet()).toBe('speed')
  })

  it('applies a focus arm after a show that moved it onto the busk view — two frames in a row', async () => {
    windowsWs.last = [row('s-1', 'w-1', 'Screen 1')]
    const view = mountBridge()
    await waitFor(() => expect(windowsWs.commandCallback).not.toBeNull())
    act(() => {
      windowsWs.command({ type: 'show', targetId: 's-1', view: '/projects/1/busk' })
    })
    await waitFor(() => expect(view.getByTestId('path')).toHaveTextContent('/projects/1/busk'))
    act(() => {
      windowsWs.command({ type: 'viewOptions', targetId: 's-1', view: '/projects/1/busk', options: { focus: 'pads' } })
    })
    expect(getBuskFocus()).toBe('pads')
  })
})
