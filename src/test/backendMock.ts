import { vi } from "vitest"
import type { BootStatus } from "@/api/bootStatusWsApi"

// Shared test helpers for driving the boot-status RTK Query endpoint under
// vitest's jsdom environment. Not a test file (no `.test` suffix), so it isn't
// collected as a suite.

// RTK Query builds `new Request(joinUrls(baseUrl, path))` from restApi's
// relative baseUrl ('/api/rest'). Under jsdom the global Request is still
// undici's, which rejects root-relative URLs ("Failed to parse URL"). Resolve
// them against a dummy origin, preserving the real Request otherwise (headers,
// method, and — crucially — the abort signal). Call inside beforeEach; a
// matching vi.unstubAllGlobals() in afterEach restores the original.
export function installRelativeUrlRequest(): void {
  const RealRequest = globalThis.Request
  class BaseAwareRequest extends RealRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === "string" && input.startsWith("/")) {
        input = "http://localhost" + input
      }
      super(input, init)
    }
  }
  vi.stubGlobal("Request", BaseAwareRequest)
}

// A fetch mock answering GET /api/rest/status with whatever `getStatus()`
// currently returns. It resolves on a 1ms timer and honours the abort signal
// (RTK carries it on the Request object it passes as fetch's sole argument) —
// an instantly-resolving mock races RTK Query's abort handling under React
// StrictMode and spins into a refetch loop. Returns the vi.fn for call-count
// assertions.
export function installBootStatusFetch(getStatus: () => BootStatus) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException("Aborted", "AbortError"))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort)
        resolve(
          new Response(JSON.stringify(getStatus()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }, 1)
      if (signal) {
        if (signal.aborted) onAbort()
        else signal.addEventListener("abort", onAbort)
      }
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

// A non-2xx response, for testing failure paths. Wrap a route's value in
// `failWith(...)` instead of giving it a plain body.
const MOCK_STATUS = Symbol("mockStatus")
interface MockFailure {
  [MOCK_STATUS]: number
  body: unknown
}

export function failWith(status: number, body: unknown = { message: "mock failure" }): unknown {
  return { [MOCK_STATUS]: status, body } satisfies MockFailure
}

function asFailure(v: unknown): MockFailure | null {
  return typeof v === "object" && v !== null && MOCK_STATUS in v ? (v as MockFailure) : null
}

// A fetch mock that routes requests to canned JSON by URL substring, resolving
// on a 1ms timer and honouring the abort signal (see installBootStatusFetch for
// why). `routes` maps a URL substring → the JSON body to return; unmatched URLs
// get `{}`. Wrap a value in `failWith(status, body)` to return an error instead.
// Returns the vi.fn so tests can assert on `.mock.calls`.
export function installRecordingFetch(routes: Record<string, unknown> = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    const match = Object.keys(routes).find((k) => url.includes(k))
    const matched = match ? routes[match] : {}
    const failure = asFailure(matched)
    const body = failure ? failure.body : matched
    const status = failure ? failure[MOCK_STATUS] : 200
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException("Aborted", "AbortError"))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort)
        resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }, 1)
      if (signal) {
        if (signal.aborted) onAbort()
        else signal.addEventListener("abort", onAbort)
      }
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

// lightingApi opens a real WebSocket at import time, which jsdom lacks. These
// two exports replace it and capture the bootStatus WS-bridge callback that
// store/bootStatus.ts subscribes at import, so a test can fire a synthetic
// notification. Used from a `vi.mock("@/api/lightingApi", ...)` factory; vitest
// isolates modules per test file, so `bootStatusWs` is a fresh holder per file.
export const bootStatusWs: { callback: null | (() => void) } = { callback: null }

// Program-state WS bridge callback captured from store/cueStacks.ts, so a test
// can fire a synthetic `showChanged` notification.
export const programStateWs: { callback: null | ((e: unknown) => void) } = { callback: null }

// Run-state WS bridge callback captured from store/cueStacks.ts, so a test can fire a synthetic
// `cueRunStateChanged` frame — the desk (or another browser) moving the show.
export const cueRunStateWs: { callback: null | ((e: unknown) => void) } = { callback: null }

