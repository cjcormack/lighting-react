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
  /**
   * True if a PAT for the configured `repoUrl` is stored in the OS keychain (or the
   * encrypted-file fallback). The actual token is never sent to the client; this flag
   * is just so the UI can render a "✓ token stored" indicator next to the Set-token
   * input without needing a separate request.
   */
  tokenPresent: boolean
}

export interface UpdateSyncConfigRequest {
  repoUrl?: string | null
  branch?: string
  enabled?: boolean
}

/** Outcomes of a successful sync run; matches the `SyncOutcome` Kotlin enum. */
export type SyncOutcome = "NO_OP" | "PUSHED" | "FAST_FORWARDED" | "FORCE_PUSHED"

export interface SyncRunResult {
  outcome: SyncOutcome
  pushed: number
  pulled: number
  /**
   * Number of remote commits dropped on a force-push. Always 0 for non-force outcomes;
   * the StatusPanel surfaces a warning when this is positive so the user notices that
   * remote work was overwritten (phase 4 force-push policy on diverged history).
   */
  replaced: number
  headSha: string
  message: string
}

/** Stable error codes returned by the run endpoint; the frontend branches toasts on these. */
export type SyncErrorCode =
  | "REPO_URL_MISSING"
  | "SYNC_DISABLED"
  | "MISSING_PAT"
  | "AUTH_FAILED"
  | "FORMAT_TOO_NEW"
  | "PUSH_REJECTED"
  | "NO_REPO"

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
    setCloudSyncCredentials: build.mutation<void, { projectId: number; pat: string }>({
      query: ({ projectId, pat }) => ({
        url: `project/${projectId}/sync/credentials`,
        method: 'PUT',
        body: { pat },
      }),
      // tokenPresent flips → refresh config so the UI badge updates.
      invalidatesTags: ['CloudSyncConfig'],
    }),
    clearCloudSyncCredentials: build.mutation<void, number>({
      query: (projectId) => ({
        url: `project/${projectId}/sync/credentials`,
        method: 'DELETE',
      }),
      invalidatesTags: ['CloudSyncConfig'],
    }),
    cloudSyncRun: build.mutation<SyncRunResult, number>({
      query: (projectId) => ({
        url: `project/${projectId}/sync/run`,
        method: 'POST',
      }),
      // A run can advance HEAD (push), rewrite the working tree (fast-forward), and
      // updates lastSyncedSha on the config. Refresh everything.
      invalidatesTags: ['CloudSyncConfig', 'CloudSyncStatus', 'CloudSyncLog'],
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
  useSetCloudSyncCredentialsMutation,
  useClearCloudSyncCredentialsMutation,
  useCloudSyncRunMutation,
} = cloudSyncApi
