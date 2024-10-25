import { restApi } from "./restApi"
import { RunResult } from "./scripts"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"
import { Scene, SceneDetails, SceneMode } from "../api/scenesApi"

lightingApi.scenes.subscribe(function() {
  store.dispatch(restApi.util.invalidateTags(['SceneList']))
})

export const scenesApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      sceneList: build.query<Array<number>, SceneMode>({
        query: (mode: SceneMode) => {
          return {
            url: "scene/list",
            params: {
              'mode': mode,
            },
          }
        },
        providesTags: ['SceneList'],
      }),
      scene: build.query<Scene, number>({
        query: (id) => {
          return `scene/${id}`
        },
        async onCacheEntryAdded(id, { updateCachedData, cacheEntryRemoved }) {
          const subscription = lightingApi.scenes.subscribeToScene(id, (value) => {
            updateCachedData(() => {
              return value
            })
          })
          await cacheEntryRemoved
          subscription.unsubscribe()
        },
      }),
      runScene: build.mutation<RunResult, number>({
        query: (id) => ({
          url: `scene/${id}/run`,
          method: 'POST',
          body: {},
        }),
      }),
      saveScene: build.mutation<Scene, Partial<Scene> & Pick<Scene, 'id'>>({
        query: ({ id, ...request }) => ({
          url: `scene/${id}`,
          method: 'PUT',
          body: request,
        }),
        invalidatesTags: ['SceneList'],
      }),
      deleteScene: build.mutation<void, number>({
        query: (id) => ({
          url: `scene/${id}`,
          method: 'DELETE',
        }),
        invalidatesTags: ['SceneList'],
      }),
      createScene: build.mutation<Scene, SceneDetails>({
        query: (scene) => ({
          url: `scene`,
          method: 'POST',
          body: scene,
        }),
        invalidatesTags: ['SceneList'],
      }),
    }
  },
  overrideExisting: false,
})

export const {
  useSceneListQuery, useSceneQuery, useRunSceneMutation,
  useSaveSceneMutation, useDeleteSceneMutation, useCreateSceneMutation
} = scenesApi