// Patch-list WS bridge callback captured from store/patches.ts, so a test can
// fire a synthetic `patchListChanged` and assert on invalidation batching.
export const patchesWs: { callback: null | (() => void) } = { callback: null }

// Unauthenticated-socket (close code 4401) bridge callback captured from
// store/auth.ts, so a test can fire a synthetic session rejection.
export const authWs: { callback: null | (() => void) } = { callback: null }

// Own-account-changed bridge callback captured from store/auth.ts. Separate from `authWs`
// because the two mean opposite things — a revoked session vs. a still-valid session whose
// account was edited elsewhere — and a test needs to fire one without the other.
export const ownAccountWs: { callback: null | (() => void) } = { callback: null }

// User-list bridge callback captured from store/users.ts, so a test can fire a synthetic
// `userListChanged`.
export const usersWs: { callback: null | (() => void) } = { callback: null }

// Install-row bridge callback captured from store/installs.ts.
export const installWs: { callback: null | (() => void) } = { callback: null }

// Update-state bridge callback captured from store/updates.ts. Payload-carrying, unlike every
// other machine-scoped bridge above — the frame *is* the download progress, so a test needs to
// hand it a real event rather than a bare notification.
export const updatesWs: { callback: null | ((e: unknown) => void) } = { callback: null }

/**
 * Programmer bridge, captured from `store/programmer.ts`.
 *
 * Unlike every holder above this one is **stateful**, because the programmer's client is: consumers
 * read `getState()` / `layers()` synchronously and then wait to be told it changed. A bare callback
 * holder would let a test fire a notification carrying nothing the component could read.
 *
 * `push` sets the state and notifies, which is the shape a real frame has — `programmer.layerState`
 * and `provenanceState` both mutate the snapshot before calling subscribers.
 */
export const programmerWs: {
  callbacks: ((state: unknown) => void)[]
  state: {
    blind: boolean
    entries: Map<string, unknown>
    channels: unknown[]
    provenance: Map<string, unknown>
    lastIncluded: unknown
    layers: unknown[]
  }
  push: (patch: Partial<typeof programmerWs.state>) => void
  reset: () => void
} = {
  callbacks: [],
  state: {
    blind: false,
    entries: new Map(),
    channels: [],
    provenance: new Map(),
    lastIncluded: null,
    layers: [],
  },
  push(patch) {
    programmerWs.state = { ...programmerWs.state, ...patch }
    for (const fn of programmerWs.callbacks) fn(programmerWs.state)
  },
  reset() {
    programmerWs.callbacks = []
    programmerWs.state = {
      blind: false,
      entries: new Map(),
      channels: [],
      provenance: new Map(),
      lastIncluded: null,
      layers: [],
    }
  },
}

// WebSocket readyState bridge, captured from store/status.ts. Unlike the holders above this
// keeps a *list*: two subscribers exist in that module — the module-level reconnect resync and
// the `status` query's cache-entry stream — and a single-callback holder would silently drop
// whichever registered first. `fire` drives all of them, as the real StatusApi does.
export const statusWs: {
  callbacks: ((status: number) => void)[]
  fire: (status: number) => void
} = {
  callbacks: [],
  fire: (status) => {
    for (const fn of [...statusWs.callbacks]) fn(status)
  },
}

const noopSub = () => ({ unsubscribe: () => {} })

