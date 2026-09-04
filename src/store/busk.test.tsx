// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { type ReactNode } from 'react'
import { installRelativeUrlRequest, buskWs } from '@/test/backendMock'

vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { store } from './index'
import { restApi } from './restApi'
import { buskApi, resetBuskCommitState, useBuskLayoutCommit } from './busk'
import type { BuskLayoutRequest, BuskPage } from '@/api/buskApi'

/**
 * The busk layout's save loop.
 *
 * The headline behaviour is the one that is invisible until it breaks: the layout PUT answers with
 * the page **as written**, carrying the ids it minted, and the next gesture has to send them. A
 * queue that replayed pre-computed documents, or that patched the cache from an intermediate
 * response, would look right on the first drag and recreate every pad on the second.
 */

/** A layout PUT handler that mints ids for anything arriving without one, the way the server does. */
function makeBackend() {
  let nextId = 500
  const page: BuskPage = {
    id: 1,
    uuid: 'page-1',
    name: 'Ballads',
    sortOrder: 0,
    rows: [
      {
        columns: [
          {
            id: 10,
            uuid: 'c10',
            width: 12,
            banks: [
              {
                id: 20,
                uuid: 'b20',
                name: 'Movement',
                solo: false,
                flow: 'WRAP',
                pads: [{ id: 30, uuid: 'p30', kind: 'TEMPLATE', template: { id: 7 } as never }],
              },
            ],
          },
        ],
      },
    ],
  }

  const bodies: BuskLayoutRequest[] = []
  let failNext = false
  /** Set to hold every layout write open, so a second gesture can start while one is in flight. */
  let gate: Promise<void> | null = null
  let openGate: (() => void) | null = null

  function write(body: BuskLayoutRequest): BuskPage {
    bodies.push(body)
    return {
      ...page,
      rows: body.rows.map((row) => ({
        columns: row.columns.map((column) => ({
          id: column.columnId ?? nextId++,
          uuid: `c${column.columnId ?? nextId}`,
          width: column.width,
          banks: column.banks.map((bank) => ({
            id: bank.bankId ?? nextId++,
            uuid: `b${bank.bankId ?? nextId}`,
            name: bank.name,
            solo: bank.solo,
            flow: bank.flow,
            pads: bank.pads.map((pad) => ({
              id: pad.padId ?? nextId++,
              uuid: `p${pad.padId ?? nextId}`,
              kind: pad.templateId != null ? ('TEMPLATE' as const) : ('LOOK' as const),
              template: pad.templateId != null ? ({ id: pad.templateId } as never) : null,
              look: pad.lookId != null ? ({ id: pad.lookId } as never) : null,
            })),
          })),
        })),
      })),
    }
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request
    const url = request.url
    if (url.includes('/layout')) {
      if (failNext) {
        failNext = false
        return new Response(JSON.stringify({ error: 'nope', code: 'BUSK_LAYOUT_REF' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const body = (await request.json()) as BuskLayoutRequest
      const answer = write(body)
      if (gate != null) await gate
      return new Response(JSON.stringify(answer), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify([page]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  return {
    fetchMock,
    bodies,
    page,
    failNextWrite: () => (failNext = true),
    holdWrites: () => {
      gate = new Promise<void>((resolve) => (openGate = resolve))
    },
    releaseWrites: () => {
      openGate?.()
      gate = null
      openGate = null
    },
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>
}

/** Append a Look pad to the page's one bank. */
const addLook = (id: number) => (page: BuskPage) => ({
  ...page,
  rows: [
    {
      columns: [
        {
          ...page.rows[0].columns[0],
          banks: [
            {
              ...page.rows[0].columns[0].banks[0],
              pads: [
                ...page.rows[0].columns[0].banks[0].pads,
                { localKey: `new-${id}`, kind: 'LOOK' as const, look: { id } as never },
              ],
            },
          ],
        },
      ],
    },
  ],
})

function cachedPage(): BuskPage | undefined {
  return buskApi.endpoints.buskPages.select(1)(store.getState()).data?.[0]
}

describe('the busk layout save loop', () => {
  let backend: ReturnType<typeof makeBackend>

  beforeEach(async () => {
    installRelativeUrlRequest()
    backend = makeBackend()
    vi.stubGlobal('fetch', backend.fetchMock)
    resetBuskCommitState()
    await store.dispatch(buskApi.endpoints.buskPages.initiate(1))
  })

  afterEach(() => {
    store.dispatch(restApi.util.resetApiState())
    resetBuskCommitState()
    vi.unstubAllGlobals()
  })

  it('sends the whole page and patches the cache from the response', async () => {
    const { result } = renderHook(() => useBuskLayoutCommit(1, 1), { wrapper })

    result.current((page) => ({
      ...page,
      rows: [
        {
          columns: [
            {
              ...page.rows[0].columns[0],
              banks: [
                {
                  ...page.rows[0].columns[0].banks[0],
                  pads: [
                    ...page.rows[0].columns[0].banks[0].pads,
                    { localKey: 'new-1', kind: 'LOOK', look: { id: 42 } as never },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }))

    await waitFor(() => expect(backend.bodies).toHaveLength(1))
    // The existing pad went out with its id; the new one without, so the server creates it.
    expect(backend.bodies[0].rows[0].columns[0].banks[0].pads).toEqual([
      { padId: 30, templateId: 7 },
      { lookId: 42 },
    ])
    await waitFor(() => expect(cachedPage()!.rows[0].columns[0].banks[0].pads).toHaveLength(2))
    // Patched from the response, so the minted id is now in the cache.
    expect(cachedPage()!.rows[0].columns[0].banks[0].pads[1].id).toBeGreaterThan(0)
  })

  it('builds the second gesture on the first response, so a minted pad is never recreated', async () => {
    const { result } = renderHook(() => useBuskLayoutCommit(1, 1), { wrapper })

    // Both gestures before either round trip settles — the overlapping case.
    result.current(addLook(42))
    result.current(addLook(43))

    await waitFor(() => expect(backend.bodies).toHaveLength(2))
    const second = backend.bodies[1].rows[0].columns[0].banks[0].pads
    expect(second).toHaveLength(3)
    // The pad the first write minted comes back by id, not as a fresh creation.
    expect(second[1].padId).toBeGreaterThan(0)
    expect(second[1].lookId).toBe(42)
    expect(second[2]).toEqual({ lookId: 43 })

    await waitFor(() => expect(cachedPage()!.rows[0].columns[0].banks[0].pads).toHaveLength(3))
  })

  it('keeps one queue per page across a tab switch made while a save is in flight', async () => {
    // The cleanup fires on an ordinary page-tab switch, not just a route change. Removing a queue
    // that is still draining does not stop it — it holds its own object — so a second queue for the
    // same page would race it through the shared savingPages/settledAt globals and patch the cache
    // with a stale document.
    const { result, rerender } = renderHook(({ pageId }) => useBuskLayoutCommit(1, pageId), {
      wrapper,
      initialProps: { pageId: 1 as number | null },
    })

    // The write is held open, so the switch genuinely happens mid-flight — which is the whole
    // point. Let it land first and the two queues never overlap, and the bug hides.
    backend.holdWrites()
    result.current(addLook(42))
    await waitFor(() => expect(backend.bodies).toHaveLength(1))

    rerender({ pageId: 2 })
    rerender({ pageId: 1 })
    result.current(addLook(43))

    backend.releaseWrites()
    await waitFor(() => expect(backend.bodies).toHaveLength(2))

    // The second gesture is queued behind the first and built on what it minted. A second queue
    // would have seeded itself from the cache as it stood before the first write answered, and sent
    // two pads instead of three — recreating the pad the first gesture had just created.
    const pads = backend.bodies[1].rows[0].columns[0].banks[0].pads
    expect(pads).toHaveLength(3)
    expect(pads[1].padId).toBeGreaterThan(0)
    expect(pads[1].lookId).toBe(42)
  })

  it('drops the queue and restores the last confirmed page when a write fails', async () => {
    const { result } = renderHook(() => useBuskLayoutCommit(1, 1), { wrapper })
    backend.failNextWrite()

    result.current((page) => ({ ...page, rows: [] }))

    await waitFor(() => expect(cachedPage()!.rows).toHaveLength(1))
    expect(cachedPage()!.rows[0].columns[0].banks[0].name).toBe('Movement')
  })
})

describe('the busk.layoutChanged bridge', () => {
  let backend: ReturnType<typeof makeBackend>

  beforeEach(async () => {
    installRelativeUrlRequest()
    backend = makeBackend()
    vi.stubGlobal('fetch', backend.fetchMock)
    resetBuskCommitState()
    await store.dispatch(buskApi.endpoints.buskPages.initiate(1))
  })

  afterEach(() => {
    store.dispatch(restApi.util.resetApiState())
    resetBuskCommitState()
    vi.unstubAllGlobals()
  })

  function pageReads(): number {
    return backend.fetchMock.mock.calls.filter(
      (call) => !(call[0] as Request).url.includes('/layout'),
    ).length
  }

  it('re-reads a page another client changed', async () => {
    const before = pageReads()
    buskWs.callback!([1])
    await waitFor(() => expect(pageReads()).toBe(before + 1))
  })

  it('invalidates nothing for a page this cache has never seen', async () => {
    const before = pageReads()
    buskWs.callback!([99])
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pageReads()).toBe(before)
  })

  it('swallows the echo of our own write, and only for a single page', async () => {
    const { result } = renderHook(() => useBuskLayoutCommit(1, 1), { wrapper })
    result.current((page) => ({ ...page, rows: page.rows }))

    const before = pageReads()
    // The frame the server sends for our own write, while it is still in flight.
    buskWs.callback!([1])
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pageReads()).toBe(before)

    // A multi-id frame is page CRUD or a reorder — never a layout write, so never ours to swallow.
    buskWs.callback!([1, 2])
    await waitFor(() => expect(pageReads()).toBeGreaterThan(before))
  })
})
