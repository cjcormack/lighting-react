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

/**
 * Outcomes of a successful sync run; matches the `SyncOutcome` Kotlin enum. Phase 5
 * replaces Phase 4's `FORCE_PUSHED` with `MERGED` (clean auto-merge of disjoint records)
 * and adds `CONFLICTS_PENDING` for the same-record-on-both-sides case.
 */
export type SyncOutcome =
  | "NO_OP"
  | "PUSHED"
  | "FAST_FORWARDED"
  | "MERGED"
  | "CONFLICTS_PENDING"

export interface SyncRunResult {
  outcome: SyncOutcome
  pushed: number
  pulled: number
  /**
   * Always 0 in Phase 5 — retained for API stability with the Phase 4 force-push field.
   * Phase 4 set this to the number of remote commits dropped on a force-push; Phase 5
   * never drops remote commits.
   */
  replaced: number
  headSha: string
  message: string
  /** Set when `outcome === "CONFLICTS_PENDING"`. */
  sessionId?: number | null
  /** Number of conflicts persisted; 0 unless `outcome === "CONFLICTS_PENDING"`. */
  conflictCount?: number
}

/** Stable error codes returned by the run / apply / abort endpoints. */
export type SyncErrorCode =
  | "REPO_URL_MISSING"
  | "SYNC_DISABLED"
  | "MISSING_PAT"
  | "AUTH_FAILED"
  | "FORMAT_TOO_NEW"
  | "PUSH_REJECTED"
  | "NO_REPO"
  | "SESSION_PENDING"
  | "SESSION_NOT_FOUND"
  | "SESSION_STALE"
  | "UNRESOLVED_CONFLICTS"

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

// ─── Phase 5 conflict-session types ────────────────────────────────────

export type ConflictResolution = "LOCAL" | "REMOTE"

export interface ConflictDto {
  tableName: string
  recordUuid: string
  conflictKind: "EDIT_EDIT" | "EDIT_DELETE" | "DELETE_EDIT"
  /** `null` until the user clicks Use local / Use remote. */
  resolution: ConflictResolution | null
  /** Phase 6 will use these for a three-pane diff; Phase 5 leaves them unrendered. */
  localJson: string | null
  remoteJson: string | null
  baseJson: string | null
}

export type SyncSessionState =
  | "CONFLICTS_PENDING"
  | "APPLYING"
  | "DONE"
  | "FAILED"
  | "ABORTED"

export interface ConflictsResponse {
  activeSession: boolean
  sessionId?: number
  state?: SyncSessionState
  localSha?: string | null
  remoteSha?: string | null
  baseSha?: string | null
  errorMessage?: string | null
  conflicts: ConflictDto[]
}

export interface ResolveEntry {
  tableName: string
  recordUuid: string
  /** Pass `null` to clear an earlier choice. */
  resolution: ConflictResolution | null
}

export interface AbortResult {
  sessionId: number
}

// ─── Endpoints ─────────────────────────────────────────────────────────

/**
 * Per-project cloud-sync REST endpoints. Snapshot writes a git commit in
 * `<appDataDir>/sync/{projectUuid}/repo`; status surfaces HEAD + dirty flag;
 * log lists recent commits. Phase 5 layers conflict-session endpoints on top.
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
      // update lastSyncedSha on the config; or open a conflict session. Refresh
      // everything including the conflicts panel.
      invalidatesTags: ['CloudSyncConfig', 'CloudSyncStatus', 'CloudSyncLog', 'CloudSyncConflicts'],
    }),

    // ─── Phase 5 conflict-session endpoints ─────────────────────────

    cloudSyncConflicts: build.query<ConflictsResponse, number>({
      query: (projectId) => `project/${projectId}/sync/conflicts`,
      providesTags: ['CloudSyncConflicts'],
    }),
    cloudSyncResolve: build.mutation<
      void,
      { projectId: number; resolutions: ResolveEntry[] }
    >({
      query: ({ projectId, resolutions }) => ({
        url: `project/${projectId}/sync/resolve`,
        method: 'POST',
        body: { resolutions },
      }),
      // Refresh the conflicts query so badges flip from "unresolved" → "resolved".
      invalidatesTags: ['CloudSyncConflicts'],
    }),
    cloudSyncApply: build.mutation<SyncRunResult, number>({
      query: (projectId) => ({
        url: `project/${projectId}/sync/apply`,
        method: 'POST',
      }),
      // Apply closes the session and may advance HEAD + push.
      invalidatesTags: ['CloudSyncConfig', 'CloudSyncStatus', 'CloudSyncLog', 'CloudSyncConflicts'],
    }),
    cloudSyncAbort: build.mutation<AbortResult, number>({
      query: (projectId) => ({
        url: `project/${projectId}/sync/abort`,
        method: 'POST',
      }),
      invalidatesTags: ['CloudSyncConflicts', 'CloudSyncStatus'],
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
  useCloudSyncConflictsQuery,
  useCloudSyncResolveMutation,
  useCloudSyncApplyMutation,
  useCloudSyncAbortMutation,
} = cloudSyncApi