export function lightingApiMock() {
  const namespaces: Record<string, unknown> = {
      bootStatus: {
        subscribe: (fn: () => void) => {
          bootStatusWs.callback = fn
          return {
            unsubscribe: () => {
              bootStatusWs.callback = null
            },
          }
        },
      },
      patches: {
        subscribe: (fn: () => void) => {
          patchesWs.callback = fn
          return {
            unsubscribe: () => {
              patchesWs.callback = null
            },
          }
        },
      },
      auth: {
        subscribeUnauthenticated: (fn: () => void) => {
          authWs.callback = fn
          return {
            unsubscribe: () => {
              authWs.callback = null
            },
          }
        },
        subscribeOwnAccountChanged: (fn: () => void) => {
          ownAccountWs.callback = fn
          return {
            unsubscribe: () => {
              ownAccountWs.callback = null
            },
          }
        },
      },
      users: {
        subscribe: (fn: () => void) => {
          usersWs.callback = fn
          return {
            unsubscribe: () => {
              usersWs.callback = null
            },
          }
        },
      },
      install: {
        subscribe: (fn: () => void) => {
          installWs.callback = fn
          return {
            unsubscribe: () => {
              installWs.callback = null
            },
          }
        },
      },
      updates: {
        subscribe: (fn: (e: unknown) => void) => {
          updatesWs.callback = fn
          return {
            unsubscribe: () => {
              updatesWs.callback = null
            },
          }
        },
      },
      // store/status.ts calls `get()` in its queryFn and the auth endpoints call
      // `reconnect(true)` from onQueryStarted. The fallback Proxy below returns a
      // subscriber factory for both — callable, but it would make `get()` answer with
      // a Subscription. Spell the namespace out instead of relying on that.
      status: {
        subscribe: (fn: (status: number) => void) => {
          statusWs.callbacks.push(fn)
          return {
            unsubscribe: () => {
              statusWs.callbacks = statusWs.callbacks.filter((cb) => cb !== fn)
            },
          }
        },
        get: () => 3, // Status.CLOSED — no socket exists under the mock
        reconnect: () => {},
      },
      // Spelled out rather than left to the fallback Proxy for the reason `status` is: the
      // programmer's consumers *read* before they subscribe, and the Proxy would hand `getState()`
      // back a Subscription.
      programmer: {
        getState: () => programmerWs.state,
        layers: () => programmerWs.state.layers,
        isBlind: () => programmerWs.state.blind,
        entryCount: () => programmerWs.state.entries.size,
        lastIncluded: () => programmerWs.state.lastIncluded,
        getKeyState: (targetKey: string, propertyName: string) => ({
          entry: programmerWs.state.entries.get(`${targetKey}|${propertyName}`),
          provenance: programmerWs.state.provenance.get(`${targetKey}|${propertyName}`),
        }),
        subscribe: (fn: (state: unknown) => void) => {
          programmerWs.callbacks.push(fn)
          return {
            unsubscribe: () => {
              programmerWs.callbacks = programmerWs.callbacks.filter((cb) => cb !== fn)
            },
          }
        },
        subscribeToKey: noopSub,
        subscribeToErrors: noopSub,
        // The writers have to be spelled out too, and this is the cost of not being the Proxy any
        // more: it answered every unknown member, so a surface that merely *called* `programmerSet`
        // used to be safe under the mock. Without these, rendering one throws
        // "programmer.set is not a function" — in a test about something else entirely.
        set: () => {},
        setColour: () => {},
        setPosition: () => {},
        clearEntry: () => {},
        clearAll: () => {},
        setBlind: () => {},
        requestState: () => {},
        addLayer: () => {},
        removeLayer: () => {},
        moveLayer: () => {},
        patchLayer: () => {},
      },
      cueStacks: {
        subscribe: noopSub,
        subscribeToProgramState: (fn: (e: unknown) => void) => {
          programStateWs.callback = fn
          return {
            unsubscribe: () => {
              programStateWs.callback = null
            },
          }
        },
        subscribeToRunState: (fn: (e: unknown) => void) => {
          cueRunStateWs.callback = fn
          return {
            unsubscribe: () => {
              cueRunStateWs.callback = null
            },
          }
        },
      },
  }

  // Store slices self-register a WS subscription at module load, so merely importing one has to
  // be safe. Rather than enumerate every namespace and every `subscribeToX` variant, fall back to
  // a no-op subscriber for anything the test didn't ask to observe — a new slice then can't break
  // unrelated tests just by existing.
  const anySubscriber = new Proxy({} as Record<string, unknown>, {
    get: () => noopSub,
  })

  return {
    lightingApi: new Proxy(namespaces, {
      get: (target, prop: string) => target[prop] ?? anySubscriber,
    }),
  }
}
