import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'
import { sendGesture } from './wsGesture'

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

/** One master crossing a beat boundary, as streamed by `speedMasters.beat`. */
export interface SpeedMasterBeat {
  /**
   * The master's uuid — master 1 included. Null ONLY for the synthetic pre-load master 1,
   * the same rule as `SpeedMasterLiveState.uuid`; this is *not* the write messages'
   * null-means-master-1 convention, so a subscriber standing in for master 1 has to resolve
   * its real uuid (`useMaster1Uuid`) rather than pass null.
   */
  masterUuid: string | null
  index: number
  beatNumber: number
  bpm: number
  timestampMs: number
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
  /**
   * Beat boundaries for **one** master, addressed by the uuid its frames carry (see
   * [SpeedMasterBeat.masterUuid] — for master 1 that is its real uuid, not null). Keyed so an
   * indicator beside a master-2 effect pulses at master 2's tempo.
   *
   * Server frames are throttled (every 16 beats), so subscribers are expected to free-run a
   * local timer in between and use these to correct drift. Subscribing sends a `requestBeat`
   * so a freshly-mounted indicator locks phase promptly instead of waiting out the throttle.
   */
  subscribeBeat(masterUuid: string | null, fn: (beat: SpeedMasterBeat) => void): Subscription
  /**
   * Ask for one immediate beat frame without re-subscribing. For a subscriber that knows its
   * local timer has gone stale — a backgrounded tab, whose interval drifted while it was
   * hidden — but whose subscription is still perfectly good.
   */
  requestBeat(masterUuid: string | null): void
  /** Set one master's BPM (null uuid → master 1). Fire-and-forget. */
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
  | ({ type: 'speedMasters.beat' } & SpeedMasterBeat)
  | { type: 'speedMasters.listChanged' }

export function createSpeedMastersWsApi(conn: InternalApiConnection): SpeedMastersWsApi {
  const listChanged = createWsSubscribable<void>()
  const stateChanged = createWsSubscribable<SpeedMasterLiveState[]>()

  // One subscribable per master rather than one shared stream that every indicator filters:
  // a bank of four masters at 120 BPM is a steady trickle of frames, and waking every
  // indicator on every master's beat only to discard it is exactly the re-render pattern
  // `useSpeedMasterDisplay`'s selectFromResult exists to avoid.
  const beatByMaster = new Map<string, ReturnType<typeof createWsSubscribable<SpeedMasterBeat>>>()
  /** Only reachable before the bank has loaded — after that master 1 keys by its real uuid. */
  const MASTER_1_KEY = ''
  const beatKey = (masterUuid: string | null) => masterUuid ?? MASTER_1_KEY

  /** Ask for an immediate beat frame for each key — `''` sends an omitted uuid (master 1). */
  const requestBeatsFor = (keys: Iterable<string>) => {
    for (const key of keys) {
      conn.send(
        JSON.stringify({
          type: 'speedMasters.requestBeat',
          masterUuid: key === MASTER_1_KEY ? undefined : key,
        }),
      )
    }
  }

  let masters: SpeedMasterLiveState[] = []

  conn.subscribe((evType, _ev, frame) => {
    if (evType === 'open') {
      // Beat requests are one-shot and live on the server's per-connection scope, so a
      // reconnect loses every pending one. Without re-asking, an indicator keeps free-
      // running its local timer at the pre-drop tempo until the next throttled frame —
      // up to 16 beats later, and at the wrong rate if the tempo moved meanwhile. That
      // is the *only* thing this branch owes: no `speedMasters.state` request (the server
      // pushes one per connection, a reconnect included) and no `listChanged` notify (the
      // reconnect resync in `store/status.ts` invalidates `SpeedMaster`/`SpeedMasterList`
      // with every other tag).
      requestBeatsFor(beatByMaster.keys())
    } else if (evType === 'message') {
      // The connection parses each frame once for every bridge, so the substring
      // pre-filter this used to run against the torrent of unrelated frames has
      // nothing left to save: discriminate on the parsed `type` instead.
      const message = frame as SpeedMasterInMessage | null
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
      } else if (message.type === 'speedMasters.beat') {
        beatByMaster.get(beatKey(message.masterUuid))?.notify(message)
      } else if (message.type === 'speedMasters.listChanged') {
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
    subscribeBeat(masterUuid, fn) {
      const key = beatKey(masterUuid)
      let entry = beatByMaster.get(key)
      if (entry == null) {
        entry = createWsSubscribable<SpeedMasterBeat>()
        beatByMaster.set(key, entry)
      }
      const subscription = entry.api.subscribe(fn)
      requestBeatsFor([key])
      return subscription
    },
    requestBeat(masterUuid) {
      requestBeatsFor([beatKey(masterUuid)])
    },
    setBpm(masterUuid, bpm) {
      sendGesture(conn, { type: 'speedMasters.setBpm', masterUuid: masterUuid ?? undefined, bpm })
    },
    tap(masterUuid) {
      sendGesture(conn, { type: 'speedMasters.tap', masterUuid: masterUuid ?? undefined })
    },
  }
}
