import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface PalettesWsApi {
  subscribe(fn: () => void): Subscription
}

type PaletteInMessage = {
  type: 'paletteListChanged'
}

/**
 * Palette **CRUD** notifications — created, renamed, deleted.
 *
 * Deliberately not fired when a palette's *contents* change: this drives RTK Query cache
 * invalidation, so emitting it per resolution would be an invalidation storm behind an open sheet.
 * A contents change publishes `provenanceState` instead, which the programmer API already turns
 * into a debounced `programmer.state` re-read — that is what refreshes resolved reference values.
 */
export function createPalettesWsApi(conn: InternalApiConnection): PalettesWsApi {
  const palettesChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      palettesChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: PaletteInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'paletteListChanged') {
        palettesChanged.notify()
      }
    }
  })

  return palettesChanged.api
}
