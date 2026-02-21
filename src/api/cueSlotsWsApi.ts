import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'

export interface CueSlotsWsApi {
  subscribe(fn: () => void): Subscription
}

type CueSlotInMessage = {
  type: 'cueSlotListChanged'
}

export function createCueSlotsWsApi(conn: InternalApiConnection): CueSlotsWsApi {
  let nextSubscriptionId = 1
  const listSubscriptions = new Map<number, () => void>()

  const notifyListChange = () => {
    listSubscriptions.forEach((fn) => fn())
  }

  const handleOnOpen = () => {
    notifyListChange()
  }

  const handleOnMessage = (ev: MessageEvent) => {
    const message: CueSlotInMessage = JSON.parse(ev.data)
    if (message == null) return

    if (message.type === 'cueSlotListChanged') {
      notifyListChange()
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
  }
}
