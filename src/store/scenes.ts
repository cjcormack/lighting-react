import { restApi } from "./restApi"
import { RunResult } from "./scripts"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"

lightingApi.scenes.subscribe(function() {
  store.dispatch(restApi.util.invalidateTags(['Scene']))
})

export const scenesApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      sceneList: build.query<Array<Scene>, void>({
        query: () => {
          return 'scene/list'
        },
        providesTags: ['Scene'],
      }),
      scene: build.query<Scene, number>({
        query: (id) => {
          return `scene/${id}`
        },
        providesTags: ['Scene'],
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
        invalidatesTags: ['Scene'],
      }),
      deleteScene: build.mutation<void, number>({
        query: (id) => ({
          url: `scene/${id}`,
          method: 'DELETE',
        }),
        invalidatesTags: ['Scene'],
      }),
      createScene: build.mutation<Scene, SceneDetails>({
        query: (scene) => ({
          url: `scene`,
          method: 'POST',
          body: scene,
        }),
        invalidatesTags: ['Scene'],
      }),
    }
  },
  overrideExisting: false,
})

export const {
  useSceneListQuery, useSceneQuery, useRunSceneMutation,
  useSaveSceneMutation, useDeleteSceneMutation, useCreateSceneMutation
} = scenesApi

export type Scene = SceneDetails & {
  id: number
  isActive: boolean
}

export type SceneDetails = {
  name: string
  scriptId: number
  settingsValues: unknown
}
