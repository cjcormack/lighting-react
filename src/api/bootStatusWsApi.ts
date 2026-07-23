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
  // the pushed payload. We also fire on (re)connect: after a backend restart the
  // poll has stopped (show was ready), so `open` is what re-checks readiness and
  // re-shows the gate if the backend came back up mid-warm-up.
  const bootProgress = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      bootProgress.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: BootStatusInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'bootProgressState') {
        bootProgress.notify()
      }
    }
  })

  return bootProgress.api
}
