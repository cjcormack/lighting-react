import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

/**
 * `busk.layoutChanged {pageIds}` — the busk layout of those pages changed.
 *
 * Hand-written rather than built on `createChangeSignalApi`, because the frame **carries a body**
 * and that factory's own docblock says it is the wrong tool the moment a bridge needs one. The ids
 * matter here: `store/busk.ts` invalidates exactly those pages, and suppresses the echo of its own
 * write, both of which need to read them.
 *
 * Fires for page CRUD and reorder, for every whole-page layout write — **including this client's
 * own** — and for a template / Look / cue / cue-stack delete that took pads off a page. On a page
 * delete it carries the deleted id *plus every survivor*, because their `sortOrder` moved.
 */
export interface BuskWsApi {
  subscribe(fn: (pageIds: number[]) => void): Subscription
}

interface BuskLayoutChangedMessage {
  type: 'busk.layoutChanged'
  pageIds: number[]
}

export function createBuskWsApi(conn: InternalApiConnection): BuskWsApi {
  const layoutChanged = createWsSubscribable<number[]>()

  conn.subscribe((evType, _ev, frame) => {
    if (evType !== 'message') return
    const message = frame as BuskLayoutChangedMessage | null
    if (message?.type !== 'busk.layoutChanged') return
    layoutChanged.notify(message.pageIds ?? [])
  })

  return { subscribe: layoutChanged.api.subscribe }
}
