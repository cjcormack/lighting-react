import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
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
import { Loader2, CloudUpload, Check } from "lucide-react"
import { useCurrentProjectQuery, useProjectQuery } from "@/store/projects"
import {
  useCloudSyncConfigQuery,
  useCloudSyncStatusQuery,
  useCloudSyncLogQuery,
  useUpdateCloudSyncConfigMutation,
  useCloudSyncSnapshotMutation,
  type SyncStatus,
} from "@/store/cloudSync"
import { Breadcrumbs } from "@/components/Breadcrumbs"

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
      <HistoryPanel projectId={projectIdNum} />
    </div>
  )
}

// ─── Configuration panel ──────────────────────────────────────────────

function ConfigPanel({ projectId }: { projectId: number }) {
  const { data: config, isLoading } = useCloudSyncConfigQuery(projectId)
  const [updateConfig, { isLoading: isSaving }] = useUpdateCloudSyncConfigMutation()

  const [branch, setBranch] = useState("main")
  const [repoUrl, setRepoUrl] = useState("")

  // Hydrate local form state from server data when it lands.
  useEffect(() => {
    if (config) {
      setBranch(config.branch)
      setRepoUrl(config.repoUrl ?? "")
    }
  }, [config])

  if (isLoading || !config) {
    return (
      <Card className="p-4 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin" />
      </Card>
    )
  }

  // Normalise both sides to "trimmed-or-null" so empty string and missing repoUrl compare equal.
  const trimmedRepoUrl = repoUrl.trim() || null
  const dirty = branch !== config.branch || trimmedRepoUrl !== (config.repoUrl ?? null)
  const branchValid = branch.trim().length > 0

  const handleSave = async () => {
    if (!branchValid) return
    try {
      await updateConfig({
        projectId,
        body: { branch: branch.trim(), repoUrl: trimmedRepoUrl },
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
          Branch defaults to <code className="text-xs">main</code>. Repo URL is
          recorded for future remote sync; the local snapshot flow doesn&rsquo;t
          use it.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="sync-branch">Branch *</Label>
          <Input
            id="sync-branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sync-repo-url">Repository URL</Label>
          <Input
            id="sync-repo-url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/you/lighting7-show.git"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!dirty || !branchValid || isSaving}
        >
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  )
}

// ─── Status + snapshot panel ──────────────────────────────────────────

function StatusPanel({ projectId }: { projectId: number }) {
  const { data: status, isLoading } = useCloudSyncStatusQuery(projectId)
  const [snapshot, { isLoading: isSnapshotting }] = useCloudSyncSnapshotMutation()
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
        </div>
        <Popover open={snapshotPopoverOpen} onOpenChange={setSnapshotPopoverOpen}>
          <PopoverTrigger asChild>
            <Button disabled={isSnapshotting}>
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
      </div>
    </Card>
  )
}

// ─── History panel ────────────────────────────────────────────────────

function HistoryPanel({ projectId }: { projectId: number }) {
  const { data: log, isLoading } = useCloudSyncLogQuery({ projectId })

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
      ) : !log || log.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No snapshots yet — click &ldquo;Take snapshot&rdquo; above to create the first one.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Commit</TableHead>
              <TableHead className="hidden sm:table-cell w-44">When</TableHead>
              <TableHead className="hidden md:table-cell w-44">Author</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {log.map((commit) => (
              <TableRow key={commit.sha}>
                <TableCell className="font-mono text-xs">{commit.shortSha}</TableCell>
                <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                  {new Date(commit.whenMs).toLocaleString()}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs">
                  {commit.authorName}
                </TableCell>
                <TableCell className="text-xs">
                  {commit.message.split("\n")[0]}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
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

function formatError(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { error?: string } }).data
    if (data?.error) return data.error
  }
  if (err && typeof err === "object" && "status" in err) {
    return `HTTP ${(err as { status: number }).status}`
  }
  return String(err)
}
