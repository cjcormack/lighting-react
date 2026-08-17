import {Subscription} from "./subscription";

// The backend accepts the `/api` upgrade and then closes with this code when the
// request carried no valid session cookie (lighting7 plugins/Sockets.kt). A browser
// cannot read a 401 on an upgrade response, but it can read a close code — hence the
// application-range code rather than an HTTP status.
export const UNAUTHENTICATED_CLOSE_CODE = 4401

export interface InternalApiConnection {
  baseUrl: string
  readyState(): number;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void,
  subscribe(fn: ((evType: InternalEventType, ev: Event) => void)): Subscription
  /**
   * Re-open the socket. A no-op while it is already OPEN or CONNECTING, unless
   * `force` — which is what a fresh login needs, since the identity behind an
   * already-open socket has just changed.
   */
  reconnect(force?: boolean): void;
}

export enum InternalEventType {
  'close' = 'close',
  'error' = 'error',
  'message' = 'message',
  'open' = 'open',
}

export function createInternalApiConnection(baseUrl: string, wsUrl: string): InternalApiConnection {
  let nextEventSubscriptionId = 1
  const eventSubscriptions = new Map<number, (evType: InternalEventType, ev: Event) => void>()
  let reconnectDelay = 1000
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const notifyEvent = (ev: Event) => {
    eventSubscriptions.forEach((fn) => {
      const evType = ev.type as InternalEventType
      if (evType) {
        fn(evType, ev)
      }
    })
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    console.log(`WebSocket closed, reconnecting in ${reconnectDelay}ms...`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
      ws = connect()
    }, reconnectDelay)
  }

  function connect(): WebSocket {
    const newWs = new WebSocket(wsUrl)

    newWs.onopen = (ev) => {
      reconnectDelay = 1000
      notifyEvent(ev)
    }
    newWs.onerror = (ev) => {
      notifyEvent(ev)
    }
    newWs.onclose = (ev) => {
      notifyEvent(ev)
      // The server rejected our session. Reconnecting would loop against the same
      // dead cookie forever; instead authWsApi turns this into a cache invalidation
      // and the auth gate re-checks /auth/status and shows the login screen. Logging
      // back in reconnects explicitly (see the `login` endpoint in store/auth.ts).
      if (ev.code === UNAUTHENTICATED_CLOSE_CODE) return
      scheduleReconnect()
    }

    newWs.onmessage = (ev) => {
      notifyEvent(ev)
    }

    return newWs
  }

  let ws = connect()

  window.setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({type: "ping"}))
    }
  }, 10_000)

  return {
    baseUrl: baseUrl,
    readyState(): number {
      return ws.readyState
    },
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    },
    reconnect(force = false) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      const isLive = ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING
      if (!force && isLive) {
        return
      }
      reconnectDelay = 1000
      // A socket opened while the backend was still bootstrap-open carries no user.
      // After setup, login or logout it has to re-handshake so the server re-reads
      // the cookie, rather than leaving a socket streaming under a stale identity.
      //
      // Whatever state the outgoing socket is in, it must not schedule its own
      // reconnect: we are about to replace it, and its close handler would race a
      // third socket against the replacement, orphaning the replacement while it
      // stays open and delivers every frame twice. CLOSED needs nothing — its close
      // already fired, and the timer it armed was cleared above. Subscribers still
      // see the close, so readyState-watchers (statusApi) stay accurate.
      const replaced = ws
      if (replaced.readyState !== WebSocket.CLOSED) {
        replaced.onclose = (ev) => notifyEvent(ev)
        replaced.close()
      }
      ws = connect()
    },
    subscribe(fn: (evType: InternalEventType, ev: Event) => void): Subscription {
      const thisId = nextEventSubscriptionId
      nextEventSubscriptionId++

      eventSubscriptions.set(thisId, fn)

      return {
        unsubscribe: () => {
          eventSubscriptions.delete(thisId)
        },
      }
    }
  }
}
