import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { useDispatch } from "react-redux"
import { lightingApi } from "@/api/lightingApi"
import { restApi } from "@/store/restApi"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2,
  CloudUpload,
  Check,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react"
import { useCurrentProjectQuery, useProjectQuery } from "@/store/projects"
import {
  useCloudSyncConfigQuery,
  useCloudSyncStatusQuery,
  useCloudSyncLogQuery,
  useLazyCloudSyncLogQuery,
  useLazyCloudSyncActivityQuery,
  useCloudSyncConflictsQuery,
  useUpdateCloudSyncConfigMutation,
  useCloudSyncSnapshotMutation,
  useSetCloudSyncCredentialsMutation,
  useClearCloudSyncCredentialsMutation,
  useCloudSyncRunMutation,
  AUTO_SYNC_MIN_INTERVAL_MS,
  type CommitInfo,
  type SyncConfig,
  type SyncLogEntry,
  type SyncStatus,
} from "@/store/cloudSync"
import { useOauthGithubIdentityQuery } from "@/store/oauthGithub"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { ConflictPanel } from "@/components/cloudSync/ConflictPanel"
import { IdentityRow } from "@/components/cloudSync/IdentityRow"
import { RepoPicker } from "@/components/cloudSync/RepoPicker"
import { formatError } from "@/lib/formatError"

const AUTO_SYNC_MIN_INTERVAL_SECONDS = AUTO_SYNC_MIN_INTERVAL_MS / 1000

/**
 * Append `next` onto `prev`, dropping any items already present in `prev` (matched by
 * `.id`). Used by the activity feed to merge WS appends and paginated fetches without
 * duplicates.
 */
function mergeUniqueById<T extends { id: number }>(prev: T[], next: T[]): T[] {
  if (next.length === 0) return prev
  const seen = new Set(prev.map((e) => e.id))
  const added = next.filter((e) => !seen.has(e.id))
  return added.length === 0 ? prev : [...prev, ...added]
}

// ─── Redirect (handles bare /sync without a project) ──────────────────

