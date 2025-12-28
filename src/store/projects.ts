import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"
import {
  ProjectSummary,
  ProjectDetail,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectScript,
  ProjectScene,
  ProjectScriptDetail,
  CreateInitialSceneResponse,
  CreateScriptResponse,
  CloneProjectRequest,
  CloneProjectResponse,
  CopyScriptRequest,
  CopyScriptResponse,
} from "../api/projectApi"

// Subscribe to WebSocket project changes - invalidate all caches on project switch
lightingApi.projects.subscribeToSwitch(function() {
  // When project switches, invalidate all project-scoped data
  store.dispatch(restApi.util.invalidateTags([
    'ProjectList',
    'Project',
    'SceneList',
    'Script',
    'Fixture',
  ]))
})

export const projectsApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      // List all projects
      projectList: build.query<ProjectSummary[], void>({
        query: () => 'project/list',
        providesTags: ['ProjectList'],
      }),

      // Get current project details
      currentProject: build.query<ProjectDetail, void>({
        query: () => 'project/current',
        providesTags: ['Project'],
      }),

      // Get specific project details
      project: build.query<ProjectDetail, number>({
        query: (id) => `project/${id}`,
        providesTags: (_result, _error, id) => [{ type: 'Project', id }],
      }),

      // Create new project
      createProject: build.mutation<ProjectDetail, CreateProjectRequest>({
        query: (body) => ({
          url: 'project',
          method: 'POST',
          body,
        }),
        invalidatesTags: ['ProjectList'],
      }),

      // Update project
      updateProject: build.mutation<ProjectDetail, { id: number } & UpdateProjectRequest>({
        query: ({ id, ...body }) => ({
          url: `project/${id}`,
          method: 'PUT',
          body,
        }),
        invalidatesTags: (_result, _error, { id }) => [
          'ProjectList',
          { type: 'Project', id },
          'Project', // Also invalidate current project in case it was updated
        ],
      }),

      // Delete project
      deleteProject: build.mutation<void, number>({
        query: (id) => ({
          url: `project/${id}`,
          method: 'DELETE',
        }),
        invalidatesTags: ['ProjectList'],
      }),

      // Switch to project
      setCurrentProject: build.mutation<ProjectDetail, number>({
        query: (id) => ({
          url: `project/${id}/set-current`,
          method: 'POST',
        }),
        // Cache invalidation handled by WebSocket subscription above
      }),

      // Get scripts for any project (for config dropdowns)
      projectScripts: build.query<ProjectScript[], number>({
        query: (projectId) => `project/${projectId}/scripts`,
      }),

      // Get scenes for any project (for config dropdowns)
      projectScenes: build.query<ProjectScene[], number>({
        query: (projectId) => `project/${projectId}/scenes`,
      }),

      // Get full script from any project (read-only cross-project viewing)
      projectScript: build.query<ProjectScriptDetail, { projectId: number; scriptId: number }>({
        query: ({ projectId, scriptId }) => `project/${projectId}/scripts/${scriptId}`,
      }),

      // Create initial scene for current project
      createInitialScene: build.mutation<CreateInitialSceneResponse, void>({
        query: () => ({
          url: 'project/current/create-initial-scene',
          method: 'POST',
        }),
        invalidatesTags: ['Project', 'SceneList', 'Script'],
      }),

      // Create track changed script for current project
      createTrackChangedScript: build.mutation<CreateScriptResponse, void>({
        query: () => ({
          url: 'project/current/create-track-changed-script',
          method: 'POST',
        }),
        invalidatesTags: ['Project', 'Script'],
      }),

      // Create run loop script for current project
      createRunLoopScript: build.mutation<CreateScriptResponse, void>({
        query: () => ({
          url: 'project/current/create-run-loop-script',
          method: 'POST',
        }),
        invalidatesTags: ['Project', 'Script'],
      }),

      // Clone a project
      cloneProject: build.mutation<CloneProjectResponse, { id: number } & CloneProjectRequest>({
        query: ({ id, ...body }) => ({
          url: `project/${id}/clone`,
          method: 'POST',
          body,
        }),
        invalidatesTags: ['ProjectList'],
      }),

      // Copy a script to another project
      copyScript: build.mutation<CopyScriptResponse, { projectId: number; scriptId: number } & CopyScriptRequest>({
        query: ({ projectId, scriptId, ...body }) => ({
          url: `project/${projectId}/scripts/${scriptId}/copy`,
          method: 'POST',
          body,
        }),
        // Invalidate the target project's data since it now has a new script
        invalidatesTags: (_result, _error, { targetProjectId }) => [
          { type: 'Project', id: targetProjectId },
        ],
      }),
    }
  },
  overrideExisting: false,
})

export const {
  useProjectListQuery,
  useCurrentProjectQuery,
  useProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useSetCurrentProjectMutation,
  useProjectScriptsQuery,
  useProjectScenesQuery,
  useProjectScriptQuery,
  useCreateInitialSceneMutation,
  useCreateTrackChangedScriptMutation,
  useCreateRunLoopScriptMutation,
  useCloneProjectMutation,
  useCopyScriptMutation,
} = projectsApi
