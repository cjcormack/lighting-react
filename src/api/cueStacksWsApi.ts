import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import type { ProgramStateChangedEvent } from './cueStacksApi'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface CueStacksWsApi {
  /** The stack collection changed (create/rename/delete/reorder/separator/order). */
  subscribe(fn: () => void): Subscription
  /** The project playhead moved (activate/deactivate/advance/go-to). */
  subscribeToProgramState(fn: (event: ProgramStateChangedEvent) => void): Subscription
}

type CueStackInMessage =
  | { type: 'cueStackListChanged' }
  | { type: 'showChanged'; projectId: number; activeStackId: number | null; activeStackName: string | null }

export function createCueStacksWsApi(conn: InternalApiConnection): CueStacksWsApi {
  const cueStacksChanged = createWsSubscribable<void>()
  const programStateChanged = createWsSubscribable<ProgramStateChangedEvent>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      cueStacksChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: CueStackInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'cueStackListChanged') {
        cueStacksChanged.notify()
      } else if (message.type === 'showChanged') {
        programStateChanged.notify({
          projectId: message.projectId,
          activeStackId: message.activeStackId,
          activeStackName: message.activeStackName,
        })
      }
    }
  })

  return {
    subscribe: cueStacksChanged.api.subscribe,
    subscribeToProgramState: programStateChanged.api.subscribe,
  }
}
