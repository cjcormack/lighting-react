import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

// Desk-account changes made by *another* client. Users are machine-scoped rather than
// show-scoped, so the backend sends this from its own flow (`AuthService.userChanges` via
// `plugins/MachineSocket.kt`) instead of the per-project fixtures bus every other list rides.
//
// Payload-free by design: the frame says "refetch", not what changed. These sockets are open to
// operators while `/api/rest/users` is admin-only, so anything in the body would leak what that
// gate withholds.
//
// The *own-account* half of the same backend flow deliberately lives in `authWsApi` — it
// invalidates `Auth`, which belongs to the auth story, not to the user list.
export interface UsersWsApi {
  subscribe(fn: () => void): Subscription
}

type UserInMessage = {
  type: 'userListChanged'
}

export function createUsersWsApi(conn: InternalApiConnection): UsersWsApi {
  const usersChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      usersChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: UserInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'userListChanged') {
        usersChanged.notify()
      }
    }
  })

  return usersChanged.api
}
