import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
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
import { Loader2, Palette, Plus, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import {
  useCreateTemplateMutation,
  useDeleteTemplateMutation,
  useSaveTemplateMutation,
  useTemplateListQuery,
} from '../store/templates'
import { TemplateEditor } from '../components/templates/TemplateEditor'
import { TemplateListRow } from '../components/templates/TemplateListRow'
import {
  LookFamilyFilterBar,
  getStoredLookFamily,
  setStoredLookFamily,
  type LookFamilyFilter,
} from '../components/ViewSwitcher'
import type { TemplateInUseError, TemplateInput, TemplateSummary } from '../api/templatesApi'
import { parseFamilySlug, familySlug } from '../lib/attributeFamily'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { formatError } from '../lib/formatError'
import { CurrentProjectRedirect } from '../components/CurrentProjectRedirect'

/** Redirect `/templates` → `/projects/:projectId/templates`. */
export function TemplatesRedirect() {
  return <CurrentProjectRedirect to="templates" />
}

/**
 * The template library — named values and effects you build looks and cues out of, one family each.
 *
 * The half of `/looks` that was never a Look. A template composes **one named thing** — a value, or
 * one effect — with no targets of its own and no order, applied to whatever you have selected.
 * `New template` lives here because a template is **authored** rather than captured, which is
 * exactly the line D9 draws — cues and Looks are recorded and so have no create button, while
 * templates, separators and stacks are not captured states and keep theirs. An effect template has a
 * second, captured way in besides (*Save as template…* on a running effect), which is how the
 * library fills up without anyone opening this sheet; it does not make the create button wrong.
 *
 * **One route with a sticky family filter**, and the reason is now the opposite of the one `/looks`
 * had: here a family is an exact partition (a template is in exactly one), so the filter is a view of
 * a small library rather than a division of it, and `?family=colour` deep-links from Cmd+K.
 */
export function ProjectTemplates() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  // Unfiltered: the filter runs in the browser so switching families is instant and "All" needs
  // them all anyway. The endpoint's `family` param exists for callers that want one bank.
  const { data: templates, isLoading: templatesLoading } = useTemplateListQuery({
    projectId: projectIdNum,
  })

  const [createTemplate, { isLoading: isCreating }] = useCreateTemplateMutation()
  const [saveTemplate, { isLoading: isSaving }] = useSaveTemplateMutation()
  const [deleteTemplate, { isLoading: isDeleting }] = useDeleteTemplateMutation()

  const [searchParams, setSearchParams] = useSearchParams()
  const [family, setFamily] = useState<LookFamilyFilter>(() => getStoredLookFamily())
  const [editorOpen, setEditorOpen] = useState(false)
  /**
   * The template being edited, held **by id** and re-read from the list.
   *
   * Holding the object would freeze it at the moment the row was clicked, so after a save the editor
   * would still measure `dirty` against the pre-save value — Save stuck enabled, Escape offering to
   * discard changes already written. Same reasoning as `LookDetailSheet` and `Looks.tsx`.
   */
  const [editingId, setEditingId] = useState<number | null>(null)
  /** A refused delete, held so the guard can name the cues and offer "delete anyway". */
  const [inUse, setInUse] = useState<{ templateId: number; body: TemplateInUseError } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TemplateSummary | null>(null)

  const isCurrentProject = currentProject?.id === projectIdNum

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

  // Deep links, from Cmd+K or a bookmark.
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
      setEditingId(null)
      setEditorOpen(true)
      const params = new URLSearchParams(searchParams)
      params.delete('action')
      setSearchParams(params, { replace: true })
    }
  }, [searchParams, isCurrentProject, setSearchParams])

  // Re-read rather than remembered — see `editingId`. Null once the template is gone, which is what
  // a delete from another client should do to an open editor.
  const editing = useMemo(
    () => (editingId == null ? null : (templates?.find((t) => t.id === editingId) ?? null)),
    [templates, editingId],
  )

  useEffect(() => {
    if (editingId != null && templates != null && editing == null) {
      setEditingId(null)
      setEditorOpen(false)
    }
  }, [editingId, templates, editing])

  const visible = useMemo(() => {
    const list = templates ?? []
    return family === 'ALL' ? list : list.filter((t) => t.family === family)
  }, [templates, family])

  const handleSave = async (input: TemplateInput) => {
    if (editingId != null) {
      await saveTemplate({ projectId: projectIdNum, templateId: editingId, ...input }).unwrap()
    } else {
      await createTemplate({ projectId: projectIdNum, ...input }).unwrap()
    }
  }

  /**
   * Delete, with the 409 as an ordinary step rather than a failure.
   *
   * `deleteTemplate` is in `SILENT_ENDPOINTS` precisely so a TEMPLATE_IN_USE lands here and opens the
   * guard, which names the cues that would lose a layer before offering to do it anyway.
   */
  const handleDelete = async (templateId: number, force: boolean) => {
    try {
      await deleteTemplate({ projectId: projectIdNum, templateId, force }).unwrap()
      setInUse(null)
      setEditorOpen(false)
      setEditingId(null)
    } catch (err) {
      const body = (err as { data?: TemplateInUseError })?.data
      if (body?.code === 'TEMPLATE_IN_USE') {
        setInUse({ templateId, body })
        return
      }
      toast.error(formatError(err))
    }
  }

  if (projectLoading || currentLoading || templatesLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!project) {
    return <Card className="m-4 p-4 text-center text-muted-foreground">Project not found</Card>
  }

  const totalAll = templates?.length ?? 0

  return (
    <div className="flex flex-col h-full">
      {/* `@container`: the family filter's labels are a container query, and a missing ancestor
          would drop them silently. See ViewSwitcher's LABEL_AT_* constants. */}
      <div className="@container p-4 space-y-4">
        <Breadcrumbs projectName={project.name} currentPage="Templates" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Templates</h1>
            <p className="text-sm text-muted-foreground">
              {isCurrentProject
                ? 'Named values and effects you build looks and cues out of. One attribute family each, applied to whatever you have selected.'
                : `Viewing templates for "${project.name}".`}
            </p>
          </div>
          {isCurrentProject && (
            <Button
              onClick={() => {
                setEditingId(null)
                setEditorOpen(true)
              }}
              size="sm"
              className="gap-1.5 shrink-0"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">New template</span>
            </Button>
          )}
        </div>

        <LookFamilyFilterBar current={family} onChange={changeFamily} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {totalAll === 0 ? (
          <Card className="p-8 text-center">
            <Palette className="size-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {isCurrentProject
                ? 'No templates yet. Create one here, or record what you have selected from the programmer’s template strip — or save a running effect as one.'
                : 'No templates in this project.'}
            </p>
          </Card>
        ) : visible.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No {family === 'ALL' ? '' : 'matching '}templates.
          </div>
        ) : (
          <div className="rounded-lg border divide-y">
            {visible.map((template) => (
              <TemplateListRow
                key={template.id}
                template={template}
                onClick={
                  isCurrentProject
                    ? () => {
                        setEditingId(template.id)
                        setEditorOpen(true)
                      }
                    : undefined
                }
                onDelete={isCurrentProject ? () => setConfirmDelete(template) : undefined}
              />
            ))}
          </div>
        )}

        {totalAll > 0 && family !== 'ALL' && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Showing {visible.length} of {totalAll} templates
          </p>
        )}
      </div>

      <TemplateEditor
        open={editorOpen}
        onOpenChange={(next) => {
          setEditorOpen(next)
          if (!next) setEditingId(null)
        }}
        projectId={projectIdNum}
        template={editingId == null ? null : editing}
        onSave={handleSave}
        isSaving={isCreating || isSaving}
        onDelete={editingId == null ? undefined : () => handleDelete(editingId, false)}
        isDeleting={isDeleting}
      />

      {/* The row menu's confirmation. Deleting a template a cue layers is not recoverable, and the
          row sits one stray click from opening the editor. */}
      <Dialog open={confirmDelete != null} onOpenChange={(next) => !next && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete &ldquo;{confirmDelete?.name}&rdquo;? This cannot be undone.
            {confirmDelete != null && confirmDelete.layerCount > 0 && (
              <> Layers apply it, so you will be asked to confirm again.</>
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

      {/* The in-use guard. A Dialog rather than a Sheet, per this repo's convention: there is
          nothing to fill in — it is a confirmation with a list of consequences. */}
      <Dialog open={inUse != null} onOpenChange={(next) => !next && setInUse(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This template is still applied</DialogTitle>
          </DialogHeader>
          {inUse && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" />
              <AlertDescription className="space-y-2">
                <p>{inUse.body.error}</p>
                {inUse.body.layerCount > 0 && (
                  <p>
                    Deleting it anyway drops {inUse.body.layerCount} layer
                    {inUse.body.layerCount === 1 ? '' : 's'}. Those cues will fire without this
                    template&rsquo;s contribution.
                  </p>
                )}
                {/* Stated separately because it fails differently: `force` removes the layers, but
                    nothing rewrites an effect parameter, so a reference left behind resolves to
                    nothing — and an unresolvable colour reads as white rather than as absent. */}
                {(inUse.body.fxReferenceCount ?? 0) > 0 && (
                  <p>
                    {inUse.body.fxReferenceCount} effect parameter
                    {inUse.body.fxReferenceCount === 1 ? '' : 's'} still name
                    {inUse.body.fxReferenceCount === 1 ? 's' : ''} it. Deleting it leaves
                    {inUse.body.fxReferenceCount === 1 ? ' that one' : ' those'} pointing at
                    nothing, and an unresolved colour runs as white — repoint
                    {inUse.body.fxReferenceCount === 1 ? ' it' : ' them'} first.
                  </p>
                )}
                {/* The third kind of usage, and the only one that is not stored: layers tracking
                    this template in the programmer *right now*. A forced delete stops them, which
                    is a consequence to state rather than a reference to repoint — and without it a
                    template used only live would open this guard with no consequence listed at
                    all. */}
                {(inUse.body.runningCount ?? 0) > 0 && (
                  <p>
                    {inUse.body.runningCount} programmer layer
                    {inUse.body.runningCount === 1 ? '' : 's'} appl
                    {inUse.body.runningCount === 1 ? 'ies' : 'y'} it right now. Deleting it stops
                    {inUse.body.runningCount === 1 ? ' that one' : ' those'} on the rig
                    immediately.
                  </p>
                )}
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
              onClick={() => inUse && handleDelete(inUse.templateId, true)}
            >
              {isDeleting && <Loader2 className="size-4 animate-spin" />}
              Delete anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
