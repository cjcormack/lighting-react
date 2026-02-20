import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'

export interface CuesWsApi {
  subscribe(fn: () => void): Subscription
}

type CueInMessage = {
  type: 'cueListChanged'
}

export function createCuesWsApi(conn: InternalApiConnection): CuesWsApi {
  let nextSubscriptionId = 1
  const listSubscriptions = new Map<number, () => void>()

  const notifyListChange = () => {
    listSubscriptions.forEach((fn) => fn())
  }

  const handleOnOpen = () => {
    notifyListChange()
  }

  const handleOnMessage = (ev: MessageEvent) => {
    const message: CueInMessage = JSON.parse(ev.data)
    if (message == null) return

    if (message.type === 'cueListChanged') {
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
