import { describe, expect, it, vi } from "vitest"
import { InternalApiConnection, InternalEventType } from "./internalApi"
import { createUsersWsApi } from "./usersWsApi"
import { createInstallWsApi } from "./installWsApi"

type EventHandler = (evType: InternalEventType, ev: Event) => void

// A fake connection that captures the single handler the factory registers, so tests can fire
// synthetic WS events at it directly. Same shape as bootStatusWsApi.test.ts.
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

function frame(type: string) {
  return new MessageEvent("message", { data: JSON.stringify({ type }) })
}

describe("createUsersWsApi", () => {
  it("fires the subscriber on an 'open' event (reconnect catch-up)", () => {
    const { conn, fire } = fakeConnection()
    const spy = vi.fn()
    createUsersWsApi(conn).subscribe(spy)

    fire(InternalEventType.open, new Event("open"))

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("fires on a 'userListChanged' message frame", () => {
    const { conn, fire } = fakeConnection()
    const spy = vi.fn()
    createUsersWsApi(conn).subscribe(spy)

    fire(InternalEventType.message, frame("userListChanged"))

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("does NOT fire on the sibling machine-scoped frames", () => {
    const { conn, fire } = fakeConnection()
    const spy = vi.fn()
    createUsersWsApi(conn).subscribe(spy)

    // Both ride the same backend collector (plugins/MachineSocket.kt), so a discriminator
    // check that was too loose would cross-fire and refetch the user list on an install
    // rename — or worse, on the targeted own-account frame.
    fire(InternalEventType.message, frame("installChanged"))
    fire(InternalEventType.message, frame("ownAccountChanged"))

    expect(spy).not.toHaveBeenCalled()
  })

  it("does NOT fire when the message event is not a MessageEvent", () => {
    const { conn, fire } = fakeConnection()
    const spy = vi.fn()
    createUsersWsApi(conn).subscribe(spy)

    fire(InternalEventType.message, new Event("message"))

    expect(spy).not.toHaveBeenCalled()
  })

  it("does NOT fire when the parsed body is null", () => {
    const { conn, fire } = fakeConnection()
    const spy = vi.fn()
    createUsersWsApi(conn).subscribe(spy)

    fire(InternalEventType.message, new MessageEvent("message", { data: "null" }))

    expect(spy).not.toHaveBeenCalled()
  })

  it("notifies every subscriber, and stops after unsubscribe", () => {
    const { conn, fire } = fakeConnection()
    const api = createUsersWsApi(conn)
    const a = vi.fn()
    const b = vi.fn()
    const subA = api.subscribe(a)
    api.subscribe(b)

    fire(InternalEventType.message, frame("userListChanged"))
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)

    subA.unsubscribe()
    fire(InternalEventType.message, frame("userListChanged"))
    expect(a).toHaveBeenCalledTimes(1) // no further deliveries
    expect(b).toHaveBeenCalledTimes(2)
  })
})

describe("createInstallWsApi", () => {
  it("fires on 'open' and on an 'installChanged' frame", () => {
    const { conn, fire } = fakeConnection()
    const spy = vi.fn()
    createInstallWsApi(conn).subscribe(spy)

    fire(InternalEventType.open, new Event("open"))
    fire(InternalEventType.message, frame("installChanged"))

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("does NOT fire on the sibling machine-scoped frames", () => {
    const { conn, fire } = fakeConnection()
    const spy = vi.fn()
    createInstallWsApi(conn).subscribe(spy)

    fire(InternalEventType.message, frame("userListChanged"))
    fire(InternalEventType.message, frame("ownAccountChanged"))

    expect(spy).not.toHaveBeenCalled()
  })

  it("does NOT fire on a non-MessageEvent or a null body", () => {
    const { conn, fire } = fakeConnection()
    const spy = vi.fn()
    createInstallWsApi(conn).subscribe(spy)

    fire(InternalEventType.message, new Event("message"))
    fire(InternalEventType.message, new MessageEvent("message", { data: "null" }))

    expect(spy).not.toHaveBeenCalled()
  })
})
