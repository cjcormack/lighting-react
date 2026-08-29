import { Subscription } from "./subscription"
import { InternalApiConnection } from "./internalApi"

export interface ChannelMappingEntry {
  fixtureKey: string
  fixtureName: string
  description: string
}

// Universe -> Channel -> Mapping
export type ChannelMappings = Map<number, Map<number, ChannelMappingEntry>>

export interface ChannelMappingApi {
  getAll(): ChannelMappings
  get(universe: number, channelNo: number): ChannelMappingEntry | undefined
  subscribe(fn: (mappings: ChannelMappings) => void): Subscription
}

type ChannelMappingStateMessage = {
  type: 'channelMappingState'
  mappings: Record<string, Record<string, ChannelMappingEntry>>
}

export function createChannelMappingApi(conn: InternalApiConnection): ChannelMappingApi {
  const currentMappings: ChannelMappings = new Map()

  let nextSubscriptionId = 1
  const subscriptions = new Map<number, (mappings: ChannelMappings) => void>()

  const notifyChange = () => {
    subscriptions.forEach((fn) => fn(currentMappings))
  }

  const handleOnMessage = (message: ChannelMappingStateMessage | null) => {
    if (message?.type !== 'channelMappingState') return

    // Clear and rebuild mappings
    currentMappings.clear()

    for (const [universeStr, channels] of Object.entries(message.mappings)) {
      const universe = parseInt(universeStr)
      const channelMap = new Map<number, ChannelMappingEntry>()

      for (const [channelStr, mapping] of Object.entries(channels)) {
        channelMap.set(parseInt(channelStr), mapping)
      }

      currentMappings.set(universe, channelMap)
    }

    notifyChange()
  }

  conn.subscribe((evType, _ev, message) => {
    if (evType === 'message') {
      handleOnMessage(message as ChannelMappingStateMessage | null)
    }
  })

  return {
    getAll() {
      return currentMappings
    },
    get(universe: number, channelNo: number) {
      return currentMappings.get(universe)?.get(channelNo)
    },
    subscribe(fn) {
      const thisId = nextSubscriptionId++
      subscriptions.set(thisId, fn)
      return {
        unsubscribe: () => subscriptions.delete(thisId),
      }
    },
  }
}