export function CloudSyncRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/sync`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }
  return null
}

// ─── Main route ───────────────────────────────────────────────────────

export function ProjectCloudSync() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: project, isLoading } = useProjectQuery(projectIdNum)
  const dispatch = useDispatch()

  // Refresh status / log / config when the backend broadcasts a sync completion. The
  // mutation already invalidates these tags on success, but a sync triggered from a
  // *different* tab arrives only via WebSocket — this listener catches that case.
  useEffect(() => {
    const onDone = () => {
      dispatch(restApi.util.invalidateTags(['CloudSyncStatus', 'CloudSyncLog', 'CloudSyncConfig']))
    }
    const onFailed = () => {
      // Refresh status/log on failure too — the snapshot step inside the pipeline may
      // have committed before the network step failed.
      dispatch(restApi.util.invalidateTags(['CloudSyncStatus', 'CloudSyncLog']))
    }
    let lastConnected: boolean | null = null
    const onIdentityChanged = (event: { connected: boolean }) => {
      // Always refresh the identity row (login + expiries change on refresh too);
      // only bust the repo list when connect-state flips, since a token refresh
      // doesn't change which repos the App can see.
      dispatch(restApi.util.invalidateTags(['OAuthIdentity']))
      if (lastConnected !== null && lastConnected !== event.connected) {
        dispatch(restApi.util.invalidateTags(['OAuthRepos']))
      }
      lastConnected = event.connected
    }
    const subDone = lightingApi.cloudSync.subscribeDone(onDone)
    const subFailed = lightingApi.cloudSync.subscribeFailed(onFailed)
    const subIdentity = lightingApi.cloudSync.subscribeOAuthIdentityChanged(onIdentityChanged)
    return () => {
      subDone.unsubscribe()
      subFailed.unsubscribe()
      subIdentity.unsubscribe()
    }
  }, [dispatch])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }
  if (!project) {
    return (
      <Card className="m-4 p-4">
        <p className="text-destructive">Project not found</p>
      </Card>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      <Breadcrumbs projectName={project.name} currentPage="Sync" />
      <div>
        <h1 className="text-lg font-semibold">Cloud Sync</h1>
        <p className="text-sm text-muted-foreground">
          Each snapshot is a git commit in this install&rsquo;s working tree.
        </p>
      </div>
      <ConfigPanel projectId={projectIdNum} />
      <StatusPanel projectId={projectIdNum} />
      <ConflictPanel projectId={projectIdNum} />
      {/* key= forces a fresh mount per project so accumulated paged state resets cleanly. */}
      <ActivityPanel key={`activity-${projectIdNum}`} projectId={projectIdNum} />
      <HistoryPanel key={`history-${projectIdNum}`} projectId={projectIdNum} />
    </div>
  )
}

// ─── Configuration panel ──────────────────────────────────────────────

function ConfigPanel({ projectId }: { projectId: number }) {
  const { data: config, isLoading } = useCloudSyncConfigQuery(projectId)
  const { data: identity } = useOauthGithubIdentityQuery()
  const [updateConfig, { isLoading: isSaving }] = useUpdateCloudSyncConfigMutation()

  const [branch, setBranch] = useState("main")
  const [repoUrl, setRepoUrl] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [autoSyncIntervalSecondsStr, setAutoSyncIntervalSecondsStr] = useState(
    String(AUTO_SYNC_MIN_INTERVAL_SECONDS),
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (config) {
      setBranch(config.branch)
      setRepoUrl(config.repoUrl ?? null)
      setEnabled(config.enabled)
      setAutoSyncEnabled(config.autoSyncEnabled)
      const seconds = config.autoSyncIntervalMs != null
        ? Math.round(config.autoSyncIntervalMs / 1000)
        : AUTO_SYNC_MIN_INTERVAL_SECONDS
      setAutoSyncIntervalSecondsStr(String(seconds))
    }
  }, [config])

  if (isLoading || !config) {
    return (
      <Card className="p-4 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin" />
      </Card>
    )
  }

  const intervalSecondsNum = Number(autoSyncIntervalSecondsStr)
  const intervalValid = Number.isFinite(intervalSecondsNum)
    && Number.isInteger(intervalSecondsNum)
    && intervalSecondsNum >= AUTO_SYNC_MIN_INTERVAL_SECONDS
  const intervalChanged = autoSyncEnabled
    && intervalValid
    && intervalSecondsNum * 1000 !== config.autoSyncIntervalMs

  const dirty = branch !== config.branch
    || repoUrl !== (config.repoUrl ?? null)
    || enabled !== config.enabled
    || autoSyncEnabled !== config.autoSyncEnabled
    || intervalChanged
  const branchValid = branch.trim().length > 0

  const handleSave = async () => {
    if (!branchValid) return
    if (autoSyncEnabled && !intervalValid) return
    try {
      await updateConfig({
        projectId,
        body: {
          branch: branch.trim(),
          repoUrl,
          enabled,
          autoSyncEnabled,
          autoSyncIntervalMs: autoSyncEnabled ? intervalSecondsNum * 1000 : null,
        },
      }).unwrap()
      toast.success("Sync configuration saved")
    } catch (err) {
      toast.error(`Failed to save sync configuration: ${formatError(err)}`)
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Configuration</h2>
        <p className="text-xs text-muted-foreground">
          Connect to GitHub, pick a repository, then use <strong>Sync now</strong>{" "}
          below to push and pull.
        </p>
      </div>

      {/* Identity row at the top — primary "Connect GitHub" path. */}
      <div className="border rounded-md p-3 bg-muted/20">
        <IdentityRow projectId={projectId} />
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Repository</Label>
          <RepoPicker
            value={repoUrl}
            onChange={(repo) => setRepoUrl(repo.cloneUrl)}
            oauthConnected={identity?.connected === true}
          />
          {repoUrl && (
            <p className="text-[10px] text-muted-foreground font-mono break-all">
              {repoUrl}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
          <div className="space-y-1">
            <Label htmlFor="sync-branch">Branch *</Label>
            <Input
              id="sync-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
            />
          </div>
          <div className="flex items-end">
            <div className="flex items-center gap-2">
              <input
                id="sync-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <Label htmlFor="sync-enabled" className="text-xs">
                Enable cloud sync for this project
              </Label>
            </div>
          </div>
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              id="auto-sync-enabled"
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              disabled={!enabled}
            />
            <Label htmlFor="auto-sync-enabled" className="text-xs">
              Auto-sync periodically
            </Label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4 items-start">
            <div className="space-y-1">
              <Label htmlFor="auto-sync-interval" className="text-xs">
                Interval (seconds)
              </Label>
              <Input
                id="auto-sync-interval"
                type="number"
                min={AUTO_SYNC_MIN_INTERVAL_SECONDS}
                step={1}
                value={autoSyncIntervalSecondsStr}
                onChange={(e) => setAutoSyncIntervalSecondsStr(e.target.value)}
                disabled={!enabled || !autoSyncEnabled}
                className={
                  autoSyncEnabled && !intervalValid ? "border-destructive" : undefined
                }
              />
            </div>
            <p className="text-xs text-muted-foreground self-end pb-1">
              Minimum {AUTO_SYNC_MIN_INTERVAL_SECONDS}s. The first tick fires after one full
              interval — recently-saved changes are not pushed mid-form-submit.
            </p>
          </div>
          {autoSyncEnabled && !intervalValid && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" />
              Interval must be a whole number ≥ {AUTO_SYNC_MIN_INTERVAL_SECONDS} seconds.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={
              !dirty
              || !branchValid
              || (autoSyncEnabled && !intervalValid)
              || isSaving
            }
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Advanced/PAT path — collapsed by default. */}
      <div className="border-t pt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {advancedOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Advanced — Personal Access Token
          {config.tokenPresent && (
            <Badge variant="secondary" className="ml-2 text-[10px]">PAT stored</Badge>
          )}
        </button>
        {advancedOpen && (
          <div className="mt-3">
            <PatPanel projectId={projectId} config={config} />
          </div>
        )}
      </div>
    </Card>
  )
}

function PatPanel({ projectId, config }: { projectId: number; config: SyncConfig }) {
  const [setCredentials, { isLoading: isSettingPat }] = useSetCloudSyncCredentialsMutation()
  const [clearCredentials, { isLoading: isClearingPat }] = useClearCloudSyncCredentialsMutation()
  const [pat, setPat] = useState("")

  const handleSetPat = async () => {
    const trimmed = pat.trim()
    if (!trimmed) return
    try {
      await setCredentials({ projectId, pat: trimmed }).unwrap()
      setPat("")
      toast.success("Personal Access Token stored")
    } catch (err) {
      toast.error(`Failed to store PAT: ${formatError(err)}`)
    }
  }

  const handleClearPat = async () => {
    try {
      await clearCredentials(projectId).unwrap()
      toast.success("Personal Access Token cleared")
    } catch (err) {
      toast.error(`Failed to clear PAT: ${formatError(err)}`)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        For headless rigs, GitHub Enterprise, or as an override when OAuth isn&rsquo;t
        configured. Stored in the OS keychain (or an encrypted file fallback). Needs{" "}
        <code className="text-xs">repo</code> scope. The token is never returned to
        the UI &mdash; clear and re-enter to rotate.
      </p>
      <div className="flex gap-2 items-end">
        <div className="space-y-1 flex-1">
          <Label htmlFor="sync-pat" className="sr-only">PAT</Label>
          <Input
            id="sync-pat"
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder={config.tokenPresent ? "•••• stored — enter new to rotate" : "ghp_…"}
            autoComplete="off"
          />
        </div>
        <Button
          onClick={handleSetPat}
          disabled={!pat.trim() || isSettingPat || !config.repoUrl}
        >
          {isSettingPat ? "Storing…" : "Set token"}
        </Button>
        {config.tokenPresent && (
          <Button
            variant="outline"
            onClick={handleClearPat}
            disabled={isClearingPat}
          >
            {isClearingPat ? "Clearing…" : "Clear"}
          </Button>
        )}
      </div>
      {!config.repoUrl && (
        <p className="text-xs text-amber-600">
          Set a repository above before storing a token.
        </p>
      )}
    </div>
  )
}

// ─── Status + snapshot panel ──────────────────────────────────────────

function StatusPanel({ projectId }: { projectId: number }) {
  const { data: status, isLoading } = useCloudSyncStatusQuery(projectId)
  const { data: config } = useCloudSyncConfigQuery(projectId)
  const { data: conflictsData } = useCloudSyncConflictsQuery(projectId)
  const { data: identity } = useOauthGithubIdentityQuery()
  const [snapshot, { isLoading: isSnapshotting }] = useCloudSyncSnapshotMutation()
  const [runSync, { isLoading: isSyncing }] = useCloudSyncRunMutation()
  const [snapshotPopoverOpen, setSnapshotPopoverOpen] = useState(false)
  const [message, setMessage] = useState("")

  if (isLoading || !status) {
    return (
      <Card className="p-4 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin" />
      </Card>
    )
  }

  const handleSnapshot = async () => {
    try {
      const result = await snapshot({
        projectId,
        message: message.trim() || null,
      }).unwrap()
      setSnapshotPopoverOpen(false)
      setMessage("")
      if (result.noChanges) {
        toast("No changes since last snapshot")
      } else if (result.commit) {
        toast.success(`Snapshot ${result.commit.shortSha} committed`)
      }
    } catch (err) {
      toast.error(`Snapshot failed: ${formatError(err)}`)
    }
  }

  const handleSyncNow = async () => {
    try {
      const result = await runSync(projectId).unwrap()
      switch (result.outcome) {
        case "NO_OP":
          toast("Already in sync — nothing to push or pull")
          break
        case "PUSHED":
          toast.success(`Pushed ${result.pushed} commit(s) to remote`)
          break
        case "FAST_FORWARDED":
          toast.success(`Pulled ${result.pulled} commit(s) from remote`)
          break
        case "MERGED":
          toast.success(
            result.pushed + result.pulled > 0
              ? `Merged ${result.pushed + result.pulled} commit(s) cleanly`
              : "Merged with remote",
          )
          break
        case "CONFLICTS_PENDING":
          toast.warning(
            `Found ${result.conflictCount ?? 0} conflict(s) — resolve them below to continue`,
            { duration: 8000 },
          )
          break
      }
    } catch (err) {
      toast.error(`Sync failed: ${formatError(err)}`)
    }
  }

  // Sync-now needs all three prerequisites; the first failing one drives the tooltip text.
  // Phase 5: also blocked while a conflict session is open — the user has to resolve
  // (or abort) the existing one first, otherwise the run would 409 SESSION_PENDING.
  const sessionPending = conflictsData?.activeSession === true
  const hasCredentials = identity?.connected === true || config?.tokenPresent === true
  const syncDisabledReason = (() => {
    if (!config?.enabled) return "Cloud sync disabled — enable it above"
    if (!config.repoUrl) return "Repository not selected"
    if (!hasCredentials) return "Connect GitHub or store a Personal Access Token"
    if (sessionPending) return "Resolve or abort the open conflict session first"
    return null
  })()
  const syncEnabled = !syncDisabledReason && !isSyncing

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Status</h2>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Working tree</Label>
            <div className="font-mono text-xs break-all">{status.workingTreePath}</div>
          </div>
          <RepoStatusBody status={status} />
          <LastSyncedBody config={config} />
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Popover open={snapshotPopoverOpen} onOpenChange={setSnapshotPopoverOpen}>
            <PopoverTrigger asChild>
              <Button disabled={isSnapshotting} variant="outline">
                <CloudUpload className="size-4 mr-1.5" />
                Take snapshot
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="end">
              <div className="space-y-2">
                <Label htmlFor="snapshot-message" className="text-xs">
                  Message (optional)
                </Label>
                <Input
                  id="snapshot-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What changed?"
                  className="text-xs h-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSnapshot()
                  }}
                  autoFocus
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSnapshot} disabled={isSnapshotting}>
                    <Check className="size-3.5 mr-1" />
                    {isSnapshotting ? "Committing…" : "Commit"}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            onClick={handleSyncNow}
            disabled={!syncEnabled}
            title={syncDisabledReason ?? undefined}
          >
            <RefreshCw className={`size-4 mr-1.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>
      {syncDisabledReason && (
        <div className="flex items-center gap-2 text-xs text-amber-600">
          <AlertTriangle className="size-3.5" />
          {syncDisabledReason}
        </div>
      )}
    </Card>
  )
}

