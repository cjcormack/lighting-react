import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface FxPresetsWsApi {
  subscribe(fn: () => void): Subscription
}

type PresetInMessage = {
  type: 'presetListChanged'
}

export function createFxPresetsWsApi(conn: InternalApiConnection): FxPresetsWsApi {
  const presetsChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      presetsChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: PresetInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'presetListChanged') {
        presetsChanged.notify()
      }
    }
  })

  return presetsChanged.api
}
