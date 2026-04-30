import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'
import type { SyncErrorCode, SyncOutcome } from '../store/cloudSync'

/**
 * Cloud-sync lifecycle messages (phase 4). The backend emits exactly one Started → one
 * Done-or-Failed per `POST /sync/run` invocation. The page uses these to trigger toast
 * + cache-invalidation; we don't render a streaming progress bar yet (single done/fail
 * is enough for the data volumes we support — revisit if syncs ever feel slow).
 */
export interface CloudSyncWsApi {
  subscribeStarted(fn: (event: CloudSyncStartedEvent) => void): Subscription
  subscribeDone(fn: (event: CloudSyncDoneEvent) => void): Subscription
  subscribeFailed(fn: (event: CloudSyncFailedEvent) => void): Subscription
}

export interface CloudSyncStartedEvent {
  projectId: number
}

export interface CloudSyncDoneEvent {
  projectId: number
  outcome: SyncOutcome
  headSha: string
  pushed: number
  pulled: number
  replaced: number
  message: string
}

export interface CloudSyncFailedEvent {
  projectId: number
  errorCode: SyncErrorCode
  message: string
}

type CloudSyncInMessage =
  | { type: 'cloudSyncStarted' } & CloudSyncStartedEvent
  | { type: 'cloudSyncDone' } & CloudSyncDoneEvent
  | { type: 'cloudSyncFailed' } & CloudSyncFailedEvent

export function createCloudSyncWsApi(conn: InternalApiConnection): CloudSyncWsApi {
  const started = createWsSubscribable<CloudSyncStartedEvent>()
  const done = createWsSubscribable<CloudSyncDoneEvent>()
  const failed = createWsSubscribable<CloudSyncFailedEvent>()

  conn.subscribe((evType, ev) => {
    if (evType !== 'message' || !(ev instanceof MessageEvent)) return
    const message: CloudSyncInMessage = JSON.parse(ev.data)
    if (message == null) return
    switch (message.type) {
      case 'cloudSyncStarted':
        started.notify(message)
        break
      case 'cloudSyncDone':
        done.notify(message)
        break
      case 'cloudSyncFailed':
        failed.notify(message)
        break
    }
  })

  return {
    subscribeStarted: started.api.subscribe,
    subscribeDone: done.api.subscribe,
    subscribeFailed: failed.api.subscribe,
  }
}
