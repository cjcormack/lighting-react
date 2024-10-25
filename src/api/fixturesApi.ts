import {InternalApiConnection} from "./internalApi";
import {Subscription} from "./subscription";

export interface FixturesApi {
  subscribe(fn: () => void): Subscription,
}

type FixturesChangedInMessage = {
  type: 'fixturesChanged',
}

export function createFixtureApi(conn: InternalApiConnection): FixturesApi {
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
    const message: FixturesChangedInMessage = JSON.parse(ev.data)

    if (message == null || message.type != 'fixturesChanged') {
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

      return {
        unsubscribe: () => {
          subscriptions.delete(thisId)
        },
      }
    },
  }
}
