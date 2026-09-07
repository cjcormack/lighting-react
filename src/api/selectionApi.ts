import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'
import { sendGesture } from './wsGesture'
import type { CueTarget } from './cuesApi'

/**
 * The **desk selection** — one selection per project, server-owned and shared by every client,
 * for the reason the programmer is: DMX is one byte per channel, so two selections would force a
 * "whose press wins?" policy nothing expresses. It is transient (cleared on project switch, never
 * persisted) and a target that stops resolving is dropped from it server-side, so no client needs
 * a second rule for that.
 *
 * `selection.state` is both the snapshot on connect and the broadcast on every change — one frame
 * type, because it is a `StateFlow` and a delta frame would carry nothing the whole list doesn't.
 * The three writes get no reply; the state frame is the acknowledgement.
 *
 * A group and one of its members are two separate entries: what the desk holds is what was
 * *said*, and expanding a group to its heads is a question asked later (server-side `coverage()`),
 * not a normalisation done on the way in. That is what lets a select button's LED light for the
 * group rather than for eight loose fixtures.
 */
export interface SelectionWsApi {
  /** The desk selection, in the order targets were added. */
  subscribe(fn: (targets: CueTarget[]) => void): Subscription
  /**
   * The last frame, or null before the first. For a reader that is not a subscriber — an RTK
   * Query `queryFn` seeding its cache entry — the same value without one.
   */
  getState(): CueTarget[] | null

  /** Replace the whole selection. */
  set(targets: CueTarget[]): void
  /** Add the target, or take it off if its heads are already covered. */
  toggle(target: CueTarget): void
  clear(): void
}

interface SelectionStateMessage {
  type: 'selection.state'
  targets: CueTarget[]
}

export function createSelectionWsApi(conn: InternalApiConnection): SelectionWsApi {
  const selection = createWsSubscribable<CueTarget[]>()
  let last: CueTarget[] | null = null

  conn.subscribe((evType, _ev, frame) => {
    if (evType !== 'message') return
    const message = frame as SelectionStateMessage | null
    if (message?.type !== 'selection.state') return
    last = message.targets ?? []
    selection.notify(last)
  })

  return {
    subscribe: (fn) => {
      const sub = selection.api.subscribe(fn)
      if (last != null) fn(last)
      return sub
    },
    getState: () => last,
    set: (targets) => sendGesture(conn, { type: 'selection.set', targets }),
    toggle: (target) => sendGesture(conn, { type: 'selection.toggle', target }),
    clear: () => sendGesture(conn, { type: 'selection.clear' }),
  }
}
