import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Circle, Layers, Loader2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import {
  useCopyLookMutation,
  useDeleteLookMutation,
  useLookListQuery,
} from '../store/looks'
import { LookListRow } from '../components/looks/LookListRow'
import { LookDetailSheet } from '../components/looks/LookDetailSheet'
import { RecordLookSheet } from '../components/programmer/RecordLookSheet'
import { CopyLookDialog } from '../components/looks/CopyLookDialog'
import type { LookInUseError, LookSummary } from '../api/looksApi'
import { useProgrammerSummaryQuery } from '../store/programmer'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { formatError } from '../lib/formatError'
import { CurrentProjectRedirect } from '../components/CurrentProjectRedirect'

/** Redirect `/looks` → `/projects/:projectId/looks`. */
export function LooksRedirect() {
  return <CurrentProjectRedirect to="looks" />
}

/**
 * The Look library: named states over named fixtures, applied to a cue as layers.
 *
 * **One kind of thing, and no New button.** Session 3 moved the other half out — a value you point at
 * a selection is a *template*, with its own entity, its own page and its own family-native editor —
 * and what is left here is uniformly **recorded**: from the programmer, or by promoting a selection
 * with Make layer. There is no hand-authored Look, which is why the only create affordance is Record.
 * That is D9, and it is why the two sections and the type-driven editor split are both gone with it.
 *
 * **No family filter either.** It lived here and moved to `/templates` along with the argument that
 * actually justifies one: a Look's families are *derived* and one may span several, so filtering by a
 * family would hide most of the library from most filters. A template is in exactly one family, which
 * is the case a filter partitions cleanly.
 */
