import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
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
import { Layers, Loader2, Plus, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import {
  useCopyLookMutation,
  useCreateLookMutation,
  useDeleteLookMutation,
  useLookListQuery,
  useLookQuery,
  useSaveLookMutation,
} from '../store/looks'
import { useFixtureListQuery } from '../store/fixtures'
import { LookListRow } from '../components/looks/LookListRow'
import { LookEditor } from '../components/looks/LookEditor'
import { LookDetailSheet } from '../components/looks/LookDetailSheet'
import { CopyLookDialog } from '../components/looks/CopyLookDialog'
import {
  LookFamilyFilterBar,
  getStoredLookFamily,
  setStoredLookFamily,
  type LookFamilyFilter,
} from '../components/ViewSwitcher'
import { buildFixtureTypeHierarchy, resolveFixtureTypeLabel } from '../api/fixtureTypeHierarchy'
import type { FixtureTypeHierarchy } from '../api/fixtureTypeHierarchy'
import type { LookInUseError, LookInput, LookSummary } from '../api/looksApi'
import { parseFamilySlug, familySlug } from '../lib/attributeFamily'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { formatError } from '../lib/formatError'

/** Redirect `/looks` → `/projects/:projectId/looks`. */
export function LooksRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/looks`, { replace: true })
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

/**
 * The Look library.
 *
 * **One route with a family filter**, not four sibling routes as the palette banks were, and the
 * reason is that a Look's families are *derived*: one covering colour and position belongs to two
 * banks at once, which a URL-per-bank cannot express. The unfiltered list is therefore a real
 * default rather than a fallback, and the filter is sticky so the sidebar's single row lands where
 * you left it. `?family=colour` deep-links from Cmd+K.
 *
 * Two sections inside, split on `hasDeferredRows`, because the two halves open **different
 * editors** and the operator should be able to see which before clicking. A recorded Look names its
 * own fixtures and is edited on stage; a template takes its fixtures from the layer applying it and
 * is edited in a form against a synthetic fixture. That is the same split §4.2 of the plan argues
 * for, surfaced.
 */
export function ProjectLooks() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  // Unfiltered: the family filter runs in the browser because a Look can be in several families
  // and "All" needs them all anyway. The endpoint's `family` param exists for callers that want a
  // single bank.
  const { data: looks, isLoading: looksLoading } = useLookListQuery({ projectId: projectIdNum })
  const { data: fixtureList } = useFixtureListQuery()

  const [createLook, { isLoading: isCreating }] = useCreateLookMutation()
  const [saveLook, { isLoading: isSaving }] = useSaveLookMutation()
  const [copyLook] = useCopyLookMutation()
  const [deleteLook, { isLoading: isDeleting }] = useDeleteLookMutation()

  const [searchParams, setSearchParams] = useSearchParams()
  const [family, setFamily] = useState<LookFamilyFilter>(() => getStoredLookFamily())
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingLookId, setEditingLookId] = useState<number | null>(null)
  const [detailLook, setDetailLook] = useState<LookSummary | null>(null)
  const [copyingLook, setCopyingLook] = useState<LookSummary | null>(null)
  /** A refused delete, held so the guard can name the cues and offer "delete anyway". */
  const [inUse, setInUse] = useState<{ lookId: number; body: LookInUseError } | null>(null)
  /**
   * A row-menu delete waiting to be confirmed.
   *
   * The menu item cannot delete straight away: it sits one stray click away from Edit and Duplicate
   * in the same dropdown, and a Look a cue layers is not recoverable. The editor's own Delete has a
   * confirm step for the same reason, so this is the row menu's.
   */
  const [confirmDelete, setConfirmDelete] = useState<LookSummary | null>(null)

  const isCurrentProject = currentProject?.id === projectIdNum

  // The editor takes full details (rows, effects, colour list), which the list does not carry.
  const { data: editingLook } = useLookQuery(
    { projectId: projectIdNum, lookId: editingLookId ?? 0 },
    { skip: editingLookId == null },
  )

  const changeFamily = useCallback(
    (next: LookFamilyFilter) => {
      setFamily(next)
      setStoredLookFamily(next)
      // Keep the URL honest so a reload or a shared link lands in the same bank.
      const params = new URLSearchParams(searchParams)
      if (next === 'ALL') params.delete('family')
      else params.set('family', familySlug(next))
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  // Deep links, from Cmd+K or a bookmark. Reads once per param change and re-stores, so arriving by
  // link sticks the same way clicking the filter does.
  useEffect(() => {
    const slug = searchParams.get('family')
    if (slug == null) return
    const parsed = slug.toLowerCase() === 'all' ? 'ALL' : parseFamilySlug(slug.toLowerCase())
    if (parsed == null) return
    setFamily(parsed)
    setStoredLookFamily(parsed)
  }, [searchParams])

  // `?action=new` opens the create editor and strips the param — the command-palette entry point.
  useEffect(() => {
    if (searchParams.get('action') === 'new' && isCurrentProject) {
      setEditingLookId(null)
      setEditorOpen(true)
      const params = new URLSearchParams(searchParams)
      params.delete('action')
      setSearchParams(params, { replace: true })
    }
  }, [searchParams, isCurrentProject, setSearchParams])

  const hierarchy = useMemo<FixtureTypeHierarchy | null>(
    () => (fixtureList ? buildFixtureTypeHierarchy(fixtureList) : null),
    [fixtureList],
  )

  const visible = useMemo(() => {
    let list = looks ?? []
    if (family !== 'ALL') list = list.filter((look) => look.families.includes(family))
    return list
  }, [looks, family])

  // No capability chips, unlike the preset route this replaces. They filtered on Dimmer / Colour /
  // Position, which is the family filter above under three other names — and the family version is
  // the more accurate of the two, because it is derived from a Look's rows as well as its effects.
  const { recorded, templates } = useMemo(
    () => ({
      recorded: visible.filter((look) => !look.hasDeferredRows),
      templates: visible.filter((look) => look.hasDeferredRows),
    }),
    [visible],
  )

  const handleCreate = () => {
    setEditingLookId(null)
    setEditorOpen(true)
  }

  const handleRowClick = (look: LookSummary) => {
    if (!isCurrentProject) {
      setCopyingLook(look)
      return
    }
    // The targeting mode picks the editor: a template gets the value grid, a recorded Look gets the
    // read-and-metadata sheet that points at the record loop.
    if (look.hasDeferredRows) {
      setEditingLookId(look.id)
      setEditorOpen(true)
    } else {
      setDetailLook(look)
    }
  }

  const handleDuplicate = async (look: LookSummary) => {
    const existingNames = new Set(looks?.map((l) => l.name) ?? [])
    let newName = `${look.name} (Copy)`
    if (existingNames.has(newName)) {
      let n = 2
      while (existingNames.has(`${look.name} (Copy ${n})`)) n++
      newName = `${look.name} (Copy ${n})`
    }
    // The **copy route**, with this project as the target, rather than a client-side rebuild from
    // a create call. Two reasons: the rows and effects come across without this client fetching
    // them, and every child gets a fresh uuid server-side — reusing the source's would make sync
    // treat the copy and the original as one record.
    //
    // `copyLook` is in `SILENT_ENDPOINTS` (CopyLookDialog renders its own alert), so a failure here
    // has nothing reporting it — hence the explicit toast rather than `ignoreReportedError`.
    await copyLook({ projectId: projectIdNum, lookId: look.id, targetProjectId: projectIdNum, newName })
      .unwrap()
      .catch((err) => toast.error(formatError(err)))
  }

  /**
   * Delete a Look from the editor's confirm view.
   *
   * The 409 is an ordinary step rather than a failure — `deleteLook` is in `SILENT_ENDPOINTS`
   * precisely so this renders it inline instead of toasting it — so a refused delete opens the
   * guard, which names the cues that would lose a layer before offering to do it anyway.
   */
  const handleDelete = async (lookId: number, force: boolean) => {
    try {
      await deleteLook({ projectId: projectIdNum, lookId, force }).unwrap()
      setInUse(null)
      setEditorOpen(false)
      setEditingLookId(null)
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

  const handleSave = async (input: LookInput) => {
    if (editingLookId != null) {
      await saveLook({ projectId: projectIdNum, lookId: editingLookId, ...input }).unwrap()
    } else {
      await createLook({ projectId: projectIdNum, ...input }).unwrap()
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

  const totalAll = looks?.length ?? 0
  const totalVisible = recorded.length + templates.length

  const rowFor = (look: LookSummary) => (
    <LookListRow
      key={look.id}
      look={look}
      fixtureTypeLabel={
        look.editorFixtureType && hierarchy
          ? resolveFixtureTypeLabel(look.editorFixtureType, hierarchy)
          : null
      }
      onClick={() => handleRowClick(look)}
      onEdit={isCurrentProject ? () => handleRowClick(look) : undefined}
      onDuplicate={isCurrentProject ? () => handleDuplicate(look) : undefined}
      onCopy={() => setCopyingLook(look)}
      onDelete={isCurrentProject ? () => setConfirmDelete(look) : undefined}
    />
  )

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-4">
        <Breadcrumbs projectName={project.name} currentPage="Looks" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Looks</h1>
            <p className="text-sm text-muted-foreground">
              {isCurrentProject
                ? 'Reusable bundles of values and effects. Edit one and every cue layering it moves.'
                : `Viewing looks for "${project.name}". Copy them to your active project to use them.`}
            </p>
          </div>
          {isCurrentProject && (
            <Button onClick={handleCreate} size="sm" className="gap-1.5">
              <Plus className="size-4" />
              <span className="hidden sm:inline">New Look</span>
            </Button>
          )}
        </div>

        <LookFamilyFilterBar current={family} onChange={changeFamily} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {totalAll === 0 ? (
          <Card className="p-8 text-center">
            <Layers className="size-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {isCurrentProject
                ? 'No looks yet. Create a template to bundle values and effects you can point at anything.'
                : 'No looks in this project.'}
            </p>
            {isCurrentProject && (
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={handleCreate}>
                <Plus className="size-4" />
                New Look
              </Button>
            )}
          </Card>
        ) : totalVisible === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No looks match the current filters.
          </div>
        ) : (
          <div className="space-y-4">
            <LookSection
              title="Recorded looks"
              hint="These name their own fixtures. Include one to stage its values and busk from them — writing edits back arrives with the record rewrite."
              looks={recorded}
              render={rowFor}
              emptyHint={
                isCurrentProject
                  ? 'Recording a look from the programmer arrives with the programmer rewrite.'
                  : undefined
              }
            />
            <LookSection
              title="Templates"
              hint="These take their fixtures from the layer applying them, so they can be pointed at anything."
              looks={templates}
              render={rowFor}
            />
          </div>
        )}

        {totalAll > 0 && family !== 'ALL' && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Showing {totalVisible} of {totalAll} looks
          </p>
        )}
      </div>

      <LookEditor
        open={editorOpen}
        onOpenChange={(next) => {
          setEditorOpen(next)
          if (!next) setEditingLookId(null)
        }}
        look={editingLookId == null ? null : (editingLook ?? null)}
        onSave={handleSave}
        isSaving={isCreating || isSaving}
        onDelete={
          editingLookId == null ? undefined : () => handleDelete(editingLookId, false)
        }
        isDeleting={isDeleting}
      />

      {/* The row menu's confirmation. The editor reaches its own delete through a confirm view, so
          this is the only entry point that would otherwise destroy a Look on a single click. */}
      <Dialog open={confirmDelete != null} onOpenChange={(next) => !next && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete look</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete &ldquo;{confirmDelete?.name}&rdquo;? This cannot be undone.
            {confirmDelete != null && confirmDelete.layerCount + confirmDelete.refRowCount > 0 && (
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

      {/* The in-use guard, shared by the editor's Delete and the row menu's. A Dialog rather than a
          Sheet, per this repo's convention: there is nothing to fill in — it is a confirmation with
          a list of consequences. */}
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
                  {inUse.body.layerCount === 1 ? '' : 's'}
                  {inUse.body.refRowCount > 0 &&
                    ` and leaves ${inUse.body.refRowCount} row${
                      inUse.body.refRowCount === 1 ? '' : 's'
                    } referencing a look that no longer exists`}
                  . Those cues will fire without this look&rsquo;s contribution.
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
        open={detailLook != null}
        onOpenChange={(next) => {
          if (!next) setDetailLook(null)
        }}
        projectId={projectIdNum}
        look={detailLook}
        onDuplicate={(look) => {
          setDetailLook(null)
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
    </div>
  )
}

function LookSection({
  title,
  hint,
  looks,
  render,
  emptyHint,
}: {
  title: string
  hint: string
  looks: LookSummary[]
  render: (look: LookSummary) => React.ReactNode
  emptyHint?: string
}) {
  if (looks.length === 0 && emptyHint == null) return null
  return (
    <div className="space-y-1">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
          {looks.length > 0 && <span className="ml-1 font-normal">({looks.length})</span>}
        </p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      {looks.length === 0 ? (
        <p className="py-2 text-[11px] text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="rounded-lg border divide-y">{looks.map(render)}</div>
      )}
    </div>
  )
}
