import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface FxDefinitionsWsApi {
  subscribe(fn: () => void): Subscription
}

type FxDefinitionInMessage = {
  type: 'fxDefinitionListChanged'
}

/**
 * FX-definition **CRUD** notifications — a user-created effect written, edited, deleted or
 * recompiled.
 *
 * Separate from `fxApi`'s `fxState`, which streams the *running* effects: this is the library an
 * effect is chosen from, and the two change for unrelated reasons. Separate from
 * `scriptListChanged` for the reason that frame's own doc gives.
 */
export function createFxDefinitionsWsApi(conn: InternalApiConnection): FxDefinitionsWsApi {
  const definitionsChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'message' && ev instanceof MessageEvent) {
      const message: FxDefinitionInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'fxDefinitionListChanged') {
        definitionsChanged.notify()
      }
    }
  })

  return definitionsChanged.api
}
