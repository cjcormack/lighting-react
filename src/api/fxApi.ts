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
}

export interface FxState {
  bpm: number
  isClockRunning: boolean
  activeEffects: FxEffectState[]
}

export interface BeatSync {
  beatNumber: number
  bpm: number
  timestampMs: number
}

type FxMessage =
  | { type: 'fxState'; bpm: number; isClockRunning: boolean; activeEffects: FxEffectState[] }
  | { type: 'beatSync'; beatNumber: number; bpm: number; timestampMs: number }
  | { type: 'fxChanged'; changeType: string; effectId?: number }

// === API Interface ===

export interface FxApi {
  get(): FxState
  subscribe(fn: (state: FxState) => void): Subscription
  subscribeToBeat(fn: (beat: BeatSync) => void): Subscription
  requestBeatSync(): void
  setBpm(bpm: number): void
  tap(): void
}

export function createFxApi(conn: InternalApiConnection): FxApi {
  let nextSubscriptionId = 1
  const stateSubscriptions = new Map<number, (state: FxState) => void>()
  const beatSubscriptions = new Map<number, (beat: BeatSync) => void>()

  let currentState: FxState = {
    bpm: 120,
    isClockRunning: false,
    activeEffects: [],
  }

  const notifyState = (state: FxState) => {
    stateSubscriptions.forEach((fn) => fn(state))
  }

  const notifyBeat = (beat: BeatSync) => {
    beatSubscriptions.forEach((fn) => fn(beat))
  }

  conn.subscribe((evType, ev) => {
    if (evType === InternalEventType.message && ev instanceof MessageEvent) {
      const message: FxMessage = JSON.parse(ev.data)
      if (message == null) return

      if (message.type === 'fxState') {
        currentState = {
          bpm: message.bpm,
          isClockRunning: message.isClockRunning,
          activeEffects: message.activeEffects,
        }
        notifyState(currentState)
      } else if (message.type === 'beatSync') {
        // Update BPM from beat sync (always reflects the latest tempo)
        if (currentState.bpm !== message.bpm) {
          currentState = { ...currentState, bpm: message.bpm }
          notifyState(currentState)
        }
        notifyBeat({
          beatNumber: message.beatNumber,
          bpm: message.bpm,
          timestampMs: message.timestampMs,
        })
      } else if (message.type === 'fxChanged') {
        // Re-request full state to get updated effect list
        conn.send(JSON.stringify({ type: 'fxState' }))
      }
    } else if (evType === 'open') {
      // Request initial FX state and beat sync on connection
      conn.send(JSON.stringify({ type: 'fxState' }))
      conn.send(JSON.stringify({ type: 'requestBeatSync' }))
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

    subscribeToBeat(fn: (beat: BeatSync) => void): Subscription {
      const thisId = nextSubscriptionId++
      beatSubscriptions.set(thisId, fn)
      return {
        unsubscribe: () => {
          beatSubscriptions.delete(thisId)
        },
      }
    },

    requestBeatSync(): void {
      conn.send(JSON.stringify({ type: 'requestBeatSync' }))
    },

    setBpm(bpm: number): void {
      conn.send(JSON.stringify({ type: 'setFxBpm', bpm }))
    },

    tap(): void {
      conn.send(JSON.stringify({ type: 'tapTempo' }))
    },
  }
}
