import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface PromptBooksWsApi {
  subscribe(fn: () => void): Subscription
}

type PromptBookInMessage = {
  type: 'promptBookChanged'
}

export function createPromptBooksWsApi(conn: InternalApiConnection): PromptBooksWsApi {
  const promptBooksChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      promptBooksChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: PromptBookInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'promptBookChanged') {
        promptBooksChanged.notify()
      }
    }
  })

  return promptBooksChanged.api
}
