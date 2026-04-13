import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import type { ShowSessionChangedEvent } from './showSessionsApi'

export interface ShowSessionsWsApi {
  subscribe(fn: () => void): Subscription
  subscribeToChanged(fn: (event: ShowSessionChangedEvent) => void): Subscription
}

type ShowSessionInMessage =
  | { type: 'showSessionListChanged' }
  | { type: 'showSessionChanged'; sessionId: number; activeEntryId: number | null; activatedStackId: number | null; activatedStackName: string | null; isActive: boolean }

export function createShowSessionsWsApi(conn: InternalApiConnection): ShowSessionsWsApi {
  let nextSubscriptionId = 1
  const listSubscriptions = new Map<number, () => void>()
  const changedSubscriptions = new Map<number, (event: ShowSessionChangedEvent) => void>()

  const notifyListChange = () => {
    listSubscriptions.forEach((fn) => fn())
  }

  const notifyChanged = (event: ShowSessionChangedEvent) => {
    changedSubscriptions.forEach((fn) => fn(event))
  }

  const handleOnOpen = () => {
    notifyListChange()
  }

  const handleOnMessage = (ev: MessageEvent) => {
    const message: ShowSessionInMessage = JSON.parse(ev.data)
    if (message == null) return

    if (message.type === 'showSessionListChanged') {
      notifyListChange()
    } else if (message.type === 'showSessionChanged') {
      notifyChanged({
        sessionId: message.sessionId,
        activeEntryId: message.activeEntryId,
        activatedStackId: message.activatedStackId,
        activatedStackName: message.activatedStackName,
        isActive: message.isActive,
      })
    }
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
      const thisId = nextSubscriptionId++
      listSubscriptions.set(thisId, fn)
      return {
        unsubscribe: () => {
          listSubscriptions.delete(thisId)
        },
      }
    },
    subscribeToChanged(fn: (event: ShowSessionChangedEvent) => void): Subscription {
      const thisId = nextSubscriptionId++
      changedSubscriptions.set(thisId, fn)
      return {
        unsubscribe: () => {
          changedSubscriptions.delete(thisId)
        },
      }
    },
  }
}
