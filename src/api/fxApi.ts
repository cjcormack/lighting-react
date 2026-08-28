import { InternalApiConnection, InternalEventType } from './internalApi'
import { Subscription } from './subscription'

// === Types ===

export interface FxEffectState {
  id: number
  effectType: string
  targetKey: string
  isRunning: boolean
  phase: number
  blendMode: string
  cueId: number | null
  cueStackId: number | null
  timingSource?: string
  /** Speed master this effect subscribes to (null → master 1). */
  speedMasterUuid?: string | null
  /** Wall-clock rate master (null → unscaled); only WALL_CLOCK effects read it. */
  rateSpeedMasterUuid?: string | null
  /** 1-based display index of that master — what the FX-sheet chip renders. */
  speedMasterIndex?: number
}

/**
 * The active-effect list. Carries no tempo: it used to report master 1's bpm because it
 * predates the speed-master bank — tempo now lives on the `speedMasters.*` family, per
 * master (see `store/speedMasters.ts`).
 */
export interface FxState {
  activeEffects: FxEffectState[]
}

type FxMessage =
  | { type: 'fxState'; activeEffects: FxEffectState[] }
  | { type: 'fxChanged'; changeType: string; effectId?: number }

// === API Interface ===

export interface FxApi {
  get(): FxState
  subscribe(fn: (state: FxState) => void): Subscription
}

export function createFxApi(conn: InternalApiConnection): FxApi {
  let nextSubscriptionId = 1
  const stateSubscriptions = new Map<number, (state: FxState) => void>()

  let currentState: FxState = { activeEffects: [] }

  const notifyState = (state: FxState) => {
    stateSubscriptions.forEach((fn) => fn(state))
  }

  conn.subscribe((evType, ev) => {
    if (evType === InternalEventType.message && ev instanceof MessageEvent) {
      const message: FxMessage = JSON.parse(ev.data)
      if (message == null) return

      if (message.type === 'fxState') {
        currentState = { activeEffects: message.activeEffects }
        notifyState(currentState)
      } else if (message.type === 'fxChanged') {
        // Re-request full state to get updated effect list
        conn.send(JSON.stringify({ type: 'fxState' }))
      }
    }
  })

  return {
    get(): FxState {
      return currentState
    },

    subscribe(fn: (state: FxState) => void): Subscription {
      const thisId = nextSubscriptionId++
      stateSubscriptions.set(thisId, fn)
      return {
        unsubscribe: () => {
          stateSubscriptions.delete(thisId)
        },
      }
    },
  }
}
