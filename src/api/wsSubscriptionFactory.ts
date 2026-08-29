import { InternalApiConnection, InternalEventType } from './internalApi'
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

/**
 * The commonest bridge in this directory: one payload-free inbound frame meaning
 * "that list changed", fanned out to whoever is subscribed. A dozen bridges are
 * nothing but this, so the shape lives here once — a thirteenth is a one-line call,
 * and the null/`type` guards have a single home rather than twelve.
 *
 * Payload-carrying frames, anything with an `open` branch, and anything switching on
 * more than one `type` keep their own hand-written subscribe: the moment a bridge
 * needs the body, this factory is the wrong tool.
 */
export function createChangeSignalApi(
  conn: InternalApiConnection,
  messageType: string,
): WsSubscribable<void> {
  const changed = createWsSubscribable<void>()

  conn.subscribe((evType, _ev, frame) => {
    if (evType !== InternalEventType.message) return
    const message = frame as { type?: string } | null
    if (message?.type === messageType) {
      changed.notify()
    }
  })

  return changed.api
}
