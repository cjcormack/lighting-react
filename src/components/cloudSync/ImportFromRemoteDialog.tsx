import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RepoPicker } from "./RepoPicker"
import { useCloudSyncImportMutation } from "@/store/cloudSync"
import type { GithubRepo } from "@/store/oauthGithub"
import { formatError } from "@/lib/formatError"

interface ImportFromRemoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Drives the picker's connect-prompt — the import button itself is gated higher up. */
  oauthConnected: boolean
}

/**
 * Pick a remote repo + name and POST to `/cloud-sync/import` to clone it as a brand-new
 * local project. On success, navigates to the new project's sync drill-in so the user
 * can verify and run the first manual sync.
 *
 * Project-name input is pre-filled from the picked repo's `name` (e.g. `lighting7-show`),
 * but editable — backend collision handling lives in `ProjectImporter` so the UI just
 * surfaces whatever error comes back.
 */
export function ImportFromRemoteDialog({
  open,
  onOpenChange,
  oauthConnected,
}: ImportFromRemoteDialogProps) {
  const navigate = useNavigate()
  const [importFromRemote, { isLoading }] = useCloudSyncImportMutation()
  const [repo, setRepo] = useState<GithubRepo | null>(null)
  const [projectName, setProjectName] = useState("")
  // Track whether the user has typed in the name field — once they have, stop
  // overwriting their text on repo re-pick.
  const [nameTouched, setNameTouched] = useState(false)

  useEffect(() => {
    if (!open) {
      setRepo(null)
      setProjectName("")
      setNameTouched(false)
    }
  }, [open])

  const handleRepoChange = (next: GithubRepo) => {
    setRepo(next)
    if (!nameTouched) setProjectName(next.name)
  }

  const branch = repo?.defaultBranch ?? "main"
  const canSubmit = !!repo && projectName.trim().length > 0 && !isLoading

  const handleImport = async () => {
    if (!repo) return
    try {
      const result = await importFromRemote({
        repoUrl: repo.cloneUrl,
        branch,
        projectName: projectName.trim(),
      }).unwrap()
      toast.success(`Imported "${result.name}" from ${repo.fullName}`)
      onOpenChange(false)
      navigate(`/sync/projects/${result.projectId}`)
    } catch (err) {
      toast.error(`Import failed: ${formatError(err)}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from remote</DialogTitle>
          <DialogDescription>
            Clone an existing GitHub repository as a new local project. The remote&rsquo;s
            default branch is used and cloud sync is enabled automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Repository *</Label>
            <RepoPicker
              value={repo?.cloneUrl ?? null}
              onChange={handleRepoChange}
              oauthConnected={oauthConnected}
            />
            {repo && (
              <p className="text-[10px] text-muted-foreground font-mono break-all">
                {repo.cloneUrl}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="import-project-name">Project name *</Label>
            <Input
              id="import-project-name"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value)
                setNameTouched(true)
              }}
              placeholder={repo?.name ?? "Project name"}
              disabled={!repo}
            />
            <p className="text-[10px] text-muted-foreground">
              Defaults to the repo name; rename if it would collide with an existing project.
            </p>
          </div>
          {repo && (
            <div className="text-xs text-muted-foreground">
              Branch: <span className="font-mono">{branch}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!canSubmit}>
            {isLoading ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
