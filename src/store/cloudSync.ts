import { restApi } from "./restApi"

// ─── Types ─────────────────────────────────────────────────────────────

export interface SyncConfig {
  branch: string
  repoUrl: string | null
  enabled: boolean
  autoSyncEnabled: boolean
  autoSyncIntervalMs: number | null
  lastSyncedSha: string | null
  lastSyncedAtMs: number | null
}

export interface UpdateSyncConfigRequest {
  repoUrl?: string | null
  branch?: string
  enabled?: boolean
}

export interface CommitInfo {
  sha: string
  shortSha: string
  authorName: string
  authorEmail: string
  whenMs: number
  message: string
}

export interface SyncStatus {
  workingTreePath: string
  hasRepo: boolean
  head: CommitInfo | null
  dirty: boolean
}

export interface SnapshotResponse {
  noChanges: boolean
  workingTreePath: string
  commit: CommitInfo | null
}

// ─── Endpoints ─────────────────────────────────────────────────────────

/**
 * Per-project cloud-sync REST endpoints. Snapshot writes a git commit in
 * `<appDataDir>/sync/{projectUuid}/repo`; status surfaces HEAD + dirty flag;
 * log lists recent commits.
 */
export const cloudSyncApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    cloudSyncConfig: build.query<SyncConfig, number>({
      query: (projectId) => `project/${projectId}/sync/config`,
      providesTags: ['CloudSyncConfig'],
    }),
    updateCloudSyncConfig: build.mutation<
      SyncConfig,
      { projectId: number; body: UpdateSyncConfigRequest }
    >({
      query: ({ projectId, body }) => ({
        url: `project/${projectId}/sync/config`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['CloudSyncConfig'],
    }),
    cloudSyncStatus: build.query<SyncStatus, number>({
      query: (projectId) => `project/${projectId}/sync/status`,
      providesTags: ['CloudSyncStatus'],
    }),
    cloudSyncLog: build.query<CommitInfo[], { projectId: number; limit?: number }>({
      query: ({ projectId, limit }) => ({
        url: `project/${projectId}/sync/log`,
        params: limit != null ? { limit } : undefined,
      }),
      providesTags: ['CloudSyncLog'],
    }),
    cloudSyncSnapshot: build.mutation<
      SnapshotResponse,
      { projectId: number; message?: string | null }
    >({
      query: ({ projectId, message }) => ({
        url: `project/${projectId}/sync/snapshot`,
        method: 'POST',
        body: { message: message ?? null },
      }),
      // A snapshot changes HEAD + the log; refresh both. Config is unaffected.
      invalidatesTags: ['CloudSyncStatus', 'CloudSyncLog'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useCloudSyncConfigQuery,
  useUpdateCloudSyncConfigMutation,
  useCloudSyncStatusQuery,
  useCloudSyncLogQuery,
  useCloudSyncSnapshotMutation,
} = cloudSyncApi
