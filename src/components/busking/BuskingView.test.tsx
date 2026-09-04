// @vitest-environment jsdom
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { DndContext } from '@dnd-kit/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { installRelativeUrlRequest } from '@/test/backendMock'

vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

// Everything here waits on a REST round trip through the mock's 1ms timer. The default 1s is
// tight when the whole suite runs in parallel and the event loop is saturated — these tests
// went flaky at it, and a longer ceiling costs nothing when they pass.
configure({ asyncUtilTimeout: 5000 })
// The band, the rail and the palette are tested in their own files; stubbing them keeps this one
// about the view's own decisions — which page is showing, and what first open does.
vi.mock('./TargetBand', () => ({ TargetBand: () => <div data-testid="target-band" /> }))
vi.mock('./BuskSpeedRail', () => ({ BuskSpeedRail: () => <div data-testid="speed-rail" /> }))
vi.mock('./LibraryPalette', () => ({ LibraryPalette: () => <div data-testid="palette" /> }))

import { store } from '@/store'
import { restApi } from '@/store/restApi'
import { BuskingView } from './BuskingView'
import type { BuskPage } from '@/api/buskApi'

const emptyPage: BuskPage = { id: 4, uuid: 'p4', name: 'Ballads', sortOrder: 0, rows: [] }
const second: BuskPage = { id: 5, uuid: 'p5', name: 'Dance', sortOrder: 1, rows: [] }

/** What the layout PUT answers with — the page as written, ids minted. */
const generated: BuskPage = {
  ...emptyPage,
  rows: [
    {
      columns: [
        {
          id: 11,
          uuid: 'c11',
          width: 3,
          banks: [{ id: 21, uuid: 'b21', name: 'Colour', solo: false, flow: 'WRAP', pads: [] }],
        },
      ],
    },
  ],
}

function draw(pages: BuskPage[], path = '/projects/1/busk') {
  const calls: { url: string; method: string }[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request
    calls.push({ url: request.url, method: request.method })
    const body = request.url.includes('/busk/pages') && request.method === 'GET' ? pages : []
    const created = request.method === 'POST' && request.url.endsWith('/busk/pages')
    const written = request.method === 'PUT' && request.url.includes('/layout')
    return new Response(JSON.stringify(created ? emptyPage : written ? generated : body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)

  const utils = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <DndContext>
          <BuskingView projectId={1} />
        </DndContext>
      </MemoryRouter>
    </Provider>,
  )
  return { ...utils, calls }
}

describe('the busk view', () => {
  beforeEach(() => {
    installRelativeUrlRequest()
    // jsdom has no matchMedia; the view asks it whether the narrow-width target sheet is needed.
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }),
    )
  })

  afterEach(() => {
    cleanup()
    store.dispatch(restApi.util.resetApiState())
    vi.unstubAllGlobals()
  })

  it('offers the two starting points when the project has no pages', async () => {
    draw([])
    expect(await screen.findByText('Start from your library')).toBeTruthy()
    expect(screen.getByText('Start empty')).toBeTruthy()
  })

  it('creates the page before writing the generated layout into it', async () => {
    const { calls } = draw([])
    fireEvent.click(await screen.findByText('Start from your library'))

    await waitFor(() => {
      const writes = calls.filter((c) => c.method !== 'GET')
      expect(writes).toHaveLength(2)
    })
    const writes = calls.filter((c) => c.method !== 'GET')
    // The layout write needs the id the create answers with, so the order is not incidental.
    expect(writes[0].method).toBe('POST')
    expect(writes[0].url.endsWith('/busk/pages')).toBe(true)
    expect(writes[1].method).toBe('PUT')
    expect(writes[1].url).toContain(`/busk/pages/${emptyPage.id}/layout`)
  })

  it('shows the generated layout without waiting for a socket frame', async () => {
    // The one layout write outside the commit queue: `saveBuskLayout` neither invalidates nor
    // patches on its own, so the generator has to seed the cache itself or the operator reads
    // "this page is empty" until an unrelated busk.layoutChanged happens along.
    draw([])
    fireEvent.click(await screen.findByText('Start from your library'))
    expect(await screen.findByText('Colour')).toBeTruthy()
  })

  it('shows the first page when the URL names none', async () => {
    draw([emptyPage, second])
    await screen.findByRole('button', { name: 'Ballads' })
    expect(screen.getByRole('button', { name: 'Ballads' }).getAttribute('aria-current')).toBe('page')
  })

  it('shows the page the URL names', async () => {
    draw([emptyPage, second], '/projects/1/busk?page=5')
    await screen.findByRole('button', { name: 'Dance' })
    expect(screen.getByRole('button', { name: 'Dance' }).getAttribute('aria-current')).toBe('page')
  })

  it('falls back to the first page when the URL names one that is gone', async () => {
    draw([emptyPage, second], '/projects/1/busk?page=999')
    await screen.findByRole('button', { name: 'Ballads' })
    expect(screen.getByRole('button', { name: 'Ballads' }).getAttribute('aria-current')).toBe('page')
  })

  it('swaps the speed rail for the library while editing, and puts it back', async () => {
    draw([emptyPage])
    // Wait for the page list, or the Edit layout button is still disabled on an empty project.
    await screen.findByRole('button', { name: 'Ballads' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }))
    expect(await screen.findByTestId('palette')).toBeTruthy()
    expect(screen.queryByTestId('speed-rail')).toBeNull()

    fireEvent.click(screen.getByText('Done'))
    expect(await screen.findByTestId('speed-rail')).toBeTruthy()
    expect(screen.queryByTestId('palette')).toBeNull()
  })

  it('asks before deleting a page, and sends nothing until it is confirmed', async () => {
    const { calls } = draw([emptyPage])
    await screen.findByRole('button', { name: 'Ballads' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }))
    // Radix's DropdownMenuTrigger opens on `pointerdown`, not `click`.
    fireEvent.pointerDown(await screen.findByLabelText('Options for Ballads'), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    fireEvent.click(await screen.findByText('Delete page'))

    // The dialog is up and nothing has been sent — this is the one edit-mode gesture with no undo.
    expect(await screen.findByText('Delete “Ballads”?')).toBeTruthy()
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1))
  })

  it('leaves edit mode when the view unmounts, so no other surface keeps drawing it', async () => {
    const { unmount } = draw([emptyPage])
    await screen.findByRole('button', { name: 'Ballads' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }))
    await waitFor(() => expect(store.getState().buskEdit.editing).toBe(true))
    unmount()
    expect(store.getState().buskEdit.editing).toBe(false)
  })
})
