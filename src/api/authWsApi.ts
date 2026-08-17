import { InternalApiConnection, InternalEventType, UNAUTHENTICATED_CLOSE_CODE } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

// The socket's half of the auth story. The backend accepts the `/api` upgrade and
// then closes it with code 4401 when there is no valid session, so a dead session
// shows up here as a close code rather than as a failed request.
//
// This is deliberately its own namespace rather than a widening of `StatusApi`:
// statusApi exposes the transport state (CONNECTING/OPEN/CLOSING/CLOSED) and is
// consumed broadly — folding an application-level auth signal into that enum would
// push a case onto every consumer that has no interest in it.
export interface AuthWsApi {
  /** Fires when the server rejected our session on the socket. */
  subscribeUnauthenticated(fn: () => void): Subscription
}

export function createAuthWsApi(conn: InternalApiConnection): AuthWsApi {
  const unauthenticated = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (
      evType === InternalEventType.close &&
      ev instanceof CloseEvent &&
      ev.code === UNAUTHENTICATED_CLOSE_CODE
    ) {
      unauthenticated.notify()
    }
  })

  return {
    subscribeUnauthenticated: unauthenticated.api.subscribe,
  }
}
