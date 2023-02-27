import {aggregateAndDebounce} from "./aggregateAndDebounce";

const enum ChannelTypes {
  'uC' = 'uC',
  'channelState' = 'channelState',
}

interface ChannelUpdateInMessage {
  type: ChannelTypes.uC;
  data: {
    c: {
      i: number;
      l: number;
    };
  };
}

interface ChannelStateInMessage {
  type: ChannelTypes.channelState;
  data: {
    channels: {
      id: number;
      currentLevel: number;
    }[];
  };
}

type InMessage = ChannelUpdateInMessage | ChannelStateInMessage;

// An example usage of the above with concrete types etc.
function debounceChannelUpdates(
    func: (updates: Map<number, number>) => void,
    waitMs: number
): (i: number, l: number) => void {

  let fn = aggregateAndDebounce(
      ([a, b]: [number,number], map: Map<number, number>) => {
        map.set(a, b);
        return map;
      },
      func,
      () => new Map(),
      waitMs
  );

  return (a: number, b: number) => {
    fn([a, b])
  }
}

type Subscription = {
  unsubscribe: () => void,
}

export enum Status {
  CONNECTING,
  OPEN,
  CLOSING,
  CLOSED,
}

type LightingApi = {
  channels: {
    currentValues(): Map<number, number>
    updateValue(channelNo: number, value: number): void
    subscribe(fn: (updates: Map<number, number>) => void): Subscription
  }
  status: {
    currentStatus(): Status
    reconnect(): void
    subscribe(fn: ((status: Status) => void)): Subscription
  }
}

const lightingApi = createLightingApi()

export function useLightingApi(): LightingApi {
  return lightingApi
}

function createLightingApi(): LightingApi {
  const currentValues = new Map<number, number>()

  let nextChannelSubscriptionId = 1
  const channelUpdatesSubscriptions = new Map<number, (updates: Map<number, number>) => void>()

  let nextStatusSubscriptionId = 1
  const statusUpdatesSubscriptions = new Map<number, (status: Status) => void>()
  const notifyStatusChange = (readyState: Status) => {
    statusUpdatesSubscriptions.forEach((fn) => {
      fn(readyState)
    })
  }

  const updateItem = debounceChannelUpdates((updates: Map<number, number>) => {
    updates.forEach((channelNo, value) => {
      currentValues.set(channelNo, value)
    })
    channelUpdatesSubscriptions.forEach((fn) => {
      fn(updates)
    })
  }, 100)

  const wsAddress = 'ws://' + window.location.href.split('/')[2] + '/lighting/'
  let ws = new WebSocket(wsAddress)

  const registerConnections = () => {
    ws.onopen = () => {
      notifyStatusChange(ws.readyState)
      const payload = {
        type: 'channelState',
      }
      ws.send(JSON.stringify(payload))
    }
    ws.onerror = () => {
      notifyStatusChange(ws.readyState)
    }
    ws.onclose = () => {
      notifyStatusChange(ws.readyState)
    }

    ws.onmessage = (ev: MessageEvent) => {
      const message: InMessage = JSON.parse(ev.data)

      if (message.type === ChannelTypes.uC) {
        updateItem(message.data.c.i, message.data.c.l)
      } else if (message.type === ChannelTypes.channelState) {
        message.data.channels.forEach((update) => {
          updateItem(update.id, update.currentLevel)
        })
      }
    }
  }
  registerConnections()

  window.setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({type: "ping"}))
    }
  }, 10_000)

  return {
    channels: {
      currentValues: () => {
        return currentValues
      },
      subscribe: (fn: (updates: Map<number, number>) => void): Subscription => {
        const thisId = nextChannelSubscriptionId
        nextChannelSubscriptionId++

        channelUpdatesSubscriptions.set(thisId, fn)

        return {
          unsubscribe: () => {
            channelUpdatesSubscriptions.delete(thisId)
          },
        }
      },
      updateValue: (channelNo: number, value: number) => {
        if (ws.readyState === WebSocket.OPEN) {
          const payload = {
            type: 'updateChannel',
            data: {channel: {id: channelNo, level: value, fadeTime: 0}}
          }
          ws.send(JSON.stringify(payload))
        }
      }
    },
    status: {
      currentStatus: (): Status => {
        return ws.readyState
      },
      reconnect: () => {
        if (ws.readyState !== WebSocket.CLOSED) {
          return
        }

        ws = new WebSocket(wsAddress)
        registerConnections()
        notifyStatusChange(ws.readyState)
      },
      subscribe: (fn: (status: Status) => void): Subscription => {
        const thisId = nextStatusSubscriptionId
        nextStatusSubscriptionId++

        fn(ws.readyState)

        statusUpdatesSubscriptions.set(thisId, fn)

        return {
          unsubscribe: () => {
            statusUpdatesSubscriptions.delete(thisId)
          },
        }
      },
    },
  }
}
