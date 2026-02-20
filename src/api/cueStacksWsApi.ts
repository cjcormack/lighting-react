import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'

export interface CueStacksWsApi {
  subscribe(fn: () => void): Subscription
}

type CueStackInMessage = {
  type: 'cueStackListChanged'
}

export function createCueStacksWsApi(conn: InternalApiConnection): CueStacksWsApi {
  let nextSubscriptionId = 1
  const listSubscriptions = new Map<number, () => void>()

  const notifyListChange = () => {
    listSubscriptions.forEach((fn) => fn())
  }

  const handleOnOpen = () => {
    notifyListChange()
  }

  const handleOnMessage = (ev: MessageEvent) => {
    const message: CueStackInMessage = JSON.parse(ev.data)
    if (message == null) return

    if (message.type === 'cueStackListChanged') {
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
