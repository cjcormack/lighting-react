import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface TemplatesWsApi {
  subscribe(fn: () => void): Subscription
}

type TemplateInMessage = {
  type: 'templateListChanged'
}

/**
 * Template **CRUD** notifications — created, renamed, copied, deleted.
 *
 * Its own frame rather than a reuse of `lookListChanged`, mirroring the backend's two signals, and
 * for the same reason: the two invalidate different caches, so one message would make every Look
 * edit re-read the template library and vice versa.
 *
 * Deliberately **not** fired when a template's contents change — the same rule `looksWsApi` states.
 * A retune republishes every live consumer directly (`republishForTemplateEdit`) and publishes
 * `provenanceState`, which the programmer API already turns into a debounced state re-read; that is
 * what moves resolved values on screen. Firing this per keystroke of a colour drag would be an
 * invalidation storm behind an open editor.
 */
export function createTemplatesWsApi(conn: InternalApiConnection): TemplatesWsApi {
  const templatesChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      templatesChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: TemplateInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'templateListChanged') {
        templatesChanged.notify()
      }
    }
  })

  return templatesChanged.api
}
