import { restApi } from "./restApi"
import { RunResult } from "./scripts"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"
import { Scene, SceneDetails, SceneMode } from "../api/scenesApi"
import { projectsApi } from "./projects"

lightingApi.scenes.subscribe(function() {
  store.dispatch(restApi.util.invalidateTags(['SceneList']))
})

export const scenesApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      // Legacy endpoints (current project only) - kept for backwards compatibility
      sceneList: build.query<Array<Scene>, SceneMode>({
        query: (mode: SceneMode) => {
          return {
            url: "project/current/scenes",
            params: {
              'mode': mode,
            },
          }
        },
        providesTags: ['SceneList'],
      }),
      scene: build.query<Scene, number>({
        query: (id) => {
          return `project/current/scenes/${id}`
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
          url: `project/current/scenes/${id}/run`,
          method: 'POST',
          body: {},
        }),
      }),
      saveScene: build.mutation<Scene, Partial<Scene> & Pick<Scene, 'id'>>({
        query: ({ id, ...request }) => ({
          url: `project/current/scenes/${id}`,
          method: 'PUT',
          body: request,
        }),
        invalidatesTags: ['SceneList'],
      }),
      deleteScene: build.mutation<void, number>({
        query: (id) => ({
          url: `project/current/scenes/${id}`,
          method: 'DELETE',
        }),
        invalidatesTags: ['SceneList'],
      }),
      createScene: build.mutation<Scene, SceneDetails>({
        query: (scene) => ({
          url: `project/current/scenes`,
          method: 'POST',
          body: scene,
        }),
        invalidatesTags: ['SceneList'],
      }),

      // Project-scoped endpoints
      projectSceneList: build.query<Array<Scene>, { projectId: number; mode: SceneMode }>({
        query: ({ projectId, mode }) => ({
          url: `project/${projectId}/scenes`,
          params: { mode },
        }),
        providesTags: (_result, _error, { projectId }) => [
          { type: 'SceneList', id: projectId },
          'SceneList',
        ],
        async onQueryStarted({ projectId }, { dispatch, queryFulfilled }) {
          try {
            const { data } = await queryFulfilled
            // Cache individual scene details from the list
            data.forEach(scene => {
              dispatch(
                scenesApi.util.upsertQueryData(
                  'projectScene',
                  { projectId, sceneId: scene.id },
                  scene
                )
              )
            })
            // Prefetch scripts list to avoid individual script requests per scene
            dispatch(projectsApi.endpoints.projectScripts.initiate(projectId))
          } catch {
            // Query failed, nothing to cache
          }
        },
      }),
      projectScene: build.query<Scene, { projectId: number; sceneId: number }>({
        query: ({ projectId, sceneId }) => `project/${projectId}/scenes/${sceneId}`,
        async onCacheEntryAdded({ sceneId }, { updateCachedData, cacheEntryRemoved }) {
          const subscription = lightingApi.scenes.subscribeToScene(sceneId, (value) => {
            updateCachedData(() => value)
          })
          await cacheEntryRemoved
          subscription.unsubscribe()
        },
      }),
      runProjectScene: build.mutation<RunResult, { projectId: number; sceneId: number }>({
        query: ({ projectId, sceneId }) => ({
          url: `project/${projectId}/scenes/${sceneId}/run`,
          method: 'POST',
          body: {},
        }),
      }),
      saveProjectScene: build.mutation<Scene, { projectId: number } & Partial<Scene> & Pick<Scene, 'id'>>({
        query: ({ projectId, id, ...request }) => ({
          url: `project/${projectId}/scenes/${id}`,
          method: 'PUT',
          body: request,
        }),
        invalidatesTags: (_result, _error, { projectId }) => [
          { type: 'SceneList', id: projectId },
          'SceneList',
        ],
      }),
      deleteProjectScene: build.mutation<void, { projectId: number; sceneId: number }>({
        query: ({ projectId, sceneId }) => ({
          url: `project/${projectId}/scenes/${sceneId}`,
          method: 'DELETE',
        }),
        invalidatesTags: (_result, _error, { projectId }) => [
          { type: 'SceneList', id: projectId },
          'SceneList',
        ],
      }),
      createProjectScene: build.mutation<Scene, { projectId: number } & SceneDetails>({
        query: ({ projectId, ...scene }) => ({
          url: `project/${projectId}/scenes`,
          method: 'POST',
          body: scene,
        }),
        invalidatesTags: (_result, _error, { projectId }) => [
          { type: 'SceneList', id: projectId },
          'SceneList',
        ],
      }),
    }
  },
  overrideExisting: false,
})

export const {
  // Legacy hooks (current project only)
  useSceneListQuery, useSceneQuery, useRunSceneMutation,
  useSaveSceneMutation, useDeleteSceneMutation, useCreateSceneMutation,
  // Project-scoped hooks
  useProjectSceneListQuery, useProjectSceneQuery, useRunProjectSceneMutation,
  useSaveProjectSceneMutation, useDeleteProjectSceneMutation, useCreateProjectSceneMutation,
} = scenesApi
