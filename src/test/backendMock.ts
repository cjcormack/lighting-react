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

// Patch-list WS bridge callback captured from store/patches.ts, so a test can
// fire a synthetic `patchListChanged` and assert on invalidation batching.
export const patchesWs: { callback: null | (() => void) } = { callback: null }

// Unauthenticated-socket (close code 4401) bridge callback captured from
// store/auth.ts, so a test can fire a synthetic session rejection.
export const authWs: { callback: null | (() => void) } = { callback: null }

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
      },
      // store/status.ts calls `get()` in its queryFn and the auth endpoints call
      // `reconnect(true)` from onQueryStarted. The fallback Proxy below returns a
      // subscriber factory for both — callable, but it would make `get()` answer with
      // a Subscription. Spell the namespace out instead of relying on that.
      status: {
        subscribe: noopSub,
        get: () => 3, // Status.CLOSED — no socket exists under the mock
        reconnect: () => {},
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
