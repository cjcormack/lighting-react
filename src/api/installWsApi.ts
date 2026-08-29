import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

// The install row — currently just the desk's friendly name — changed on another client.
// Machine-scoped like the user list, so it arrives from `State.machineEventsFlow` rather than
// the per-project fixtures bus.
export interface InstallWsApi {
  subscribe(fn: () => void): Subscription
}

type InstallInMessage = {
  type: 'installChanged'
}

export function createInstallWsApi(conn: InternalApiConnection): InstallWsApi {
  const installChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'message' && ev instanceof MessageEvent) {
      const message: InstallInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'installChanged') {
        installChanged.notify()
      }
    }
  })

  return installChanged.api
}
