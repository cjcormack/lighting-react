import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface CueStacksWsApi {
  subscribe(fn: () => void): Subscription
}

type CueStackInMessage = {
  type: 'cueStackListChanged'
}

export function createCueStacksWsApi(conn: InternalApiConnection): CueStacksWsApi {
  const cueStacksChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      cueStacksChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: CueStackInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'cueStackListChanged') {
        cueStacksChanged.notify()
      }
    }
  })

  return cueStacksChanged.api
}
