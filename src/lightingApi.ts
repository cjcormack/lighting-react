type ChannelUpdateInMessage = {
  type: "uC",
  data: {
    c: {
      i: number,
      l: number,
    }
  }
}

type InMessage = ChannelUpdateInMessage

function aggregateAndDebounce<A, B>(
    // Take some val and the current aggregated vals in and return next aggregated vals
    aggregate: (val: A, vals: B) => B,
    // This is called waitMs after the some values are given
    debounced: (val: B) => void,
    // This produces an initial state for the aggregated vals, to start from/
    initialVals: () => B,
    // How long to wait until calling the debounce
    waitMs: number
): (val: A) => void {
  let intervalId: number | undefined = undefined
  let vals = initialVals()
  let newValsSeen = false

  function callAggregate(val: A) {
    vals = aggregate(val, vals)
    newValsSeen = true
  }

  function callDebounced() {
    if (newValsSeen) {
      // New vals seen since last fire; send them out.
      debounced(vals)
      vals = initialVals()
      newValsSeen = false
    } else {
      // No new vals seen in waitMs since last fire; stop interval
      clearInterval(intervalId)
      intervalId = undefined
    }
  }

  return (val: A) => {
    callAggregate(val)

    if (!intervalId) {
      callDebounced()
      intervalId = window.setInterval(() => {
        callDebounced()
      }, waitMs)
    }
  }
}

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

type LightingApi = {
  channels: {
    currentValues(): Map<number, number>
    updateValue(channelNo: number, value: number): void
    subscribe(fn: (updates: Map<number, number>) => void): Subscription
  }
}

export function createLightingApi(): LightingApi {
  const currentValues = new Map<number, number>()

  let nextId = 1
  const channelUpdatesSubscriptions = new Map<number, (updates: Map<number, number>) => void>()

  const updateItem = debounceChannelUpdates((updates: Map<number, number>) => {
    updates.forEach((channelNo, value) => {
      currentValues.set(channelNo, value)
    })
    channelUpdatesSubscriptions.forEach((fn) => {
      fn(updates)
    })
  }, 100)

  const wsAddress = "ws://" + window.location.href.split("/")[2] + "/lighting/"
  const ws = new WebSocket(wsAddress)

  ws.onopen = () => {}
  ws.onerror = () => {}
  ws.onclose = () => {}

  ws.onmessage = (ev: MessageEvent) => {
    const message: InMessage = JSON.parse(ev.data)

    if (message as ChannelUpdateInMessage) {
      updateItem(message.data.c.i, message.data.c.l)
    }
  }

  return {
    channels: {
      currentValues: () => {
        return currentValues
      },
      subscribe: (fn: (updates: Map<number, number>) => void): Subscription => {
        fn(new Map())
        const thisId = nextId
        nextId++

        channelUpdatesSubscriptions.set(thisId, fn)

        return {
          unsubscribe: () => {
            channelUpdatesSubscriptions.delete(thisId)
          },
        }
      },
      updateValue: (channelNo: number, value: number) => {
        const payload = {
          type: "updateChannel",
          data: {channel: {id: channelNo, level: value, fadeTime: 0}}
        }
        ws.send(JSON.stringify(payload))
      }
    }
  }
}


// newValues.forEach((newValue, id) => {
//   const oldValue = oldValues.get(id)
//   if (oldValue !== newValue) {
//     const payload: WsMessage = {
//       type: "updateChannel",
//       data: {channel: {id: id, level: newValue, fadeTime: 0}}
//     }
//     ws.sendJsonMessage(payload)
//   }
// })
