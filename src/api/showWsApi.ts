import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import type { ShowChangedEvent } from './showApi'
import { createWsSubscribable } from './wsSubscriptionFactory'

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
  const entriesChanged = createWsSubscribable<void>()
  const showChanged = createWsSubscribable<ShowChangedEvent>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      entriesChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: ShowInMessage = JSON.parse(ev.data)
      if (message == null) return

      if (message.type === 'showEntriesChanged') {
        entriesChanged.notify()
      } else if (message.type === 'showChanged') {
        showChanged.notify({
          projectId: message.projectId,
          activeEntryId: message.activeEntryId,
          activatedStackId: message.activatedStackId,
          activatedStackName: message.activatedStackName,
        })
      }
    }
  })

  return {
    subscribeToEntriesChanged: entriesChanged.api.subscribe,
    subscribeToChanged: showChanged.api.subscribe,
  }
}
