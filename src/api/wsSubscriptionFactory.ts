import { Subscription } from './subscription'

export interface WsSubscribable<TEvent> {
  subscribe(fn: (event: TEvent) => void): Subscription
}

export function createWsSubscribable<TEvent>(): {
  api: WsSubscribable<TEvent>
  notify: (event: TEvent) => void
} {
  let nextSubscriptionId = 1
  const subscriptions = new Map<number, (event: TEvent) => void>()

  return {
    api: {
      subscribe(fn) {
        const thisId = nextSubscriptionId++
        subscriptions.set(thisId, fn)
        return {
          unsubscribe: () => {
            subscriptions.delete(thisId)
          },
        }
      },
    },
    notify(event) {
      subscriptions.forEach((fn) => fn(event))
    },
  }
}
