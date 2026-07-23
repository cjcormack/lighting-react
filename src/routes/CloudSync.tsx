import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { useDispatch } from "react-redux"
import { lightingApi } from "@/api/lightingApi"
import { restApi } from "@/store/restApi"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  CloudDownload,
  Info,
  Github,
  Unlink,
} from "lucide-react"
import { useProjectListQuery } from "@/store/projects"
import {
  useCloudSyncConfigQuery,
  useCloudSyncConfigsQuery,
  useCloudSyncStatusQuery,
  useCloudSyncLogQuery,
  useLazyCloudSyncLogQuery,
  useLazyCloudSyncActivityQuery,
  useCloudSyncConflictsQuery,
  useUpdateCloudSyncConfigMutation,
  useCloudSyncDisconnectMutation,
  useCloudSyncReconnectMutation,
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
import { useOauthGithubIdentityQuery, type GithubRepo } from "@/store/oauthGithub"
import { ConflictPanel } from "@/components/cloudSync/ConflictPanel"
import { IdentityRow } from "@/components/cloudSync/IdentityRow"
import { CreateRepoDialog } from "@/components/cloudSync/CreateRepoDialog"
import { AddRemoteProjectDialog } from "@/components/cloudSync/ImportFromRemoteDialog"
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

// ─── Hub body (rendered as the Sync tab inside Install Settings) ─────

function AddRemoteProjectButton({
  oauthConnected,
  onClick,
}: {
  oauthConnected: boolean
  onClick: () => void
}) {
  const button = (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={!oauthConnected}
      onClick={oauthConnected ? onClick : undefined}
    >
      <CloudDownload className="size-3.5" />
      Add remote project
    </Button>
  )
  if (oauthConnected) return button
  // tabIndex on the wrapper is the documented Radix workaround for tooltips on disabled
  // controls — disabled buttons don't dispatch the pointer events the tooltip listens for.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent side="left">
        Connect GitHub above to add a synced project from a remote repository.
      </TooltipContent>
    </Tooltip>
  )
}

export function CloudSyncHubBody() {
  const { data: projects, isLoading: projectsLoading } = useProjectListQuery()
  const { data: configs, isLoading: configsLoading } = useCloudSyncConfigsQuery()
  const { data: identity } = useOauthGithubIdentityQuery()
  const [importOpen, setImportOpen] = useState(false)
  const dispatch = useDispatch()
  const isLoading = projectsLoading || configsLoading
  const oauthConnected = identity?.connected === true

  // Pick up imports done from another tab — the importing tab itself relies on the
  // mutation's invalidatesTags to refresh, but a WS-only listener catches the cross-tab
  // case without polling.
  useEffect(() => {
    const sub = lightingApi.cloudSync.subscribeProjectImported(() => {
      dispatch(restApi.util.invalidateTags(['ProjectList', 'CloudSyncConfig']))
    })
    return () => sub.unsubscribe()
  }, [dispatch])

  return (
    <div className="space-y-4 max-w-5xl">
      <Card className="p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">GitHub</h2>
          <p className="text-xs text-muted-foreground">
            Connect once — the same identity is used by every project.
          </p>
        </div>
        <IdentityRow projectId={null} />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Projects</h2>
            <p className="text-xs text-muted-foreground">
              Select a project to manage its sync, take snapshots, or resolve conflicts.
            </p>
          </div>
          <AddRemoteProjectButton
            oauthConnected={oauthConnected}
            onClick={() => setImportOpen(true)}
          />
        </div>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !projects || projects.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No projects yet — create one from the Projects page.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Sync</TableHead>
                <TableHead className="hidden md:table-cell">Repository</TableHead>
                <TableHead className="hidden sm:table-cell">Branch</TableHead>
                <TableHead className="hidden lg:table-cell">Last synced</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <ProjectSyncRow
                  key={project.id}
                  projectId={project.id}
                  projectName={project.name}
                  isActive={project.isCurrent}
                  config={configs?.[String(project.id)]}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <AddRemoteProjectDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        oauthConnected={oauthConnected}
      />
    </div>
  )
}

// ─── Hub redirect (legacy /sync paths land here) ──────────────────────

export function CloudSyncHubRedirect() {
  return <Navigate to="/install/sync" replace />
}

