import {ChannelsApi, createChannelsApi} from "./channelsApi";
import {createStatusApi, Status, StatusApi} from "./statusApi";
import {createTrackApi, TrackApi} from "./trackApi";

type Subscription = {
  unsubscribe: () => void,
}

interface LightingApi {
  channels: ChannelsApi
  status: StatusApi
  track: TrackApi
}

export interface InternalApiConnection {
  readyState(): number;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void,
  subscribe(fn: ((evType: InternalEventType, ev: Event) => void)): Subscription
  reconnect(): void;
}

const lightingApi = createLightingApi()

export function useLightingApi(): LightingApi {
  return lightingApi
}

function getLightingWsUrl() {
  if (process.env.NODE_ENV && process.env.NODE_ENV === 'development') {
    return 'ws://127.0.0.1:8080/lighting/'
  } else {
    return 'ws://' + window.location.href.split('/')[2] + '/lighting/'
  }
}

export enum InternalEventType {
  'close' = 'close',
  'error' = 'error',
  'message' = 'message',
  'open' = 'open',
}

function createInternalApiConnection(wsAddress: string): InternalApiConnection {
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
    const ws = new WebSocket(wsAddress)

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

function createLightingApi(): LightingApi {
  const wsAddress = getLightingWsUrl()
  const connection = createInternalApiConnection(wsAddress)

  const channelsApi = createChannelsApi(connection)
  const statusApi = createStatusApi(connection)
  const trackApi = createTrackApi(connection)

  return {
    channels: channelsApi,
    status: statusApi,
    track: trackApi,
  }
}
