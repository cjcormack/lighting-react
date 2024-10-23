import {InternalApiConnection} from "./internalApi";
import {Subscription} from "./subscription";

export interface ScenesApi {
  subscribe(fn: () => void): Subscription,
}

type ScenesChangedInMessage = {
  type: 'scenesChanged',
}

export function createSceneApi(conn: InternalApiConnection): ScenesApi {
  let nextSubscriptionId = 1
  const subscriptions = new Map<number, () => void>()

  const notifyChange = () => {
    subscriptions.forEach((fn) => {
      fn()
    })
  }

  const handleOnOpen = () => {
    notifyChange()
  }

  const handleOnMessage = (ev: MessageEvent) => {
    const message: ScenesChangedInMessage = JSON.parse(ev.data)

    if (message == null) {
      return
    }

    notifyChange()
  }

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      handleOnOpen()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      handleOnMessage(ev)
    }
  })

  return {
    subscribe(fn: () => void): Subscription {
      const thisId = nextSubscriptionId
      nextSubscriptionId++

      subscriptions.set(thisId, fn)

      fn()

      return {
        unsubscribe: () => {
          subscriptions.delete(thisId)
        },
      }
    },
  }
}
