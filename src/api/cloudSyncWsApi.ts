import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'
import type { SyncErrorCode, SyncLogEntry, SyncOutcome } from '../store/cloudSync'

/**
 * Cloud-sync lifecycle messages. The backend emits exactly one Started → one
 * Done-or-Failed-or-ConflictsPending per `POST /sync/run` invocation, and Started → Done
 * per `POST /sync/apply`. The page uses these to trigger toast + cache-invalidation;
 * we don't render a streaming progress bar yet (single done/fail is enough for the
 * data volumes we support — revisit if syncs ever feel slow).
 */
export interface CloudSyncWsApi {
  subscribeStarted(fn: (event: CloudSyncStartedEvent) => void): Subscription
  subscribeDone(fn: (event: CloudSyncDoneEvent) => void): Subscription
  subscribeFailed(fn: (event: CloudSyncFailedEvent) => void): Subscription
  /**
   * Phase 5: same-record edits surfaced as a conflict-resolution session. The frontend
   * reacts by fetching `/sync/conflicts` so the new `<ConflictPanel>` shows up. Distinct
   * from `subscribeDone` because a conflicting run never emits Done — it stops at
   * CONFLICTS_PENDING and waits for resolve+apply.
   */
  subscribeConflictsPending(fn: (event: CloudSyncConflictsPendingEvent) => void): Subscription
  /**
   * GitHub OAuth identity changed (connected, disconnected, or refreshed). The sync
   * configuration page invalidates the identity cache so the "Connected as @login"
   * row updates without polling.
   */
  subscribeOAuthIdentityChanged(fn: (event: OAuthIdentityChangedEvent) => void): Subscription
  /**
   * Phase 8: a single activity-log row was just persisted. The activity feed appends
   * the entry without round-tripping `/sync/activity`.
   */
  subscribeLogAppended(fn: (event: CloudSyncLogAppendedEvent) => void): Subscription
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

export interface CloudSyncConflictsPendingEvent {
  projectId: number
  sessionId: number
  conflictCount: number
}

export interface CloudSyncLogAppendedEvent {
  projectId: number
  entry: SyncLogEntry
}

export interface OAuthIdentityChangedEvent {
  provider: string
  connected: boolean
  login?: string | null
  accessExpiresAtMs?: number | null
  refreshExpiresAtMs?: number | null
}

type CloudSyncInMessage =
  | { type: 'cloudSyncStarted' } & CloudSyncStartedEvent
  | { type: 'cloudSyncDone' } & CloudSyncDoneEvent
  | { type: 'cloudSyncFailed' } & CloudSyncFailedEvent
  | { type: 'cloudSyncConflictsPending' } & CloudSyncConflictsPendingEvent
  | { type: 'cloudSyncLogAppended' } & CloudSyncLogAppendedEvent
  | { type: 'oauthIdentityChanged' } & OAuthIdentityChangedEvent

export function createCloudSyncWsApi(conn: InternalApiConnection): CloudSyncWsApi {
  const started = createWsSubscribable<CloudSyncStartedEvent>()
  const done = createWsSubscribable<CloudSyncDoneEvent>()
  const failed = createWsSubscribable<CloudSyncFailedEvent>()
  const conflictsPending = createWsSubscribable<CloudSyncConflictsPendingEvent>()
  const logAppended = createWsSubscribable<CloudSyncLogAppendedEvent>()
  const oauthIdentityChanged = createWsSubscribable<OAuthIdentityChangedEvent>()

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
      case 'cloudSyncConflictsPending':
        conflictsPending.notify(message)
        break
      case 'cloudSyncLogAppended':
        logAppended.notify(message)
        break
      case 'oauthIdentityChanged':
        oauthIdentityChanged.notify(message)
        break
    }
  })

  return {
    subscribeStarted: started.api.subscribe,
    subscribeDone: done.api.subscribe,
    subscribeFailed: failed.api.subscribe,
    subscribeConflictsPending: conflictsPending.api.subscribe,
    subscribeLogAppended: logAppended.api.subscribe,
    subscribeOAuthIdentityChanged: oauthIdentityChanged.api.subscribe,
  }
}