export function ProjectLooks() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: looks, isLoading: looksLoading } = useLookListQuery({ projectId: projectIdNum })

  const [copyLook] = useCopyLookMutation()
  const [deleteLook, { isLoading: isDeleting }] = useDeleteLookMutation()

  const [searchParams, setSearchParams] = useSearchParams()
  /**
   * The Look the detail sheet is open on, held **by id** and re-read from the list.
   *
   * Holding the summary object itself would freeze it at the moment the row was clicked, and the
   * sheet edits name and notes: after a successful save it would still be measuring `dirty` against
   * the pre-save name, leaving Save enabled, the title stale, and Escape asking to discard changes
   * that were already written.
   */
  const [detailLookId, setDetailLookId] = useState<number | null>(null)
  const [copyingLook, setCopyingLook] = useState<LookSummary | null>(null)
  /** A refused delete, held so the guard can name the cues and offer "delete anyway". */
  const [inUse, setInUse] = useState<{ lookId: number; body: LookInUseError } | null>(null)
  /**
   * A row-menu delete waiting to be confirmed.
   *
   * The menu item cannot delete straight away: it sits one stray click from Duplicate in the same
   * dropdown, and a Look a cue layers is not recoverable.
   */
  const [confirmDelete, setConfirmDelete] = useState<LookSummary | null>(null)
  /** Record-from-programmer — the only way a Look is made. */
  const [recordOpen, setRecordOpen] = useState(false)

  const isCurrentProject = currentProject?.id === projectIdNum

  // Gates Record. The programmer is machine-wide rather than per-project, so this is read here as
  // well as in its own toolbar — recording an empty programmer would make a Look with no rows, which
  // reads as a broken save rather than as "there was nothing to record".
  const { data: programmerSummary } = useProgrammerSummaryQuery()
  const programmerEntryCount = programmerSummary?.entryCount ?? 0

  // `?action=record` opens the record sheet and strips the param. It replaces `?action=new`: there is
  // no hand-authored Look to open a create form for, so the command palette's entry point is the one
  // gesture that does make one.
  useEffect(() => {
    if (searchParams.get('action') === 'record' && isCurrentProject) {
      setRecordOpen(true)
      const params = new URLSearchParams(searchParams)
      params.delete('action')
      setSearchParams(params, { replace: true })
    }
  }, [searchParams, isCurrentProject, setSearchParams])

  // Re-read rather than remembered — see `detailLookId`. Null once the Look is gone, which is what a
  // delete from another client should do to an open sheet.
  const detailLook = useMemo(
    () => (detailLookId == null ? null : (looks?.find((l) => l.id === detailLookId) ?? null)),
    [looks, detailLookId],
  )

  // Holding the id means `open` and `look` can now disagree, and `LookDetailSheet` renders nothing
  // without a Look — so a Look that leaves the list under an open sheet (deleted from another
  // client) would leave Radix mounted-but-blank: no close transition, and focus never handed back to
  // the row that opened it. Close it for real instead.
  useEffect(() => {
    if (detailLookId != null && looks != null && detailLook == null) setDetailLookId(null)
  }, [detailLookId, looks, detailLook])

  const handleRowClick = (look: LookSummary) => {
    if (!isCurrentProject) {
      setCopyingLook(look)
      return
    }
    // One editor for every row now: a Look is recorded, so the sheet is read-only about values on
    // purpose and points at the record loop. The type-driven fork this replaced sent deferred Looks
    // to a value grid, and those are templates.
    setDetailLookId(look.id)
  }

  const handleDuplicate = async (look: LookSummary) => {
    const existingNames = new Set(looks?.map((l) => l.name) ?? [])
    let newName = `${look.name} (Copy)`
    if (existingNames.has(newName)) {
      let n = 2
      while (existingNames.has(`${look.name} (Copy ${n})`)) n++
      newName = `${look.name} (Copy ${n})`
    }
    // The **copy route**, with this project as the target, rather than a client-side rebuild from a
    // create call. Two reasons: the rows and effects come across without this client fetching them,
    // and every child gets a fresh uuid server-side — reusing the source's would make sync treat the
    // copy and the original as one record.
    //
    // `copyLook` is in `SILENT_ENDPOINTS` (CopyLookDialog renders its own alert), so a failure here
    // has nothing reporting it — hence the explicit toast rather than `ignoreReportedError`.
    await copyLook({ projectId: projectIdNum, lookId: look.id, targetProjectId: projectIdNum, newName })
      .unwrap()
      .catch((err) => toast.error(formatError(err)))
  }

  /**
   * Delete a Look.
   *
   * The 409 is an ordinary step rather than a failure — `deleteLook` is in `SILENT_ENDPOINTS`
   * precisely so this renders it inline instead of toasting it — so a refused delete opens the guard,
   * which names the cues that would lose a layer before offering to do it anyway.
   */
  const handleDelete = async (lookId: number, force: boolean) => {
    try {
      await deleteLook({ projectId: projectIdNum, lookId, force }).unwrap()
      setInUse(null)
      setDetailLookId(null)
    } catch (err) {
      const body = (err as { data?: LookInUseError })?.data
      if (body?.code === 'LOOK_IN_USE') {
        setInUse({ lookId, body })
        return
      }
      // `deleteLook` is silenced for the 409 above; anything else has no other reporter, and a
      // delete that quietly did nothing is the worst of both outcomes.
      toast.error(formatError(err))
    }
  }

  if (projectLoading || currentLoading || looksLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!project) {
    return <Card className="m-4 p-4 text-center text-muted-foreground">Project not found</Card>
  }

  const total = looks?.length ?? 0

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-4">
        <Breadcrumbs projectName={project.name} currentPage="Looks" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Looks</h1>
            <p className="text-sm text-muted-foreground">
              {isCurrentProject
                ? 'Named states over named fixtures, applied to a cue as layers. Every one is recorded — from the programmer, or by promoting a selection with Make layer.'
                : `Viewing looks for "${project.name}". Copy them to your active project to use them.`}
            </p>
          </div>
          {isCurrentProject && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={programmerEntryCount === 0}
              title={
                programmerEntryCount === 0
                  ? 'The programmer is empty — busk a state first'
                  : 'Write the programmer into a look'
              }
              onClick={() => setRecordOpen(true)}
            >
              <Circle className="size-3.5" />
              Record from programmer
            </Button>
          )}
        </div>

        {/* The pointer across, which `LookLibrary.dc.html` draws and which this page needs more than
            most: an operator looking for "Amber Key" will look here first, because that is where it
            used to be. */}
        <p className="text-[11px] text-muted-foreground">
          Looking for a single value or effect like <em>Amber Key</em> or <em>Slow Breathe</em>?
          Those are{' '}
          <Link
            to={`/projects/${projectIdNum}/templates`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            templates
          </Link>{' '}
          — one attribute family each, applied to a selection.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {total === 0 ? (
          <Card className="p-8 text-center">
            <Layers className="size-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {isCurrentProject
                ? 'No looks yet. Busk a state in the programmer, then record it — there is no hand-authored look.'
                : 'No looks in this project.'}
            </p>
          </Card>
        ) : (
          <div className="rounded-lg border divide-y">
            {(looks ?? []).map((look) => (
              <LookListRow
                key={look.id}
                look={look}
                onClick={() => handleRowClick(look)}
                onEdit={isCurrentProject ? () => handleRowClick(look) : undefined}
                onDuplicate={isCurrentProject ? () => handleDuplicate(look) : undefined}
                onCopy={() => setCopyingLook(look)}
                onDelete={isCurrentProject ? () => setConfirmDelete(look) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* The row menu's confirmation. It is the only entry point that would otherwise destroy a Look
          on a single click. */}
      <Dialog open={confirmDelete != null} onOpenChange={(next) => !next && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete look</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete &ldquo;{confirmDelete?.name}&rdquo;? This cannot be undone.
            {confirmDelete != null && confirmDelete.layerCount > 0 && (
              <> Cues reference it, so you will be asked to confirm again.</>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={isDeleting}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                const target = confirmDelete
                setConfirmDelete(null)
                if (target) handleDelete(target.id, false)
              }}
            >
              {isDeleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The in-use guard. A Dialog rather than a Sheet, per this repo's convention: there is nothing
          to fill in — it is a confirmation with a list of consequences. */}
      <Dialog open={inUse != null} onOpenChange={(next) => !next && setInUse(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This look is still in use</DialogTitle>
          </DialogHeader>
          {inUse && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" />
              <AlertDescription className="space-y-2">
                <p>
                  {inUse.body.error} Deleting it anyway drops {inUse.body.layerCount} cue layer
                  {inUse.body.layerCount === 1 ? '' : 's'}. Those cues will fire without this
                  look&rsquo;s contribution.
                </p>
                {inUse.body.cueNames.length > 0 && (
                  <p className="text-xs">Affected cues: {inUse.body.cueNames.join(', ')}</p>
                )}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInUse(null)} disabled={isDeleting}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => inUse && handleDelete(inUse.lookId, true)}
            >
              {isDeleting && <Loader2 className="size-4 animate-spin" />}
              Delete anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LookDetailSheet
        open={detailLookId != null}
        onOpenChange={(next) => {
          if (!next) setDetailLookId(null)
        }}
        projectId={projectIdNum}
        look={detailLook}
        onDuplicate={(look) => {
          setDetailLookId(null)
          handleDuplicate(look)
        }}
      />

      {copyingLook && (
        <CopyLookDialog
          open
          setOpen={(open) => {
            if (!open) setCopyingLook(null)
          }}
          sourceProjectId={projectIdNum}
          lookId={copyingLook.id}
          lookName={copyingLook.name}
        />
      )}

      <RecordLookSheet open={recordOpen} onOpenChange={setRecordOpen} projectId={projectIdNum} />
    </div>
  )
}
