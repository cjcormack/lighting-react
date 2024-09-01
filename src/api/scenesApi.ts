import {
  array, bool,
  CheckerReturnType, jsonParser,
  jsonParserEnforced, literal, mixed, number,
  object,
  string,
} from "@recoiljs/refine";
import {InternalApiConnection} from "./internalApi";
import {RunResult, RunResultParser} from "./scriptsApi";
import {Subscription} from "./subscription";

export const SceneChecker = object({
  id: number(),
  name: string(),
  scriptId: number(),
  isActive: bool(),
  settingsValues: mixed(),
})

const SceneParser = jsonParserEnforced(SceneChecker)

const SceneListParser = jsonParserEnforced(array(SceneChecker))

export type Scene = CheckerReturnType<typeof SceneChecker>
export type SceneDetails = {
  name: string,
  scriptId: number,
  settingsValues: any,
}

export interface ScenesApi {
  getAll(): Promise<readonly Scene[]>,
  get(id: number): Promise<Scene | undefined>,

  run(id: number): Promise<RunResult>,
  save(id: number, scene: SceneDetails): Promise<Scene>,
  delete(id: number): Promise<void>,
  create(scene: SceneDetails): Promise<Scene>,
  subscribe(fn: () => void): Subscription,
}

const ScenesChangedInMessageChecker = object({
  type: literal('scenesChanged'),
})

const scenesChangedParser = jsonParser(ScenesChangedInMessageChecker)

export function createSceneApi(conn: InternalApiConnection): ScenesApi {
  let nextSubscriptionId = 1
  const subscriptions = new Map<number, () => void>()

  const notifyChange = () => {
    subscriptions.forEach((fn) => {
      fn()
    })
  }

  const handleOnOpen = () => {
    notifyChange()
  }

  const handleOnMessage = (ev: MessageEvent) => {
    const message = scenesChangedParser(ev.data)

    if (message == null) {
      return
    }

    notifyChange()
  }

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      handleOnOpen()
    } else if (evType === 'message' && ev instanceof MessageEvent) {
      handleOnMessage(ev)
    }
  })

  return {
    getAll(): Promise<readonly Scene[]> {
      return fetch(conn.baseUrl+"rest/scene/list").then((res) => {
          return res.text().then((text) => SceneListParser(text))
      })
    },
    get(id: number): Promise<Scene | undefined> {
      return this.getAll().then((allScenes) => {
        return allScenes.filter((scene) => scene.id === id).pop()
      })
    },
    run(id: number): Promise<RunResult> {
      return fetch(`${conn.baseUrl}rest/scene/${id}/run`, {
        method: "POST",
        headers:{'content-type': 'application/json'},
        body: JSON.stringify({})
      }).then((res) => {
        return res.text().then((text) => RunResultParser(text))
      })
    },
    save(id: number, scene: SceneDetails) {
      return fetch(`${conn.baseUrl}rest/scene/${id}`, {
        method: "PUT",
        headers:{'content-type': 'application/json'},
        body: JSON.stringify(scene),
      }).then((res) => {
        return res.text().then((text) => SceneParser(text))
      })
    },
    delete(id: number) {
      return fetch(`${conn.baseUrl}rest/scene/${id}`, {
        method: "DELETE",
      }).then(() => {})
    },
    create(scene: SceneDetails): Promise<Scene> {
      return fetch(`${conn.baseUrl}rest/scene`, {
        method: "POST",
        headers:{'content-type': 'application/json'},
        body: JSON.stringify(scene),
      }).then((res) => {
        return res.text().then((text) => SceneParser(text))
      })
    },
    subscribe(fn: () => void): Subscription {
      const thisId = nextSubscriptionId
      nextSubscriptionId++

      subscriptions.set(thisId, fn)

      fn()

      return {
        unsubscribe: () => {
          subscriptions.delete(thisId)
        },
      }
    },
  }
}
