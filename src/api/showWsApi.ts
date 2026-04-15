import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import type { ShowChangedEvent } from './showApi'

export interface ShowWsApi {
  // Subscribe to entry CRUD changes (fires for add/remove/reorder/update).
  subscribeToEntriesChanged(fn: () => void): Subscription
  // Subscribe to show activation state changes (activate/deactivate/advance/go-to).
  subscribeToChanged(fn: (event: ShowChangedEvent) => void): Subscription
}

type ShowInMessage =
  | { type: 'showEntriesChanged' }
  | { type: 'showChanged'; projectId: number; activeEntryId: number | null; activatedStackId: number | null; activatedStackName: string | null }

export function createShowWsApi(conn: InternalApiConnection): ShowWsApi {
  let nextSubscriptionId = 1
  const entriesSubscriptions = new Map<number, () => void>()
  const changedSubscriptions = new Map<number, (event: ShowChangedEvent) => void>()

  const notifyEntriesChanged = () => {
    entriesSubscriptions.forEach((fn) => fn())
  }

  const notifyChanged = (event: ShowChangedEvent) => {
    changedSubscriptions.forEach((fn) => fn(event))
  }

  const handleOnOpen = () => {
    notifyEntriesChanged()
  }

  const handleOnMessage = (ev: MessageEvent) => {
    const message: ShowInMessage = JSON.parse(ev.data)
    if (message == null) return

    if (message.type === 'showEntriesChanged') {
      notifyEntriesChanged()
    } else if (message.type === 'showChanged') {
      notifyChanged({
        projectId: message.projectId,
        activeEntryId: message.activeEntryId,
        activatedStackId: message.activatedStackId,
        activatedStackName: message.activatedStackName,
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
    subscribeToEntriesChanged(fn: () => void): Subscription {
      const thisId = nextSubscriptionId++
      entriesSubscriptions.set(thisId, fn)
      return {
        unsubscribe: () => {
          entriesSubscriptions.delete(thisId)
        },
      }
    },
    subscribeToChanged(fn: (event: ShowChangedEvent) => void): Subscription {
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
