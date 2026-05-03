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
  autoSyncEnabled?: boolean
  /** Backend rejects values < 60000ms (`AutoSyncScheduler.MIN_INTERVAL_MS`). */
  autoSyncIntervalMs?: number | null
}

/** Lower bound on `autoSyncIntervalMs` — kept in sync with `AutoSyncScheduler.MIN_INTERVAL_MS`. */
export const AUTO_SYNC_MIN_INTERVAL_MS = 60_000

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
  /** No GitHub credentials of any kind (OAuth or PAT) configured for this repo. */
  | "MISSING_CREDENTIALS"
  /** Legacy alias retained for one release. */
  | "MISSING_PAT"
  /** OAuth identity present but refresh token rejected — user must re-connect. */
  | "OAUTH_REAUTH_REQUIRED"
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
  /** Short UUID parsed from the `[install:{shortUuid}]` marker; null on commits authored outside the engine. */
  installShortUuid?: string | null
  /** Friendly name from `installs.json` at HEAD; null when the short UUID isn't in the registry. */
  installFriendlyName?: string | null
}

/** A single row from the per-project activity log; mirrors `SyncLogEntryDto`. */
export interface SyncLogEntry {
  id: number
  tsMs: number
  level: "INFO" | "WARN" | "ERROR"
  /** Stable code from `SyncLogEvent` — e.g. `RUN_DONE`, `AUTO_SYNC_TICK`. */
  event: string
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

// ─── Phase 5/6 conflict-session types ──────────────────────────────────

/**
 * `MANUAL` (Phase 6) saves a user-edited replacement payload alongside the choice;
 * apply substitutes the manual JSON for both sides at merge time.
 */
export type ConflictResolution = "LOCAL" | "REMOTE" | "MANUAL"

export interface ConflictDto {
  tableName: string
  recordUuid: string
  conflictKind: "EDIT_EDIT" | "EDIT_DELETE" | "DELETE_EDIT"
  /** `null` until the user picks LOCAL / REMOTE / MANUAL. */
  resolution: ConflictResolution | null
  /** Three-pane diff sources — mine / theirs / common ancestor. May be null on EDIT_DELETE / DELETE_EDIT sides. */
  localJson: string | null
  remoteJson: string | null
  baseJson: string | null
  /** User-edited replacement payload when `resolution === "MANUAL"`. Null otherwise. */
  manualValueJson?: string | null
  /** False for multi-file records (e.g. scripts) — UI must hide the MANUAL option for those rows. */
  manualEditAllowed?: boolean
}

export type SyncSessionState =
  | "FETCHING"
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
  /** Required when `resolution === "MANUAL"`; ignored otherwise. */
  manualValueJson?: string | null
}

export interface AbortResult {
  sessionId: number
}

export interface ImportFromRemoteRequest {
  repoUrl: string
  /** Defaults to `main` server-side when null/blank. */
  branch?: string | null
  /** Defaults server-side to whatever's in the imported `project.json`. */
  projectName?: string | null
}

export interface ImportFromRemoteResult {
  projectId: number
  projectUuid: string
  name: string
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
    /**
     * Batch fetch of every project's sync config keyed by stringified project id.
     * Replaces the N+1 `useCloudSyncConfigQuery(id)` pattern in the hub list. The
     * map is sparse — projects that have never had a sync_config row are absent
     * (treated as "unconfigured" by the hub row).
     *
     * Shares the `CloudSyncConfig` tag with the per-project query so the existing
     * mutation invalidations + WS-driven `restApi.util.invalidateTags(['CloudSyncConfig'])`
     * busts both caches in one go.
     */
    cloudSyncConfigs: build.query<Record<string, SyncConfig>, void>({
      query: () => `cloud-sync/configs`,
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
    cloudSyncLog: build.query<
      CommitInfo[],
      { projectId: number; limit?: number; before?: string }
    >({
      query: ({ projectId, limit, before }) => {
        const params: Record<string, string | number> = {}
        if (limit != null) params.limit = limit
        if (before) params.before = before
        return {
          url: `project/${projectId}/sync/log`,
          params: Object.keys(params).length ? params : undefined,
        }
      },
      providesTags: ['CloudSyncLog'],
    }),
    cloudSyncActivity: build.query<
      SyncLogEntry[],
      { projectId: number; limit?: number; beforeId?: number }
    >({
      query: ({ projectId, limit, beforeId }) => {
        const params: Record<string, string | number> = {}
        if (limit != null) params.limit = limit
        if (beforeId != null) params.beforeId = beforeId
        return {
          url: `project/${projectId}/sync/activity`,
          params: Object.keys(params).length ? params : undefined,
        }
      },
      providesTags: ['CloudSyncActivity'],
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
    /**
     * Clone a remote repo into a brand-new local project. Returns the new project's
     * id so the caller can navigate straight to its sync drill-in. Invalidates
     * `ProjectList` (a new project appeared) and `CloudSyncConfig` (its sync row
     * is now in the batch query's response).
     */
    cloudSyncImport: build.mutation<
      ImportFromRemoteResult,
      ImportFromRemoteRequest
    >({
      query: (body) => ({
        url: `cloud-sync/import`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['ProjectList', 'CloudSyncConfig'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useCloudSyncConfigQuery,
  useCloudSyncConfigsQuery,
  useUpdateCloudSyncConfigMutation,
  useCloudSyncStatusQuery,
  useCloudSyncLogQuery,
  useLazyCloudSyncActivityQuery,
  useLazyCloudSyncLogQuery,
  useCloudSyncSnapshotMutation,
  useSetCloudSyncCredentialsMutation,
  useClearCloudSyncCredentialsMutation,
  useCloudSyncRunMutation,
  useCloudSyncConflictsQuery,
  useCloudSyncResolveMutation,
  useCloudSyncApplyMutation,
  useCloudSyncAbortMutation,
  useCloudSyncImportMutation,
} = cloudSyncApi