function ProjectSyncRow({
  projectId,
  projectName,
  isActive,
  config,
}: {
  projectId: number
  projectName: string
  isActive: boolean
  /** Slice of the batch `useCloudSyncConfigsQuery()` map; undefined when this project has never had a sync_config row. */
  config: SyncConfig | undefined
}) {
  const navigate = useNavigate()
  const repoLabel = formatRepoUrl(config?.repoUrl ?? null)
  const onOpen = () => navigate(`/projects/${projectId}/settings/sync`)

  return (
    <TableRow className="cursor-pointer hover:bg-accent/50" onClick={onOpen}>
      <TableCell>
        <div className="font-medium text-sm flex items-center gap-2">
          {projectName}
          {isActive && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0">active</Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {config?.synced ? (
          <Badge variant="secondary" className="text-[10px]">synced</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">not synced</Badge>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono truncate max-w-[260px]">
        {repoLabel ?? <span className="italic">—</span>}
      </TableCell>
      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
        {config?.branch ?? "—"}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
        {config?.lastSyncedAtMs
          ? new Date(config.lastSyncedAtMs).toLocaleString()
          : <span className="italic">never</span>}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpen() }}>
          Open
          <ChevronRight className="size-3.5 ml-1" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function formatRepoUrl(url: string | null): string | null {
  if (!url) return null
  // GitHub URLs are the dominant case; show just owner/repo for brevity.
  const m = url.match(/github\.com[/:]([^/]+\/[^/.]+)/i)
  return m ? m[1] : url
}

// ─── Per-project sync (Project Settings → Sync tab) ──────────────────

/**
 * The per-project cloud-sync UI, rendered inside Project Settings → Sync. The status /
 * conflict / activity / history panels only make sense once a repo is attached, so they
 * are gated on `config.synced`; the config panel handles both the not-synced (attach)
 * and synced states.
 */
export function ProjectSyncContent({ projectId }: { projectId: number }) {
  const dispatch = useDispatch()
  const { data: config, isLoading } = useCloudSyncConfigQuery(projectId)

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

  if (isLoading && !config) {
    return (
      <div className="p-4 max-w-4xl">
        <Card className="p-4 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin" />
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      <ConfigPanel projectId={projectId} />
      {config?.synced && (
        <>
          <StatusPanel projectId={projectId} />
          <ConflictPanel projectId={projectId} />
          {/* key= forces a fresh mount per project so accumulated paged state resets cleanly. */}
          <ActivityPanel key={`activity-${projectId}`} projectId={projectId} />
          <HistoryPanel key={`history-${projectId}`} projectId={projectId} />
        </>
      )}
    </div>
  )
}

// ─── Configuration panel ──────────────────────────────────────────────

const AUTO_SYNC_INTERVAL_HINT =
  `Minimum ${AUTO_SYNC_MIN_INTERVAL_SECONDS}s. The first tick fires after one full ` +
  `interval — recently-saved changes are not pushed mid-form-submit.`

/**
 * Cloud-sync configuration. A project is synced iff a repository is attached, so this
 * panel has two shapes: an attach call-to-action when not synced, and a read-only
 * summary + disconnect when synced.
 */
function ConfigPanel({ projectId }: { projectId: number }) {
  const { data: config, isLoading } = useCloudSyncConfigQuery(projectId)

  if (isLoading || !config) {
    return (
      <Card className="p-4 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin" />
      </Card>
    )
  }

  return config.synced
    ? <SyncedConfigPanel projectId={projectId} config={config} />
    : <AttachConfigPanel projectId={projectId} config={config} />
}

/** Not-synced state: connect GitHub, create a new repo (or reconnect a remembered one). */
function AttachConfigPanel({ projectId, config }: { projectId: number; config: SyncConfig }) {
  const { data: identity } = useOauthGithubIdentityQuery()
  const [updateConfig, { isLoading: isAttaching }] = useUpdateCloudSyncConfigMutation()
  const [reconnect, { isLoading: isReconnecting }] = useCloudSyncReconnectMutation()
  const [runSync] = useCloudSyncRunMutation()
  const [createOpen, setCreateOpen] = useState(false)
  const oauthConnected = identity?.connected === true

  // Fire the first push so a freshly-attached repo doesn't sit empty. Non-fatal: if it
  // fails (e.g. the GitHub App can't see the new repo yet) sync is still on and the user
  // can retry "Sync now".
  const firstSync = async () => {
    try {
      await runSync(projectId).unwrap()
    } catch (err) {
      toast.error(`Initial sync didn't complete: ${formatError(err)}`)
    }
  }

  const handleAttach = async (repo: GithubRepo) => {
    try {
      await updateConfig({
        projectId,
        body: { repoUrl: repo.cloneUrl, branch: repo.defaultBranch || "main" },
      }).unwrap()
      toast.success(`Cloud sync enabled — ${repo.fullName}`)
      void firstSync()
    } catch (err) {
      toast.error(`Failed to enable cloud sync: ${formatError(err)}`)
    }
  }

  const handleReconnect = async (repoUrl: string) => {
    try {
      await reconnect({ projectId, body: { repoUrl } }).unwrap()
      toast.success("Reconnected — cloud sync re-enabled")
      void firstSync()
    } catch (err) {
      toast.error(`Reconnect failed: ${formatError(err)}`)
    }
  }

  const enableButton = (
    <Button onClick={() => setCreateOpen(true)} disabled={!oauthConnected || isAttaching}>
      <CloudUpload className="size-4 mr-1.5" />
      Enable cloud sync
    </Button>
  )

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Cloud sync</h2>
        <p className="text-xs text-muted-foreground">
          This project isn&rsquo;t synced yet. Create a repository to start syncing —
          changes are pushed and pulled automatically.
        </p>
      </div>

      {/* Identity row — connecting GitHub is a prerequisite for creating a repo. */}
      <div className="border rounded-md p-3 bg-muted/20">
        <IdentityRow projectId={projectId} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {oauthConnected ? (
          enableButton
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>{enableButton}</span>
            </TooltipTrigger>
            <TooltipContent>Connect GitHub above to create a repository.</TooltipContent>
          </Tooltip>
        )}
        <span className="text-xs text-muted-foreground">
          Creates a new private repository for this project.
        </span>
      </div>

      {config.linkedRepos.length > 0 && (
        <div className="border-t pt-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Previously linked</Label>
          <ul className="space-y-1">
            {config.linkedRepos.map((r) => (
              <li key={r.repoUrl} className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono truncate">
                  {formatRepoUrl(r.repoUrl) ?? r.repoUrl}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReconnect(r.repoUrl)}
                  disabled={isReconnecting}
                >
                  Reconnect
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CreateRepoDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(repo) => {
          setCreateOpen(false)
          void handleAttach(repo)
        }}
      />
    </Card>
  )
}

/** Synced state: read-only repo summary, Advanced (auto-sync + PAT), and Disconnect. */
function SyncedConfigPanel({ projectId, config }: { projectId: number; config: SyncConfig }) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const repoLabel = formatRepoUrl(config.repoUrl) ?? config.repoUrl ?? "—"

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Cloud sync</h2>
          <p className="text-xs text-muted-foreground">
            Synced to a GitHub repository. Changes push and pull automatically.
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">synced</Badge>
      </div>

      {/* Identity row — surfaces re-auth if the GitHub connection lapses. */}
      <div className="border rounded-md p-3 bg-muted/20">
        <IdentityRow projectId={projectId} />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Repository</Label>
        <div className="flex items-center gap-2 min-w-0">
          <Github className="size-4 shrink-0 opacity-70" />
          <span className="text-sm font-medium truncate">{repoLabel}</span>
          <Badge variant="outline" className="text-[10px] shrink-0">{config.branch}</Badge>
        </div>
        {config.repoUrl && (
          <p className="text-[10px] text-muted-foreground font-mono break-all">
            {config.repoUrl}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          The repository can&rsquo;t be changed — disconnect to link a different one.
        </p>
      </div>

      {/* Advanced — auto-sync cadence + access token, collapsed by default. */}
      <div className="border-t pt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {advancedOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Advanced — auto-sync &amp; access token
          {config.tokenPresent && (
            <Badge variant="secondary" className="ml-2 text-[10px]">PAT stored</Badge>
          )}
        </button>
        {advancedOpen && (
          <div className="mt-3 space-y-4">
            <AutoSyncForm projectId={projectId} config={config} />
            <div className="border-t pt-4">
              <PatPanel projectId={projectId} config={config} />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end border-t pt-3">
        <Button variant="outline" onClick={() => setDisconnectOpen(true)}>
          <Unlink className="size-3.5 mr-1.5" />
          Disconnect repository
        </Button>
      </div>

      <DisconnectConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        projectId={projectId}
        repoLabel={repoLabel}
      />
    </Card>
  )
}

/** Auto-sync toggle + interval, saved independently (advanced, defaults on). */
function AutoSyncForm({ projectId, config }: { projectId: number; config: SyncConfig }) {
  const [updateConfig, { isLoading: isSaving }] = useUpdateCloudSyncConfigMutation()
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(config.autoSyncEnabled)
  const [intervalSecondsStr, setIntervalSecondsStr] = useState(
    String(config.autoSyncIntervalMs != null
      ? Math.round(config.autoSyncIntervalMs / 1000)
      : AUTO_SYNC_MIN_INTERVAL_SECONDS),
  )

  // Reseed from server state (keyed on the values, not the object, so a refetch that
  // doesn't move these doesn't clobber an in-progress edit).
  useEffect(() => {
    setAutoSyncEnabled(config.autoSyncEnabled)
    setIntervalSecondsStr(String(config.autoSyncIntervalMs != null
      ? Math.round(config.autoSyncIntervalMs / 1000)
      : AUTO_SYNC_MIN_INTERVAL_SECONDS))
  }, [config.autoSyncEnabled, config.autoSyncIntervalMs])

  const intervalSecondsNum = Number(intervalSecondsStr)
  const intervalValid = Number.isFinite(intervalSecondsNum)
    && Number.isInteger(intervalSecondsNum)
    && intervalSecondsNum >= AUTO_SYNC_MIN_INTERVAL_SECONDS
  const intervalChanged = autoSyncEnabled
    && intervalValid
    && intervalSecondsNum * 1000 !== config.autoSyncIntervalMs
  const dirty = autoSyncEnabled !== config.autoSyncEnabled || intervalChanged

  const handleSave = async () => {
    if (autoSyncEnabled && !intervalValid) return
    try {
      await updateConfig({
        projectId,
        body: {
          autoSyncEnabled,
          autoSyncIntervalMs: autoSyncEnabled ? intervalSecondsNum * 1000 : null,
        },
      }).unwrap()
      toast.success("Auto-sync settings saved")
    } catch (err) {
      toast.error(`Failed to save auto-sync settings: ${formatError(err)}`)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          id="auto-sync-enabled"
          type="checkbox"
          checked={autoSyncEnabled}
          onChange={(e) => setAutoSyncEnabled(e.target.checked)}
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
            value={intervalSecondsStr}
            onChange={(e) => setIntervalSecondsStr(e.target.value)}
            disabled={!autoSyncEnabled}
            className={autoSyncEnabled && !intervalValid ? "border-destructive" : undefined}
          />
        </div>
        <p className="text-xs text-muted-foreground self-end pb-1">{AUTO_SYNC_INTERVAL_HINT}</p>
      </div>
      {autoSyncEnabled && !intervalValid && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="size-3" />
          Interval must be a whole number ≥ {AUTO_SYNC_MIN_INTERVAL_SECONDS} seconds.
        </p>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || (autoSyncEnabled && !intervalValid) || isSaving}
        >
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}

/** Confirmation for disconnecting cloud sync. */
function DisconnectConfirmDialog({
  open,
  onOpenChange,
  projectId,
  repoLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  repoLabel: string
}) {
  const [disconnect, { isLoading }] = useCloudSyncDisconnectMutation()

  const handleDisconnect = async () => {
    try {
      await disconnect(projectId).unwrap()
      toast.success("Disconnected from cloud sync")
      onOpenChange(false)
    } catch (err) {
      toast.error(`Disconnect failed: ${formatError(err)}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect cloud sync?</DialogTitle>
          <DialogDescription>
            This stops syncing <span className="font-mono">{repoLabel}</span> and turns off
            auto-sync. Your local project and its history are kept, and the repository is
            remembered so you can reconnect later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDisconnect} disabled={isLoading}>
            {isLoading ? "Disconnecting…" : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    if (!config?.repoUrl) return "No repository attached — enable cloud sync first"
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

