// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { InternalApiConnection, InternalEventType, UNAUTHENTICATED_CLOSE_CODE } from "./internalApi"
import { createAuthWsApi } from "./authWsApi"

type EventHandler = (evType: InternalEventType, ev: Event) => void

// A fake connection that captures the single handler createAuthWsApi registers, so
// tests can fire synthetic WS events at it directly. Mirrors bootStatusWsApi.test.ts.
function fakeConnection() {
  let handler: EventHandler | null = null
  const conn: InternalApiConnection = {
    baseUrl: "/api/",
    readyState: () => 3, // WebSocket.CLOSED — never called, just a stub value
    send: () => {},
    reconnect: () => {},
    subscribe: (fn) => {
      handler = fn
      return {
        unsubscribe: () => {
          handler = null
        },
      }
    },
  }
  return {
    conn,
    fire: (evType: InternalEventType, ev: Event) => handler?.(evType, ev),
  }
}

function closeEvent(code: number) {
  return new CloseEvent("close", { code })
}

describe("createAuthWsApi", () => {
  it("fires the subscriber on a 4401 close", () => {
    const { conn, fire } = fakeConnection()
    const api = createAuthWsApi(conn)
    const spy = vi.fn()
    api.subscribeUnauthenticated(spy)

    fire(InternalEventType.close, closeEvent(UNAUTHENTICATED_CLOSE_CODE))

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("does NOT fire on an ordinary close", () => {
    const { conn, fire } = fakeConnection()
    const api = createAuthWsApi(conn)
    const spy = vi.fn()
    api.subscribeUnauthenticated(spy)

    // 1006 (abnormal) is what a backend restart looks like — that must keep
    // reconnecting, not drop the operator to a login screen.
    fire(InternalEventType.close, closeEvent(1006))
    fire(InternalEventType.close, closeEvent(1000))

    expect(spy).not.toHaveBeenCalled()
  })

  it("does NOT fire on non-close events", () => {
    const { conn, fire } = fakeConnection()
    const api = createAuthWsApi(conn)
    const spy = vi.fn()
    api.subscribeUnauthenticated(spy)

    fire(InternalEventType.open, new Event("open"))
    fire(InternalEventType.error, new Event("error"))
    fire(InternalEventType.message, new MessageEvent("message", { data: "{}" }))

    expect(spy).not.toHaveBeenCalled()
  })

  it("does NOT fire when the close event is not a CloseEvent (no code to read)", () => {
    const { conn, fire } = fakeConnection()
    const api = createAuthWsApi(conn)
    const spy = vi.fn()
    api.subscribeUnauthenticated(spy)

    fire(InternalEventType.close, new Event("close"))

    expect(spy).not.toHaveBeenCalled()
  })

  it("notifies every subscriber, and stops after unsubscribe", () => {
    const { conn, fire } = fakeConnection()
    const api = createAuthWsApi(conn)
    const a = vi.fn()
    const b = vi.fn()
    const subA = api.subscribeUnauthenticated(a)
    api.subscribeUnauthenticated(b)

    fire(InternalEventType.close, closeEvent(UNAUTHENTICATED_CLOSE_CODE))
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)

    subA.unsubscribe()
    fire(InternalEventType.close, closeEvent(UNAUTHENTICATED_CLOSE_CODE))
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
  })
})
