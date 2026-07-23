import { describe, expect, it, vi } from "vitest"
import { InternalApiConnection, InternalEventType } from "./internalApi"
import { BootStatus, createBootStatusWsApi } from "./bootStatusWsApi"

type EventHandler = (evType: InternalEventType, ev: Event) => void

// A fake connection that captures the single handler createBootStatusWsApi
// registers, so tests can fire synthetic WS events at it directly.
function fakeConnection() {
  let handler: EventHandler | null = null
  const conn: InternalApiConnection = {
    baseUrl: "/api/",
    readyState: () => 1, // WebSocket.OPEN — never called, just a stub value
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

const SAMPLE_STATUS: BootStatus = {
  phase: "FX_COMPILE",
  message: "Compiling effects (12/28)…",
  percent: 45,
  ready: false,
  error: null,
}

function bootFrame(status: BootStatus = SAMPLE_STATUS) {
  return new MessageEvent("message", {
    data: JSON.stringify({ type: "bootProgressState", status }),
  })
}

describe("createBootStatusWsApi", () => {
  it("fires the subscriber on an 'open' event (reconnect re-check)", () => {
    const { conn, fire } = fakeConnection()
    const api = createBootStatusWsApi(conn)
    const spy = vi.fn()
    api.subscribe(spy)

    fire(InternalEventType.open, new Event("open"))

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("fires on a 'bootProgressState' message frame", () => {
    const { conn, fire } = fakeConnection()
    const api = createBootStatusWsApi(conn)
    const spy = vi.fn()
    api.subscribe(spy)

    fire(InternalEventType.message, bootFrame())

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("does NOT fire on a message frame of another type", () => {
    const { conn, fire } = fakeConnection()
    const api = createBootStatusWsApi(conn)
    const spy = vi.fn()
    api.subscribe(spy)

    fire(
      InternalEventType.message,
      new MessageEvent("message", {
        data: JSON.stringify({ type: "channelUpdate", value: 1 }),
      }),
    )

    expect(spy).not.toHaveBeenCalled()
  })

  it("does NOT fire when the message event is not a MessageEvent", () => {
    const { conn, fire } = fakeConnection()
    const api = createBootStatusWsApi(conn)
    const spy = vi.fn()
    api.subscribe(spy)

    // Same 'message' event type, but a plain Event — fails the
    // `ev instanceof MessageEvent` guard, so JSON.parse never runs.
    fire(InternalEventType.message, new Event("message"))

    expect(spy).not.toHaveBeenCalled()
  })

  it("does NOT fire when the parsed body is null", () => {
    const { conn, fire } = fakeConnection()
    const api = createBootStatusWsApi(conn)
    const spy = vi.fn()
    api.subscribe(spy)

    fire(InternalEventType.message, new MessageEvent("message", { data: "null" }))

    expect(spy).not.toHaveBeenCalled()
  })

  it("notifies every subscriber", () => {
    const { conn, fire } = fakeConnection()
    const api = createBootStatusWsApi(conn)
    const a = vi.fn()
    const b = vi.fn()
    api.subscribe(a)
    api.subscribe(b)

    fire(InternalEventType.message, bootFrame())

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it("stops delivering to a subscriber after it unsubscribes", () => {
    const { conn, fire } = fakeConnection()
    const api = createBootStatusWsApi(conn)
    const spy = vi.fn()
    const sub = api.subscribe(spy)

    fire(InternalEventType.open, new Event("open"))
    expect(spy).toHaveBeenCalledTimes(1)

    sub.unsubscribe()
    fire(InternalEventType.open, new Event("open"))
    expect(spy).toHaveBeenCalledTimes(1) // no further deliveries
  })
})
