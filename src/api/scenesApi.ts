import {InternalApiConnection} from "./internalApi";
import {Subscription} from "./subscription";

export interface ScenesApi {
  subscribe(fn: () => void): Subscription
  subscribeToScene(id: number, fn: (data: Scene) => void): Subscription
}

export type SceneMode = 'SCENE' | 'CHASE'

export type Scene = SceneDetails & {
  id: number
  isActive: boolean
}

export type SceneDetails = {
  mode: SceneMode
  name: string
  scriptId: number
  settingsValues: unknown
}

type sceneInMessage = {
  type: 'sceneListChanged' | 'sceneChanged'
}

type SceneChangedInMessage = {
  type: 'sceneChanged'
  data: Scene
}

export function createSceneApi(conn: InternalApiConnection): ScenesApi {
  let nextSubscriptionId = 1
  const listSubscriptions = new Map<number, () => void>()
  const itemSubscriptions = new Map<number, Map<number, (data: Scene) => void>>()

  const notifyListChange = () => {
    listSubscriptions.forEach((fn) => {
      fn()
    })
  }
  const notifyChange = (data: Scene) => {
    itemSubscriptions.get(data.id)?.forEach((fn) => {
      fn(data)
    })
  }

  const handleOnOpen = () => {
    notifyListChange()
  }

  const handleOnMessage = (ev: MessageEvent) => {
    const message: sceneInMessage = JSON.parse(ev.data)

    if (message == null) {
      return
    }

    if (message.type == 'sceneChanged') {
      notifyChange((message as SceneChangedInMessage).data)
    } else if (message.type == 'sceneListChanged') {
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

    subscribeToScene(id: number, fn: (data: Scene) => void): Subscription {
      const thisId = nextSubscriptionId
      nextSubscriptionId++

      let scenesMap = itemSubscriptions.get(id)
      if (!scenesMap) {
        scenesMap = new Map<number, (data: Scene) => void>()
        itemSubscriptions.set(id, scenesMap)
      }

      scenesMap.set(thisId, fn)

      return {
        unsubscribe: () => {
          scenesMap.delete(thisId)
        },
      }
    },
  }
}
