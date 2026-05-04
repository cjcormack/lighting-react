import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface RiggingDto {
  id: number;
  uuid: string;
  name: string;
  kind: string | null;
  positionX: number | null;
  positionY: number | null;
  positionZ: number | null;
  yawDeg: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  lengthM: number | null;
  sortOrder: number;
}

export interface CreateRiggingRequest {
  name: string;
  kind?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  positionZ?: number | null;
  yawDeg?: number | null;
  pitchDeg?: number | null;
  rollDeg?: number | null;
  lengthM?: number | null;
}

export interface UpdateRiggingRequest {
  name?: string;
  kind?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  positionZ?: number | null;
  yawDeg?: number | null;
  pitchDeg?: number | null;
  rollDeg?: number | null;
  lengthM?: number | null;
  sortOrder?: number;
}

export interface RiggingApi {
  subscribe(fn: () => void): Subscription;
}

type RiggingInMessage = {
  type: 'riggingListChanged'
}

export function createRiggingApi(conn: InternalApiConnection): RiggingApi {
  const riggingsChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      riggingsChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: RiggingInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'riggingListChanged') {
        riggingsChanged.notify()
      }
    }
  })

  return riggingsChanged.api
}
