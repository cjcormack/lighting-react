import { InternalApiConnection } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export interface StageRegionDto {
  id: number;
  uuid: string;
  name: string;
  centerX: number | null;
  centerY: number | null;
  centerZ: number | null;
  widthM: number | null;
  depthM: number | null;
  heightM: number | null;
  yawDeg: number | null;
  sortOrder: number;
}

export interface CreateStageRegionRequest {
  name: string;
  centerX?: number | null;
  centerY?: number | null;
  centerZ?: number | null;
  widthM?: number | null;
  depthM?: number | null;
  heightM?: number | null;
  yawDeg?: number | null;
}

export interface UpdateStageRegionRequest {
  name?: string;
  centerX?: number | null;
  centerY?: number | null;
  centerZ?: number | null;
  widthM?: number | null;
  depthM?: number | null;
  heightM?: number | null;
  yawDeg?: number | null;
  sortOrder?: number;
}

export interface StageRegionApi {
  subscribe(fn: () => void): Subscription;
}

type StageRegionInMessage = {
  type: 'stageRegionListChanged'
}

export function createStageRegionApi(conn: InternalApiConnection): StageRegionApi {
  const stageRegionsChanged = createWsSubscribable<void>()

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      stageRegionsChanged.notify()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      const message: StageRegionInMessage = JSON.parse(ev.data)
      if (message == null) return
      if (message.type === 'stageRegionListChanged') {
        stageRegionsChanged.notify()
      }
    }
  })

  return stageRegionsChanged.api
}
