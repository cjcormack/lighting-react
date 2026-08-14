import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

/** One master's live state, as streamed by `speedMasters.state` / `speedMasters.changed`. */
export interface SpeedMasterLiveState {
  /** Null only for the synthetic pre-load master 1 (mid-boot). */
  uuid: string | null
  /** 1-based display index; 1 is the global master. */
  index: number
  name: string
  bpm: number
  isRunning: boolean
  /** How the tempo was last set — display only. */
  source: 'MANUAL' | 'TAP'
}

export interface SpeedMastersWsApi {
  /**
   * CRUD notifications — created, renamed, deleted. Drives RTK Query cache invalidation.
   * Deliberately never fired per tempo change (that would be an invalidation storm behind
   * a tap button); live BPM arrives via [subscribe] instead.
   */
  subscribeList(fn: () => void): Subscription
  /** Live bank pushes — the full masters array after every state frame or tempo change. */
  subscribe(fn: (masters: SpeedMasterLiveState[]) => void): Subscription
  /** Latest known bank, slot order (master 1 first). Empty before the first state frame. */
  getState(): SpeedMasterLiveState[]
  /** Set one master's BPM (null uuid → master 1). Fire-and-forget, like `setFxBpm`. */
  setBpm(masterUuid: string | null, bpm: number): void
  /** Tap one master's tempo (null uuid → master 1). */
  tap(masterUuid: string | null): void
}

type SpeedMasterInMessage =
  | { type: 'speedMasters.state'; masters: SpeedMasterLiveState[] }
  | {
      type: 'speedMasters.changed'
      masterUuid: string | null
      index: number
      bpm: number
      source: 'MANUAL' | 'TAP'
      timestampMs: number
    }
  | { type: 'speedMasterListChanged' }

export function createSpeedMastersWsApi(conn: InternalApiConnection): SpeedMastersWsApi {
  const listChanged = createWsSubscribable<void>()
  const stateChanged = createWsSubscribable<SpeedMasterLiveState[]>()

  let masters: SpeedMasterLiveState[] = []

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      // The server also sends a state frame in its connect burst; requesting one here as
      // well covers reconnects racing that burst, and the duplicate is one small frame.
      conn.send(JSON.stringify({ type: 'speedMasters.state' }))
      listChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      // Fast-path: skip JSON.parse for the torrent of unrelated frames.
      if (typeof ev.data === 'string' && !ev.data.includes('"speedMaster')) return
      const message: SpeedMasterInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'speedMasters.state') {
        masters = message.masters
        stateChanged.notify(masters)
      } else if (message.type === 'speedMasters.changed') {
        // Patch the one master in place; identity of untouched members is preserved so
        // field-wise cache writes downstream stay cheap.
        masters = masters.map((m) =>
          m.uuid === message.masterUuid
            ? { ...m, bpm: message.bpm, source: message.source }
            : m,
        )
        stateChanged.notify(masters)
      } else if (message.type === 'speedMasterListChanged') {
        // Membership changed — re-request the live bank alongside the REST invalidation,
        // since the server does not push a state frame on CRUD.
        conn.send(JSON.stringify({ type: 'speedMasters.state' }))
        listChanged.notify()
      }
    }
  })

  return {
    subscribeList: listChanged.api.subscribe,
    subscribe: stateChanged.api.subscribe,
    getState: () => masters,
    setBpm(masterUuid, bpm) {
      conn.send(
        JSON.stringify({ type: 'speedMasters.setBpm', masterUuid: masterUuid ?? undefined, bpm }),
      )
    },
    tap(masterUuid) {
      conn.send(
        JSON.stringify({ type: 'speedMasters.tap', masterUuid: masterUuid ?? undefined }),
      )
    },
  }
}
