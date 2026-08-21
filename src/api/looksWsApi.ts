import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface LooksWsApi {
  subscribe(fn: () => void): Subscription
}

type LookInMessage = {
  type: 'lookListChanged'
}

/**
 * Look **CRUD** notifications — created, renamed, copied, deleted. One frame replacing the two
 * (`presetListChanged` + `paletteListChanged`) the merged entities used to need.
 *
 * Deliberately not fired when a Look's *contents* change: this drives RTK Query cache
 * invalidation, so emitting it per resolution would be an invalidation storm behind an open sheet.
 * A contents edit instead republishes every live consumer directly (`republishForLookEdit`) and
 * publishes `provenanceState`, which the programmer API already turns into a debounced
 * `programmer.state` re-read — that is what refreshes resolved values on screen.
 */
export function createLooksWsApi(conn: InternalApiConnection): LooksWsApi {
  const looksChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      looksChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: LookInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'lookListChanged') {
        looksChanged.notify()
      }
    }
  })

  return looksChanged.api
}
