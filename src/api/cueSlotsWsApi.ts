import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface CueSlotsWsApi {
  subscribe(fn: () => void): Subscription
}

type CueSlotInMessage = {
  type: 'cueSlotListChanged'
}

export function createCueSlotsWsApi(conn: InternalApiConnection): CueSlotsWsApi {
  const cueSlotsChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      cueSlotsChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: CueSlotInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'cueSlotListChanged') {
        cueSlotsChanged.notify()
      }
    }
  })

  return cueSlotsChanged.api
}
