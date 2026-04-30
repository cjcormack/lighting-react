import { useEffect } from "react"
import { useDispatch } from "react-redux"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, AlertTriangle, GitMerge, X } from "lucide-react"
import { lightingApi } from "@/api/lightingApi"
import { restApi } from "@/store/restApi"
import {
  useCloudSyncConflictsQuery,
  useCloudSyncResolveMutation,
  useCloudSyncApplyMutation,
  useCloudSyncAbortMutation,
  type ConflictDto,
  type ConflictResolution,
} from "@/store/cloudSync"
import { formatError } from "@/lib/formatError"

/**
 * Phase 5 conflict-resolution UI: a flat list of records that diverged on both sides.
 * The user picks `Use local` / `Use remote` per row; once every row has a choice,
 * `Apply` commits the merged tree and pushes. `Abort` drops the session and reverts
 * the working tree to its pre-fetch SHA.
 *
 * Phase 5 deliberately doesn't render the JSON content — the toggle buttons are enough
 * for a "minimal UX" to verify multi-master correctness. Phase 6 wires up a three-pane
 * diff over the same `localJson` / `remoteJson` / `baseJson` fields the API already
 * returns.
 */
export function ConflictPanel({ projectId }: { projectId: number }) {
  const { data, isLoading } = useCloudSyncConflictsQuery(projectId)
  const [resolve] = useCloudSyncResolveMutation()
  const [apply, { isLoading: isApplying }] = useCloudSyncApplyMutation()
  const [abort, { isLoading: isAborting }] = useCloudSyncAbortMutation()
  const dispatch = useDispatch()

  // Refresh the conflict query when the WS broadcasts a new session — covers the case
  // where the run was triggered from a different tab. RTK already invalidates on the
  // mutation, but the WS catches the cross-tab case.
  useEffect(() => {
    const sub = lightingApi.cloudSync.subscribeConflictsPending(() => {
      dispatch(restApi.util.invalidateTags(['CloudSyncConflicts', 'CloudSyncStatus']))
    })
    return () => sub.unsubscribe()
  }, [dispatch])

  if (isLoading || !data) {
    return null
  }
  if (!data.activeSession) {
    return null
  }

  const handleChoose = async (conflict: ConflictDto, choice: ConflictResolution) => {
    try {
      await resolve({
        projectId,
        resolutions: [
          {
            tableName: conflict.tableName,
            recordUuid: conflict.recordUuid,
            resolution: choice,
          },
        ],
      }).unwrap()
    } catch (err) {
      toast.error(`Failed to record resolution: ${formatError(err)}`)
    }
  }

  const handleApply = async () => {
    try {
      const result = await apply(projectId).unwrap()
      toast.success(result.message || "Conflicts applied and pushed")
    } catch (err) {
      toast.error(`Apply failed: ${formatError(err)}`)
    }
  }

  const handleAbort = async () => {
    try {
      await abort(projectId).unwrap()
      toast("Session aborted; local working tree reset")
    } catch (err) {
      toast.error(`Abort failed: ${formatError(err)}`)
    }
  }

  const allResolved = data.conflicts.every((c) => c.resolution != null)
  const unresolvedCount = data.conflicts.filter((c) => c.resolution == null).length
  const sessionLabel = data.sessionId ? `#${data.sessionId}` : ""

  return (
    <Card className="p-4 space-y-3 border-amber-500/50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <GitMerge className="size-4 text-amber-600" />
            Conflicts to resolve {sessionLabel}
          </h2>
          <p className="text-xs text-muted-foreground">
            Both sides changed {data.conflicts.length} record(s). Pick whose version to
            keep on each row, then click <strong>Apply</strong> to commit and push.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleApply} disabled={!allResolved || isApplying || isAborting}>
            {isApplying ? "Applying…" : "Apply"}
          </Button>
          <Button variant="outline" onClick={handleAbort} disabled={isApplying || isAborting}>
            <X className="size-4 mr-1" />
            {isAborting ? "Aborting…" : "Abort"}
          </Button>
        </div>
      </div>

      {!allResolved && (
        <div className="flex items-center gap-2 text-xs text-amber-600">
          <AlertTriangle className="size-3.5" />
          {unresolvedCount} of {data.conflicts.length} unresolved
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Type</TableHead>
            <TableHead>Record</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-56 text-right">Resolution</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.conflicts.map((c) => (
            <TableRow key={`${c.tableName}/${c.recordUuid}`}>
              <TableCell className="text-xs font-mono">{c.tableName}</TableCell>
              <TableCell className="text-xs font-mono break-all">
                {c.recordUuid.slice(0, 8)}…
              </TableCell>
              <TableCell>
                {c.resolution ? (
                  <Badge variant="secondary">{c.resolution}</Badge>
                ) : (
                  <Badge variant="outline">Unresolved</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex gap-1">
                  <Button
                    size="sm"
                    variant={c.resolution === "LOCAL" ? "default" : "outline"}
                    onClick={() => handleChoose(c, "LOCAL")}
                    disabled={isApplying || isAborting}
                  >
                    Use local
                  </Button>
                  <Button
                    size="sm"
                    variant={c.resolution === "REMOTE" ? "default" : "outline"}
                    onClick={() => handleChoose(c, "REMOTE")}
                    disabled={isApplying || isAborting}
                  >
                    Use remote
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-[11px] text-muted-foreground italic">
        Phase 5 resolves edits made on both sides. A record deleted on one machine
        while being edited on another may still resurrect — Phase 7 will fix that
        with tombstones.
      </p>

      {isApplying && (
        <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin mr-2" />
          Applying resolutions…
        </div>
      )}
    </Card>
  )
}

