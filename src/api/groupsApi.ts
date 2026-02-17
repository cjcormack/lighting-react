import { InternalApiConnection } from "./internalApi"
import { Subscription } from "./subscription"
import type { ChannelRef } from '../store/fixtures'

// === Types ===

export interface GroupSummary {
  name: string
  memberCount: number
  capabilities: string[]
  symmetricMode: string
  defaultDistribution: string
}

export interface GroupMember {
  fixtureKey: string
  fixtureName: string
  index: number
  normalizedPosition: number
  panOffset: number
  tiltOffset: number
  symmetricInvert: boolean
  tags: string[]
}

export interface GroupDetail extends GroupSummary {
  members: GroupMember[]
}

export type BlendMode = 'OVERRIDE' | 'ADDITIVE' | 'MULTIPLY' | 'MAX' | 'MIN'

export type ElementMode = 'PER_FIXTURE' | 'FLAT'

export type DistributionStrategy =
  | 'LINEAR'
  | 'UNIFIED'
  | 'CENTER_OUT'
  | 'EDGES_IN'
  | 'REVERSE'
  | 'SPLIT'
  | 'PING_PONG'
  | 'RANDOM'
  | 'POSITIONAL'

export type DimmerEffectType =
  | 'sinewave'
  | 'pulse'
  | 'rampup'
  | 'rampdown'
  | 'triangle'
  | 'squarewave'
  | 'strobe'
  | 'flicker'
  | 'breathe'

export type ColourEffectType =
  | 'rainbowcycle'
  | 'colourstrobe'
  | 'colourpulse'
  | 'colourfade'
  | 'colourflicker'

export type PositionEffectType =
  | 'circle'
  | 'figure8'
  | 'sweep'
  | 'pansweep'
  | 'tiltsweep'
  | 'randomposition'

export type EffectType = DimmerEffectType | ColourEffectType | PositionEffectType

export interface ApplyFxRequest {
  effectType: EffectType
  propertyName: string
  beatDivision: number
  blendMode: BlendMode
  distribution: DistributionStrategy
  phaseOffset: number
  parameters: Record<string, string>
  elementMode?: ElementMode
}

export interface ApplyFxResponse {
  effectId: number
}

export interface GroupActiveEffect {
  id: number
  effectType: string
  propertyName: string
  beatDivision: number
  blendMode: BlendMode
  distribution: DistributionStrategy
  isRunning: boolean
  phaseOffset: number
  currentPhase: number
  parameters: Record<string, string>
  elementMode: ElementMode | null
  presetId: number | null
}

export interface ClearFxResponse {
  removedCount: number
}

// === Group Property Types ===

export type GroupPropertyDescriptor =
  | GroupSliderPropertyDescriptor
  | GroupColourPropertyDescriptor
  | GroupPositionPropertyDescriptor
  | GroupSettingPropertyDescriptor

export interface GroupSliderPropertyDescriptor {
  type: 'slider'
  name: string
  displayName: string
  category: string
  min: number
  max: number
  memberChannels: ChannelRef[]
}

export interface MemberColourChannels {
  fixtureKey: string
  redChannel: ChannelRef
  greenChannel: ChannelRef
  blueChannel: ChannelRef
  whiteChannel?: ChannelRef
  amberChannel?: ChannelRef
  uvChannel?: ChannelRef
}

export interface GroupColourPropertyDescriptor {
  type: 'colour'
  name: string
  displayName: string
  category: 'colour'
  memberColourChannels: MemberColourChannels[]
}

export interface MemberPositionChannels {
  fixtureKey: string
  panChannel: ChannelRef
  tiltChannel: ChannelRef
  panMin: number
  panMax: number
  tiltMin: number
  tiltMax: number
}

export interface GroupPositionPropertyDescriptor {
  type: 'position'
  name: string
  displayName: string
  category: 'position'
  memberPositionChannels: MemberPositionChannels[]
}

export interface MemberSettingChannel {
  fixtureKey: string
  channel: ChannelRef
}

export interface SettingOption {
  name: string
  level: number
  displayName: string
  colourPreview?: string
}

export interface GroupSettingPropertyDescriptor {
  type: 'setting'
  name: string
  displayName: string
  category: string
  options: SettingOption[]
  memberChannels: MemberSettingChannel[]
}

// === WebSocket Message Types ===

type GroupsInMessage =
  | { type: 'groupsState'; groups: GroupSummary[] }
  | { type: 'groupFxAdded'; groupName: string; effectId: number }
  | { type: 'groupFxCleared'; groupName: string; removedCount: number }

// === API Interface ===

export interface GroupsApi {
  subscribe(fn: () => void): Subscription
  subscribeToGroup(name: string, fn: (data: GroupDetail) => void): Subscription
  addFx(groupName: string, request: ApplyFxRequest): void
  clearFx(groupName: string): void
}

export function createGroupsApi(conn: InternalApiConnection): GroupsApi {
  let nextSubscriptionId = 1
  const listSubscriptions = new Map<number, () => void>()
  const itemSubscriptions = new Map<string, Map<number, (data: GroupDetail) => void>>()

  const notifyListChange = () => {
    listSubscriptions.forEach((fn) => {
      fn()
    })
  }

  const notifyChange = (groupName: string, data: GroupDetail) => {
    itemSubscriptions.get(groupName)?.forEach((fn) => {
      fn(data)
    })
  }

  const handleOnOpen = () => {
    notifyListChange()
  }

  const handleOnMessage = (ev: MessageEvent) => {
    const message: GroupsInMessage = JSON.parse(ev.data)

    if (message == null) {
      return
    }

    if (message.type === 'groupsState') {
      notifyListChange()
    } else if (message.type === 'groupFxAdded' || message.type === 'groupFxCleared') {
      // Trigger a refetch for the affected group
      notifyListChange()
    }
  }

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      handleOnOpen()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      handleOnMessage(ev)
    }
  })

  return {
    subscribe(fn: () => void): Subscription {
      const thisId = nextSubscriptionId
      nextSubscriptionId++

      listSubscriptions.set(thisId, fn)

      return {
        unsubscribe: () => {
          listSubscriptions.delete(thisId)
        },
      }
    },

    subscribeToGroup(name: string, fn: (data: GroupDetail) => void): Subscription {
      const thisId = nextSubscriptionId
      nextSubscriptionId++

      let groupMap = itemSubscriptions.get(name)
      if (!groupMap) {
        groupMap = new Map<number, (data: GroupDetail) => void>()
        itemSubscriptions.set(name, groupMap)
      }

      groupMap.set(thisId, fn)

      return {
        unsubscribe: () => {
          groupMap.delete(thisId)
        },
      }
    },

    addFx(groupName: string, request: ApplyFxRequest): void {
      conn.send(
        JSON.stringify({
          type: 'addGroupFx',
          groupName,
          ...request,
        })
      )
    },

    clearFx(groupName: string): void {
      conn.send(
        JSON.stringify({
          type: 'clearGroupFx',
          groupName,
        })
      )
    },
  }
}
