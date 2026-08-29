import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

// Backend "server-first" boot contract. The web server comes up immediately and
// serves this frontend, then initialises the show (FX compile, fixtures, cue
// pre-warm, mDNS) in the background. Until `ready` is true the rig isn't live and
// show-dependent REST routes return HTTP 503.
export type BootPhase =
  | 'STARTING'
  | 'SHOW_INIT'
  | 'FX_COMPILE'
  | 'FIXTURES'
  | 'CUE_PREWARM'
  | 'READY'
  | 'FAILED'

export interface BootStatus {
  phase: BootPhase
  message: string // human-readable, e.g. "Compiling effects (12/28)…"
  percent: number // 0..100, monotonically increasing
  ready: boolean // true only once the show is fully started
  error: string | null // set when phase === 'FAILED'
}

export interface BootStatusWsApi {
  subscribe(fn: () => void): Subscription
}

type BootStatusInMessage = {
  type: 'bootProgressState'
  status: BootStatus
}

export function createBootStatusWsApi(conn: InternalApiConnection): BootStatusWsApi {
  // Fires whenever the boot status may have changed. The consumer refetches the
  // authoritative `/api/rest/status` on each notification, so we don't forward
  // the pushed payload. Deliberately no `open` branch: re-checking readiness after a
  // backend restart (when the poll has stopped because the show was ready) is one case
  // of the reconnect resync in `store/status.ts`, which invalidates `BootStatus` along
  // with every other tag. A branch here would only fire the same refetch twice.
  const bootProgress = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'message' && ev instanceof MessageEvent) {
      const message: BootStatusInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'bootProgressState') {
        bootProgress.notify()
      }
    }
  })

  return bootProgress.api
}