function LastSyncedBody({ config }: { config: SyncConfig | undefined }) {
  if (!config?.lastSyncedSha) return null
  const when = config.lastSyncedAtMs ? new Date(config.lastSyncedAtMs).toLocaleString() : "—"
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground text-xs">Last synced</Label>
      <div className="text-xs">
        <span className="font-mono mr-2">{config.lastSyncedSha.slice(0, 7)}</span>
        <span className="text-muted-foreground">{when}</span>
      </div>
    </div>
  )
}

// ─── Activity panel ───────────────────────────────────────────────────

const ACTIVITY_PAGE_SIZE = 50
// Match the backend per-project cap (`SyncLogger.MAX_ENTRIES_PER_PROJECT`); a long-lived
// tab on a chatty project would otherwise grow unbounded.
const ACTIVITY_MAX_ENTRIES = 500

function ActivityPanel({ projectId }: { projectId: number }) {
  const [entries, setEntries] = useState<SyncLogEntry[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const oldestIdRef = useRef<number | null>(null)
  const loadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const [fetchActivity, { isFetching }] = useLazyCloudSyncActivityQuery()

  const loadOlder = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    setError(null)
    try {
      const page = await fetchActivity({
        projectId,
        limit: ACTIVITY_PAGE_SIZE,
        beforeId: oldestIdRef.current ?? undefined,
      }).unwrap()
      setEntries((prev) => mergeUniqueById(prev, page).slice(0, ACTIVITY_MAX_ENTRIES))
      if (page.length < ACTIVITY_PAGE_SIZE) setHasMore(false)
      const last = page[page.length - 1]
      if (last) oldestIdRef.current = last.id
    } catch (err) {
      setError(formatError(err))
    } finally {
      loadingRef.current = false
    }
  }, [fetchActivity, hasMore, projectId])

  // First page on mount. The parent remounts us per project via `key=`, so this
  // effectively runs once per project session.
  useEffect(() => {
    void loadOlder()
    // Only fire on mount; `loadOlder` depends on `hasMore` and we don't want a re-fetch
    // when it flips false at the end of pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const sub = lightingApi.cloudSync.subscribeLogAppended((event) => {
      if (event.projectId !== projectId) return
      setEntries((prev) => mergeUniqueById([event.entry], prev).slice(0, ACTIVITY_MAX_ENTRIES))
    })
    return () => sub.unsubscribe()
  }, [projectId])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadOlder()
        }
      },
      { rootMargin: "120px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadOlder])

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Activity</h2>
        <p className="text-xs text-muted-foreground">
          Sync events for this project (most recent first). Updates live while connected.
        </p>
      </div>
      {entries.length === 0 && isFetching ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No activity yet — events will appear here as syncs and snapshots run.
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto border rounded-md divide-y">
          {entries.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
          <div ref={sentinelRef} className="px-3 py-2 text-center text-xs text-muted-foreground">
            {error ? (
              <span className="text-destructive">Failed to load older activity: {error}</span>
            ) : isFetching ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" />
                Loading…
              </span>
            ) : hasMore ? (
              <button
                type="button"
                onClick={() => void loadOlder()}
                className="hover:text-foreground"
              >
                Load older
              </button>
            ) : (
              <span className="italic">No older entries</span>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function ActivityRow({ entry }: { entry: SyncLogEntry }) {
  const meta = activityLevelMeta(entry.level)
  return (
    <div className="flex items-start gap-2 px-3 py-2 text-xs">
      <meta.Icon className={`size-3.5 mt-0.5 shrink-0 ${meta.iconClassName}`} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={meta.badgeVariant} className="text-[10px] font-mono">
            {entry.event}
          </Badge>
          <span className="text-muted-foreground">
            {new Date(entry.tsMs).toLocaleString()}
          </span>
        </div>
        <div className={meta.messageClassName}>{entry.message}</div>
      </div>
    </div>
  )
}

function activityLevelMeta(level: SyncLogEntry["level"]) {
  switch (level) {
    case "ERROR":
      return {
        Icon: AlertCircle,
        iconClassName: "text-destructive",
        badgeVariant: "destructive" as const,
        messageClassName: "text-destructive break-words",
      }
    case "WARN":
      return {
        Icon: AlertTriangle,
        iconClassName: "text-amber-600",
        badgeVariant: "secondary" as const,
        messageClassName: "text-amber-700 dark:text-amber-400 break-words",
      }
    case "INFO":
    default:
      return {
        Icon: Info,
        iconClassName: "text-muted-foreground",
        badgeVariant: "outline" as const,
        messageClassName: "break-words",
      }
  }
}

// ─── History panel ────────────────────────────────────────────────────

const HISTORY_PAGE_SIZE = 30

function HistoryPanel({ projectId }: { projectId: number }) {
  const { data: firstPage, isLoading } = useCloudSyncLogQuery({
    projectId,
    limit: HISTORY_PAGE_SIZE,
  })
  const [olderPages, setOlderPages] = useState<CommitInfo[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchOlder, { isFetching }] = useLazyCloudSyncLogQuery()

  // Reset accumulated older pages only when HEAD actually moves (a new snapshot lands,
  // or a sync rewrites the tip). RTK Query hands us a fresh array reference on every
  // refetch even when the data is byte-identical — keying on the newest sha avoids
  // dropping pagination state for refetches that don't move HEAD.
  const headSha = firstPage?.[0]?.sha ?? null
  useEffect(() => {
    setOlderPages([])
    setHasMore(true)
    setError(null)
  }, [headSha])

  const commits = useMemo<CommitInfo[]>(() => {
    if (!firstPage) return []
    const seen = new Set(firstPage.map((c) => c.sha))
    const merged = [...firstPage]
    for (const c of olderPages) {
      if (!seen.has(c.sha)) {
        seen.add(c.sha)
        merged.push(c)
      }
    }
    return merged
  }, [firstPage, olderPages])

  const loadOlder = async () => {
    const last = commits[commits.length - 1]
    if (!last) return
    setError(null)
    try {
      const page = await fetchOlder({
        projectId,
        limit: HISTORY_PAGE_SIZE,
        before: last.sha,
      }).unwrap()
      setOlderPages((prev) => [...prev, ...page])
      if (page.length < HISTORY_PAGE_SIZE) setHasMore(false)
    } catch (err) {
      setError(formatError(err))
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">History</h2>
        <p className="text-xs text-muted-foreground">
          Recent snapshots (most recent first). Walk the same history outside the app
          with <code className="text-xs">git log</code> in the working tree.
        </p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : commits.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No snapshots yet — click &ldquo;Take snapshot&rdquo; above to create the first one.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Commit</TableHead>
                <TableHead className="hidden sm:table-cell w-44">When</TableHead>
                <TableHead className="hidden md:table-cell w-48">Attribution</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commits.map((commit) => (
                <TableRow key={commit.sha}>
                  <TableCell className="font-mono text-xs">{commit.shortSha}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                    {new Date(commit.whenMs).toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs">
                    <AttributionBadge commit={commit} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {commit.message.split("\n")[0]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-center gap-3 pt-1">
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
            {hasMore ? (
              <Button
                variant="outline"
                size="sm"
                onClick={loadOlder}
                disabled={isFetching}
              >
                {isFetching ? (
                  <>
                    <Loader2 className="size-3 mr-1 animate-spin" /> Loading…
                  </>
                ) : (
                  "Load older"
                )}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground italic">
                No older snapshots
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

function AttributionBadge({ commit }: { commit: CommitInfo }) {
  if (!commit.installShortUuid) {
    return <span className="text-muted-foreground">{commit.authorName}</span>
  }
  if (commit.installFriendlyName) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        by {commit.installFriendlyName}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] text-muted-foreground"
      title="No friendly name in installs.json — peer never published its registry entry."
    >
      (unknown @ {commit.installShortUuid})
    </Badge>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

function RepoStatusBody({ status }: { status: SyncStatus }) {
  if (!status.hasRepo) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No git repo yet — take the first snapshot to initialise it.
      </div>
    )
  }
  return (
    <>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs">HEAD</Label>
        {status.head ? (
          <div className="text-xs">
            <span className="font-mono mr-2">{status.head.shortSha}</span>
            <span>{status.head.message.split("\n")[0]}</span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No commits yet</div>
        )}
      </div>
      {status.dirty ? (
        <Badge variant="secondary">Working tree dirty</Badge>
      ) : status.head ? (
        <Badge variant="outline">Clean</Badge>
      ) : null}
    </>
  )
}

