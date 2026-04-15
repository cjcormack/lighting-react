import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface CuesWsApi {
  subscribe(fn: () => void): Subscription
}

type CueInMessage = {
  type: 'cueListChanged'
}

export function createCuesWsApi(conn: InternalApiConnection): CuesWsApi {
  const cuesChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      cuesChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: CueInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'cueListChanged') {
        cuesChanged.notify()
      }
    }
  })

  return cuesChanged.api
}
