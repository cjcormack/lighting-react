import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface ScriptsWsApi {
  subscribe(fn: () => void): Subscription
}

type ScriptInMessage = {
  type: 'scriptListChanged'
}

/**
 * Script **CRUD** notifications — created, renamed, edited, deleted, copied into this project.
 *
 * Its own frame rather than a reuse of `fxDefinitionListChanged`, mirroring the backend's two
 * signals and for the same reason `looksWsApi` gives: the two invalidate different caches, so one
 * message would make every effect-library edit re-read the script list and vice versa.
 *
 * Fired for a script's *contents* as well as its name, unlike the Look and template frames. A
 * script has no live consumers to republish and no open editor to storm — the list carries
 * `usedByProperties` and `canDelete`, both of which move when the source does.
 */
export function createScriptsWsApi(conn: InternalApiConnection): ScriptsWsApi {
  const scriptsChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'message' && ev instanceof MessageEvent) {
      const message: ScriptInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'scriptListChanged') {
        scriptsChanged.notify()
      }
    }
  })

  return scriptsChanged.api
}
