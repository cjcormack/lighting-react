import {Subscription} from "./subscription";

export interface InternalApiConnection {
  baseUrl: string
  readyState(): number;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void,
  subscribe(fn: ((evType: InternalEventType, ev: Event) => void)): Subscription
  reconnect(): void;
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
    reconnect() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        return
      }
      reconnectDelay = 1000
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
