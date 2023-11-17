import {Checker, object} from "@recoiljs/refine";
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

  const notifyEvent = (ev: Event) => {
    eventSubscriptions.forEach((fn) => {
      const evType = ev.type as InternalEventType
      if (evType) {
        fn(evType, ev)
      }
    })
  }

  function connect(): WebSocket {
    const ws = new WebSocket(wsUrl)

    ws.onopen = (ev) => {
      notifyEvent(ev)
    }
    ws.onerror = (ev) => {
      notifyEvent(ev)
    }
    ws.onclose = (ev) => {
      notifyEvent(ev)
    }

    ws.onmessage = (ev) => {
      notifyEvent(ev)
    }

    return ws
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
      if (ws.readyState !== WebSocket.CLOSED) {
        return
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
