import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, BookOpenText, ChevronLeft, ListChecks, Loader2, Play, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { useProjectShowQuery } from '../store/show'
import {
  useProjectCueStackListQuery,
  useAdvanceCueStackMutation,
  useActivateCueStackMutation,
  useGoToCueInStackMutation,
} from '../store/cueStacks'
import { go, back, selectStackRunner, setStandby, runnerSlice } from '../store/runnerSlice'
import { useAdvanceShowMutation } from '../store/show'
import { useFxStateQuery } from '../store/fx'
import { useNarrowContainer } from '../hooks/useNarrowContainer'
import {
  useProjectPromptBookListQuery,
  useProjectPromptBookQuery,
  useCreatePromptBookMutation,
  useDeletePromptBookMutation,
  useUploadScriptDocMutation,
  useUpsertAnchorMutation,
  useDeleteAnchorMutation,
  useCreateAnnotationMutation,
  useUpdateAnnotationMutation,
  useDeleteAnnotationMutation,
} from '../store/promptBooks'
import { scriptDocUrl, type AnnotationDto, type AnnotationKind, type NoteTone, type Region } from '../api/promptBooksApi'
import { cn } from '@/lib/utils'
import { formatError } from '../lib/formatError'
import { computeWarnings, type DesyncWarning, type FlatCue } from '../lib/promptBook/desync'
import { flattenCueOrder } from '../lib/promptBook/geometry'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { ScriptViewer, type ScriptViewerHandle } from '../components/promptbook/ScriptViewer'
import { CueAnchorPickerSheet } from '../components/promptbook/CueAnchorPickerSheet'
import { PromptBookToolbar } from '../components/promptbook/PromptBookToolbar'
import { ToolPalette, type PromptBookTool } from '../components/promptbook/ToolPalette'
import { CueStackPanel } from '../components/promptbook/CueStackPanel'
import { ScriptUploadCard, type PickedScript } from '../components/promptbook/ScriptUploadCard'
import { useAutoRelock } from '../components/promptbook/hooks/useAutoRelock'
import type { CueRunStatus } from '../components/promptbook/AnchorOverlay'

export function PromptBookRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/prompt-books`, { replace: true })
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

// ─── List / create ───────────────────────────────────────────────────────

export function PromptBooksPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const navigate = useNavigate()

  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: books, isLoading: booksLoading } = useProjectPromptBookListQuery(projectIdNum)

  const [uploadScriptDoc, { isLoading: uploading }] = useUploadScriptDocMutation()
  const [createPromptBook, { isLoading: creating }] = useCreatePromptBookMutation()
  const [deletePromptBook] = useDeletePromptBookMutation()
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const handleImport = useCallback(
    async (script: PickedScript) => {
      setImportError(null)
      try {
        // The server computes the content hash — the script's identity — so import
        // works on plain-HTTP LAN origins where crypto.subtle doesn't exist.
        const upload = await uploadScriptDoc({ projectId: projectIdNum, bytes: script.bytes }).unwrap()
        const baseName = script.fileName.replace(/\.pdf$/i, '') || 'Script'
        const taken = new Set(books?.map((b) => b.name) ?? [])
        let name = baseName
        for (let i = 2; taken.has(name); i++) name = `${baseName} (${i})`
        const created = await createPromptBook({
          projectId: projectIdNum,
          name,
          scriptHash: upload.scriptHash,
          pageCount: script.pageCount,
          scriptFileName: script.fileName,
        }).unwrap()
        navigate(`/projects/${projectIdNum}/prompt-books/${created.id}`)
      } catch (err) {
        setImportError(`Import failed: ${formatError(err)}`)
      }
    },
    [uploadScriptDoc, createPromptBook, books, projectIdNum, navigate],
  )

  if (projectLoading || booksLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Breadcrumbs projectName={project?.name ?? ''} currentPage="Prompt Books" />

      {books && books.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <Card key={book.id} className="group relative p-4 transition-colors hover:border-amber-500/50">
              <Link to={`/projects/${projectIdNum}/prompt-books/${book.id}`} className="block">
                <div className="flex items-start gap-3">
                  <BookOpenText className="mt-0.5 size-5 shrink-0 text-amber-500" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{book.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {book.pageCount} page{book.pageCount === 1 ? '' : 's'} · {book.anchorCount} anchor
                      {book.anchorCount === 1 ? '' : 's'} · {book.annotationCount} note
                      {book.annotationCount === 1 ? '' : 's'}
                    </p>
                    {book.scriptFileName && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground/60">{book.scriptFileName}</p>
                    )}
                  </div>
                </div>
              </Link>
              {book.canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${book.name}`}
                  className="absolute right-2 top-2 hidden size-7 text-muted-foreground hover:text-red-500 group-hover:flex"
                  onClick={() => setDeleteTarget({ id: book.id, name: book.name })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <ScriptUploadCard
        title={books && books.length > 0 ? 'Import another script' : 'Import a script PDF'}
        description="The PDF becomes the spatial backbone of a prompt-book — cue anchors pin cues to it. Identity is the file's content, so re-importing the same PDF re-attaches cleanly."
        uploading={uploading || creating}
        error={importError}
        onUpload={handleImport}
      />

      <Dialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.name}”?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            This removes the prompt-book's anchors and annotations. The cue stack itself is untouched —
            anchors are only bindings.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) deletePromptBook({ projectId: projectIdNum, bookId: deleteTarget.id })
                setDeleteTarget(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Viewer ──────────────────────────────────────────────────────────────

type AnnotationDialogState =
  | { mode: 'create'; kind: AnnotationKind; region: Region }
  | { mode: 'edit'; annotation: AnnotationDto }

export function PromptBookViewerPage() {
  const { projectId, bookId } = useParams()
  const projectIdNum = Number(projectId)
  const bookIdNum = Number(bookId)

  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { data: book, isLoading: bookLoading } = useProjectPromptBookQuery({
    projectId: projectIdNum,
    bookId: bookIdNum,
  })
  const { data: show } = useProjectShowQuery(projectIdNum)
  const { data: stacks } = useProjectCueStackListQuery(projectIdNum)
  const { data: fxState } = useFxStateQuery()

  const [advanceCueStack] = useAdvanceCueStackMutation()
  const [activateCueStack] = useActivateCueStackMutation()
  const [goToCueInStack] = useGoToCueInStackMutation()
  const [advanceShow] = useAdvanceShowMutation()

  const [upsertAnchor] = useUpsertAnchorMutation()
  const [deleteAnchor] = useDeleteAnchorMutation()
  const [createAnnotation] = useCreateAnnotationMutation()
  const [updateAnnotation] = useUpdateAnnotationMutation()
  const [deleteAnnotation] = useDeleteAnnotationMutation()
  const [uploadScriptDoc, { isLoading: reuploading }] = useUploadScriptDocMutation()

  // ── Runtime view state — NEVER persisted. Opens locked, always. ──
  const [locked, setLocked] = useState(true)
  const [tool, setTool] = useState<PromptBookTool>('move')
  const [placingCueId, setPlacingCueId] = useState<number | null>(null)
  // Region awaiting a cue choice — set when "Anchor cue" is clicked on a selection.
  const [anchorPicker, setAnchorPicker] = useState<{ region: Region } | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<{ cueId: number; region: Region; label: string | null } | null>(null)
  const [showWarnings, setShowWarnings] = useState(true)
  const [annotationDialog, setAnnotationDialog] = useState<AnnotationDialogState | null>(null)
  const [annotationText, setAnnotationText] = useState('')
  const [annotationTone, setAnnotationTone] = useState<NoteTone>('NOTE')
  const [pdfLoadState, setPdfLoadState] = useState<'ok' | 'missing' | 'error'>('ok')
  const [pdfRetryNonce, setPdfRetryNonce] = useState(0)
  const [hashMismatch, setHashMismatch] = useState<string | null>(null)

  // Local blackout toggle (parity with the Run view) + tablet/phone drawer.
  const [dbo, setDbo] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Below this container width the side rail becomes a drawer + bottom transport.
  const [bodyRef, isNarrow] = useNarrowContainer(1040)

  const viewerRef = useRef<ScriptViewerHandle>(null)

  const canEdit = book?.canEdit ?? false

  const lock = useCallback(() => {
    setLocked(true)
    setTool('move')
    setPlacingCueId(null)
  }, [])

  const relock = useAutoRelock({ locked, onRelock: lock })
  const { noteEdit, noteGo } = relock

  const toggleLock = useCallback(() => {
    if (!canEdit) return
    if (locked) setLocked(false)
    else lock()
  }, [canEdit, locked, lock])

  // ── Upstream running state — subscribed, never owned. ──
  const cueOrder: FlatCue[] = useMemo(() => flattenCueOrder(show, stacks), [show, stacks])
  const cueOrderIndex = useMemo(() => new Map(cueOrder.map((c, i) => [c.cueId, i])), [cueOrder])
  // Live cue labels — the pill reads these so an edited cue number reflects at once
  // (the anchor's own cached label only refreshes when the anchor is re-saved).
  const cueLabelByCue = useMemo(() => new Map(cueOrder.map((c) => [c.cueId, c.label])), [cueOrder])

  const activeEntry = useMemo(
    () => show?.entries.find((e) => e.id === show.activeEntryId),
    [show],
  )
  const activeStackId = activeEntry?.cueStackId ?? null
  const activeStack = useMemo(
    () => stacks?.find((s) => s.id === activeStackId),
    [stacks, activeStackId],
  )
  const activeCueId = activeStack?.activeCueId ?? null

  // Consult the shared runner slice so a standby cue armed here (or on the Run
  // page) is treated as the "next" cue — same source fireGo advances to.
  const runner = useSelector((state: { runner: ReturnType<typeof runnerSlice.getInitialState> }) =>
    selectStackRunner(state, activeStackId ?? 0),
  )

  // The cue armed to fire on the next GO: an explicit standby, else the next cue
  // in reading order. Pre-show (nothing live) the first cue sits on deck.
  const nextCueId = useMemo(() => {
    // An explicitly-armed standby is the next GO — but never treat the cue that's
    // already live as "next" (activating a standby leaves standbyCueId sitting on it).
    const sb = runner.standbyCueId
    if (sb != null && sb !== activeCueId) return sb
    // Nothing fired yet: the active stack's first cue is on deck; fall back to the
    // very first cue in the show only when no stack is active.
    if (activeCueId == null) {
      const firstOfActive =
        activeStackId != null ? cueOrder.find((c) => c.stackId === activeStackId) : undefined
      return (firstOfActive ?? cueOrder[0])?.cueId ?? null
    }
    const activeIdx = cueOrderIndex.get(activeCueId)
    if (activeIdx == null) return null
    return cueOrder[activeIdx + 1]?.cueId ?? null
  }, [runner.standbyCueId, activeCueId, activeStackId, cueOrder, cueOrderIndex])

  const statusOf = useCallback(
    (cueId: number): CueRunStatus => {
      if (cueId === activeCueId) return 'live'
      if (cueId === nextCueId) return 'next'
      if (activeCueId == null) return 'standby'
      const idx = cueOrderIndex.get(cueId)
      const activeIdx = cueOrderIndex.get(activeCueId)
      if (idx == null || activeIdx == null) return 'standby'
      return idx < activeIdx ? 'done' : 'standby'
    },
    [activeCueId, nextCueId, cueOrderIndex],
  )

  // ── Desync — advisory only; recomputed on every edit and on load. ──
  const warnings: DesyncWarning[] = useMemo(
    () => (book ? computeWarnings(book.anchors, book.annotations, cueOrder) : []),
    [book, cueOrder],
  )
  const warningsByCue = useMemo(() => {
    const map = new Map<number, DesyncWarning[]>()
    for (const w of warnings) map.set(w.cueId, [...(map.get(w.cueId) ?? []), w])
    return map
  }, [warnings])
  const warningCueIds = useMemo(() => new Set(warnings.map((w) => w.cueId)), [warnings])

  const anchorByCue = useMemo(
    () => new Map((book?.anchors ?? []).map((a) => [a.cueId, a])),
    [book],
  )

  // ── Runtime emphasis: scroll the live cue's anchor into view on advance. ──
  // The anchor map lives in a ref so an unrelated book refetch (edit, WS echo)
  // can't re-run the effect and yank the viewport while the operator reads ahead.
  const anchorByCueRef = useRef(anchorByCue)
  anchorByCueRef.current = anchorByCue
  useEffect(() => {
    if (activeCueId == null) return
    const anchor = anchorByCueRef.current.get(activeCueId)
    if (anchor) viewerRef.current?.scrollToRegion(anchor.region)
  }, [activeCueId])

  // ── GO surface — reuses the upstream mutations; also re-locks (fix-it edits end at GO). ──
  const isShowActive = show?.activeEntryId != null
  const goDisabled = !isShowActive || !canEdit

  const fireGo = useCallback(() => {
    noteGo()
    if (activeStackId == null || !activeStack) return
    if (activeStack.activeCueId == null) {
      activateCueStack({
        projectId: projectIdNum,
        stackId: activeStackId,
        cueId: runner.standbyCueId ?? undefined,
      })
      return
    }
    if (runner.standbyCueId != null) {
      // Mirror RunPage.handleGo: run the runner bookkeeping, then jump to standby.
      dispatch(go({ stackId: activeStackId, cues: activeStack.cues, loop: activeStack.loop }))
      goToCueInStack({ projectId: projectIdNum, stackId: activeStackId, cueId: runner.standbyCueId })
      return
    }
    // Boundary GO: at the stack's last standard cue, advance the show instead.
    const standardCues = activeStack.cues.filter((c) => c.cueType === 'STANDARD')
    const atLast = standardCues.length > 0 && activeStack.activeCueId === standardCues[standardCues.length - 1].id
    if (atLast && !activeStack.loop) {
      const entries = show?.entries ?? []
      const curIdx = entries.findIndex((e) => e.id === show?.activeEntryId)
      const nextStack = entries.slice(curIdx + 1).find((e) => e.entryType === 'STACK')
      if (nextStack) {
        advanceShow({ projectId: projectIdNum, direction: 'FORWARD' })
        return
      }
    }
    advanceCueStack({ projectId: projectIdNum, stackId: activeStackId, direction: 'FORWARD' })
  }, [noteGo, activeStackId, activeStack, activateCueStack, advanceCueStack, advanceShow, goToCueInStack, dispatch, projectIdNum, show, runner.standbyCueId])

  const fireBack = useCallback(() => {
    if (activeStackId == null || !activeStack) return
    // Step the runner's standby cursor back in lock-step with the server (parity
    // with RunPage.handleBack) so a Back after an armed-standby GO doesn't leave
    // standbyCueId stale and make the next GO / "next" highlight skip a cue.
    dispatch(back({ stackId: activeStackId, cues: activeStack.cues }))
    if (activeStack.activeCueId != null) {
      advanceCueStack({ projectId: projectIdNum, stackId: activeStackId, direction: 'BACKWARD' })
    }
  }, [activeStackId, activeStack, advanceCueStack, dispatch, projectIdNum])

  // Arm a cue as the next GO (mirrors the Run page's standby). Does NOT fire it.
  const handleSetStandby = useCallback(
    (cueId: number) => {
      if (activeStackId == null || cueId === activeCueId) return
      dispatch(setStandby({ stackId: activeStackId, cueId }))
      setDrawerOpen(false)
    },
    [activeStackId, activeCueId, dispatch],
  )

  // Jump to the cue's editor. No per-cue deep link exists yet, so open Program.
  const handleEditCue = useCallback(
    (_cueId: number) => navigate(`/projects/${projectIdNum}/program`),
    [navigate, projectIdNum],
  )

  const jumpToLive = useCallback(() => {
    if (activeCueId == null) return
    const anchor = anchorByCueRef.current.get(activeCueId)
    if (anchor) viewerRef.current?.scrollToRegion(anchor.region)
  }, [activeCueId])

  // Keyboard: Space=GO, Backspace=Back (parity with Run), L toggles lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Browser/system shortcuts (Cmd+L, Cmd+Backspace, …) are not ours.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      // A focused button owns Space/Enter activation (dialog buttons, lock
      // toggle, "stay unlocked") — stealing Space here would advance the show.
      if (tag === 'BUTTON') return
      if (e.code === 'Space' && !goDisabled) {
        e.preventDefault()
        fireGo()
      }
      if (e.code === 'Backspace' && !goDisabled) {
        e.preventDefault()
        fireBack()
      }
      if (e.code === 'KeyL') {
        e.preventDefault()
        toggleLock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fireGo, fireBack, toggleLock, goDisabled])

  // ── Edit operations ──

  const handleMoveAnchor = useCallback(
    (cueId: number, region: Region, prevRegion: Region) => {
      const anchor = anchorByCue.get(cueId)
      setUndoSnapshot({ cueId, region: prevRegion, label: anchor?.label ?? null })
      upsertAnchor({
        projectId: projectIdNum,
        bookId: bookIdNum,
        cueId,
        region,
        label: anchor?.label ?? undefined,
      })
      noteEdit()
    },
    [anchorByCue, upsertAnchor, projectIdNum, bookIdNum, noteEdit],
  )

  const handleUndo = useCallback(() => {
    if (!undoSnapshot) return
    upsertAnchor({
      projectId: projectIdNum,
      bookId: bookIdNum,
      cueId: undoSnapshot.cueId,
      region: undoSnapshot.region,
      label: undoSnapshot.label ?? undefined,
    })
    setUndoSnapshot(null)
    noteEdit()
  }, [undoSnapshot, upsertAnchor, projectIdNum, bookIdNum, noteEdit])

  const handlePlaceAnchor = useCallback(
    (region: Region) => {
      if (placingCueId == null) return
      // Re-anchoring an existing cue → snapshot the old region so it can be undone.
      const existing = anchorByCue.get(placingCueId)
      if (existing) setUndoSnapshot({ cueId: placingCueId, region: existing.region, label: existing.label ?? null })
      upsertAnchor({
        projectId: projectIdNum,
        bookId: bookIdNum,
        cueId: placingCueId,
        region,
        label: cueLabelByCue.get(placingCueId),
      })
      setPlacingCueId(null)
    },
    [placingCueId, cueLabelByCue, anchorByCue, upsertAnchor, projectIdNum, bookIdNum],
  )

  // Anchor a chosen cue to a selected region (from the cue picker). Overwriting an
  // existing anchor re-anchors it; snapshot the old region so it can be undone.
  const handleAnchorCue = useCallback(
    (cueId: number, region: Region) => {
      const existing = anchorByCue.get(cueId)
      if (existing) setUndoSnapshot({ cueId, region: existing.region, label: existing.label ?? null })
      upsertAnchor({ projectId: projectIdNum, bookId: bookIdNum, cueId, region, label: cueLabelByCue.get(cueId) })
      setAnchorPicker(null)
      setPlacingCueId(null)
      noteEdit()
    },
    [cueLabelByCue, anchorByCue, upsertAnchor, projectIdNum, bookIdNum, noteEdit],
  )

  const handleCueClick = useCallback(
    (cue: FlatCue) => {
      const anchor = anchorByCue.get(cue.cueId)
      if (anchor) {
        viewerRef.current?.scrollToRegion(anchor.region)
        return
      }
      if (!locked) {
        setPlacingCueId((prev) => (prev === cue.cueId ? null : cue.cueId))
        noteEdit()
      }
    },
    [anchorByCue, locked, noteEdit],
  )

  const handleRemoveAnchor = useCallback(
    (cueId: number) => {
      deleteAnchor({ projectId: projectIdNum, bookId: bookIdNum, cueId })
      noteEdit()
    },
    [deleteAnchor, projectIdNum, bookIdNum, noteEdit],
  )

  const handleWarningClick = useCallback(
    (warning: DesyncWarning) => {
      const anchor = anchorByCue.get(warning.cueId)
      if (anchor) viewerRef.current?.scrollToRegion(anchor.region)
    },
    [anchorByCue],
  )

  const handleCreateAnnotation = useCallback(
    (kind: AnnotationKind, region: Region) => {
      if (kind === 'STRIKETHROUGH') {
        createAnnotation({ projectId: projectIdNum, bookId: bookIdNum, kind, region })
        return
      }
      setAnnotationText('')
      setAnnotationTone('NOTE')
      setAnnotationDialog({ mode: 'create', kind, region })
    },
    [createAnnotation, projectIdNum, bookIdNum],
  )

  const handleAnnotationClick = useCallback((annotation: AnnotationDto) => {
    setAnnotationText(annotation.text ?? '')
    setAnnotationTone(annotation.tone ?? 'NOTE')
    setAnnotationDialog({ mode: 'edit', annotation })
  }, [])

  const commitAnnotationDialog = useCallback(() => {
    if (!annotationDialog) return
    if (annotationDialog.mode === 'create') {
      createAnnotation({
        projectId: projectIdNum,
        bookId: bookIdNum,
        kind: annotationDialog.kind,
        region: annotationDialog.region,
        text: annotationText || undefined,
        tone: annotationDialog.kind === 'NOTE' ? annotationTone : undefined,
      })
    } else {
      const { annotation } = annotationDialog
      updateAnnotation({
        projectId: projectIdNum,
        bookId: bookIdNum,
        annotationId: annotation.id,
        kind: annotation.kind,
        region: annotation.region,
        text: annotationText || undefined,
        color: annotation.color ?? undefined,
        tone: annotation.kind === 'NOTE' ? annotationTone : undefined,
      })
    }
    setAnnotationDialog(null)
    noteEdit()
  }, [annotationDialog, annotationText, annotationTone, createAnnotation, updateAnnotation, projectIdNum, bookIdNum, noteEdit])

  const handleDeleteAnnotation = useCallback(() => {
    if (annotationDialog?.mode !== 'edit') return
    deleteAnnotation({ projectId: projectIdNum, bookId: bookIdNum, annotationId: annotationDialog.annotation.id })
    setAnnotationDialog(null)
    noteEdit()
  }, [annotationDialog, deleteAnnotation, projectIdNum, bookIdNum, noteEdit])

  // ── Missing-PDF re-attach flow ──
  const [reuploadError, setReuploadError] = useState<string | null>(null)
  const handleReupload = useCallback(
    async (script: PickedScript) => {
      setReuploadError(null)
      try {
        const upload = await uploadScriptDoc({ projectId: projectIdNum, bytes: script.bytes }).unwrap()
        if (book && upload.scriptHash !== book.scriptHash) {
          setHashMismatch(upload.scriptHash)
          return
        }
        setHashMismatch(null)
        setPdfLoadState('ok')
        setPdfRetryNonce((n) => n + 1)
      } catch (err) {
        setReuploadError(`Upload failed: ${formatError(err)}`)
      }
    },
    [uploadScriptDoc, projectIdNum, book],
  )

  // A PDF load failure is only "missing" if the store actually 404s; anything
  // else (backend restart, network blip) gets a retry path, not the re-import card.
  const handleDocumentError = useCallback(() => {
    void fetch(scriptDocUrl(projectIdNum, book?.scriptHash ?? ''), { method: 'HEAD' })
      .then((resp) => setPdfLoadState(resp.status === 404 ? 'missing' : 'error'))
      .catch(() => setPdfLoadState('error'))
  }, [projectIdNum, book?.scriptHash])

  // ── Guards ──

  if (bookLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!book || Number.isNaN(bookIdNum)) {
    return (
      <Card className="m-4 p-4">
        <p className="text-muted-foreground">Prompt book not found.</p>
        <Button asChild variant="outline" className="mt-3 w-fit">
          <Link to={`/projects/${projectIdNum}/prompt-books`}>Back to prompt books</Link>
        </Button>
      </Card>
    )
  }

  const liveCue = activeCueId != null ? (cueOrder.find((c) => c.cueId === activeCueId) ?? null) : null
  const activeCueLabel = liveCue?.label ?? null
  const nextCue = nextCueId != null ? (cueOrder.find((c) => c.cueId === nextCueId) ?? null) : null
  const railStackName = activeStack?.name ?? cueOrder[0]?.stackName ?? null

  // Shared rail props — the same panel serves the desktop side rail and the drawer.
  const railProps = {
    cueOrder,
    anchorByCue,
    statusOf,
    warningsByCue,
    warnings,
    showWarnings,
    locked,
    placingCueId,
    onCueClick: handleCueClick,
    onRemoveAnchor: handleRemoveAnchor,
    onWarningClick: handleWarningClick,
    onSetStandby: handleSetStandby,
    onEditCue: handleEditCue,
    goDisabled,
    onGo: fireGo,
    onBack: fireBack,
    stackName: railStackName,
    bpm: fxState?.bpm ?? null,
    dbo,
    onDbo: () => setDbo((d) => !d),
  }

  const toneBtnActive: Record<NoteTone, string> = {
    NOTE: 'border-sky-600 bg-sky-500/15 text-sky-400',
    WARN: 'border-amber-600 bg-amber-500/15 text-amber-500',
    SAFETY: 'border-red-600 bg-red-500/15 text-red-400',
  }

  const annotationKind =
    annotationDialog == null
      ? null
      : annotationDialog.mode === 'create'
        ? annotationDialog.kind
        : annotationDialog.annotation.kind
  const annotationKindLabel = annotationKind === 'NOTE' ? 'note' : 'freetext'
  const cutConfirmOpen = annotationKind === 'STRIKETHROUGH'
  const annotationSheetOpen = annotationDialog != null && !cutConfirmOpen

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PromptBookToolbar
        bookName={book.name}
        scriptFileName={book.scriptFileName}
        projectId={projectIdNum}
        locked={locked}
        canEdit={canEdit}
        onToggleLock={toggleLock}
        canUndo={undoSnapshot != null}
        onUndo={handleUndo}
        activeLabel={activeCueLabel}
        onJumpToLive={jumpToLive}
        warningCount={warnings.length}
        onToggleWarnings={() => setShowWarnings((s) => !s)}
        relockCountdown={relock.countdownSecondsLeft}
        onStayUnlocked={relock.stayUnlocked}
      />

      {!locked && (
        <ToolPalette
          tool={tool}
          placingLabel={placingCueId != null ? (cueLabelByCue.get(placingCueId) ?? null) : null}
          onSelectTool={(t) => {
            setTool(t)
            setPlacingCueId(null)
            noteEdit()
          }}
        />
      )}

      {/* Compact NOW / NEXT strip — tablet & phone only */}
      {isNarrow && (
        <div className="flex items-center gap-2.5 border-b bg-background px-4 py-2">
          {liveCue ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="grid size-5 shrink-0 place-items-center rounded-full border border-emerald-800 bg-emerald-950 text-emerald-400">
                <Play className="size-2.5 fill-current" strokeWidth={0} />
              </span>
              <span className="font-mono text-sm font-bold text-emerald-400">{liveCue.label}</span>
              <span className="truncate text-[13px]">{liveCue.name}</span>
            </span>
          ) : (
            <span className="text-[13px] text-muted-foreground">No cue running</span>
          )}
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" />
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">Next</span>
            <span className="font-mono text-xs font-bold text-sky-400">{nextCue?.label ?? '—'}</span>
          </span>
          <span className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
            <ListChecks className="size-3.5" /> Cues
          </Button>
        </div>
      )}

      <div
        ref={bodyRef}
        className={cn(
          // The editing state must be visually unmistakable: the whole script
          // pane gets an inset amber ring while unlocked.
          'relative flex min-h-0 flex-1 overflow-hidden',
          !locked && 'shadow-[inset_0_0_0_2px_rgba(245,158,11,0.55)]',
        )}
      >
        <div className="relative flex min-w-0 flex-1 flex-col">
          {pdfLoadState === 'missing' ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-md">
                <ScriptUploadCard
                  title="Script PDF missing on this install"
                  description={`The prompt-book references ${book.scriptFileName ?? 'a PDF'} by content hash, but the file isn't in this backend's store. Re-import the same PDF to re-attach — anchors and annotations are untouched.`}
                  uploading={reuploading}
                  error={reuploadError}
                  onUpload={handleReupload}
                />
                {hashMismatch && (
                  <p className="mt-3 text-sm text-red-500">
                    That PDF's content doesn't match this prompt-book's script (different hash). If the
                    script was revised, open the book settings to swap it in and re-anchor.
                  </p>
                )}
              </div>
            </div>
          ) : pdfLoadState === 'error' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="font-medium">Couldn't load the script PDF</p>
              <p className="max-w-md text-sm text-muted-foreground">
                The backend may be restarting or the connection blipped. The script itself is untouched.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setPdfLoadState('ok')
                  setPdfRetryNonce((n) => n + 1)
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            <ScriptViewer
              // Remount on a script change (different book/PDF) as well as on retry,
              // so per-page text-bounds/scanned classification never carry over stale.
              key={`${book.scriptHash}:${pdfRetryNonce}`}
              ref={viewerRef}
              fileUrl={scriptDocUrl(projectIdNum, book.scriptHash)}
              anchors={book.anchors}
              annotations={book.annotations}
              statusOf={statusOf}
              cueLabels={cueLabelByCue}
              warningCueIds={warningCueIds}
              locked={locked}
              tool={tool}
              placingCueId={placingCueId}
              onMoveAnchor={handleMoveAnchor}
              onPlaceAnchor={handlePlaceAnchor}
              onAnchorRequest={(region) => setAnchorPicker({ region })}
              onCreateAnnotation={handleCreateAnnotation}
              onAnnotationClick={handleAnnotationClick}
              onEditInteraction={noteEdit}
              onDocumentError={handleDocumentError}
            />
          )}
        </div>

        {!isNarrow && <CueStackPanel {...railProps} />}

        {/* Tablet / phone: rail slides in from the right over a scrim. */}
        {isNarrow && (
          <>
            <div
              className={cn(
                'absolute inset-0 z-30 bg-black/50 transition-opacity',
                drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
              onClick={() => setDrawerOpen(false)}
            />
            <div
              className={cn(
                'absolute inset-y-0 right-0 z-40 flex w-[min(380px,88%)] flex-col border-l bg-background shadow-2xl transition-transform',
                drawerOpen ? 'translate-x-0' : 'translate-x-full',
              )}
            >
              <CueStackPanel {...railProps} inDrawer onClose={() => setDrawerOpen(false)} />
            </div>
          </>
        )}
      </div>

      {/* Bottom transport — tablet & phone (the desktop rail carries its own). */}
      {isNarrow && (
        <div
          className="flex gap-2 border-t bg-background p-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <Button variant="outline" onClick={fireBack} disabled={goDisabled} className="h-14 w-28">
            <ChevronLeft className="size-4" /> BACK
          </Button>
          <Button
            onClick={fireGo}
            disabled={goDisabled}
            className="h-14 flex-1 bg-amber-500 text-lg font-extrabold tracking-wide text-amber-950 hover:bg-amber-400"
          >
            <Play className="size-5" /> GO
          </Button>
        </div>
      )}

      {/* Note / freetext text entry — a form, so a Sheet per the app's Sheet-vs-Dialog rule.
          A clicked strikethrough has nothing to edit; it gets a delete confirmation Dialog. */}
      <Sheet
        open={annotationSheetOpen}
        onOpenChange={(open) => !open && setAnnotationDialog(null)}
      >
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {annotationDialog?.mode === 'create'
                ? `New ${annotationKindLabel}`
                : `Edit ${annotationKindLabel}`}
            </SheetTitle>
          </SheetHeader>
          <SheetBody>
            {annotationKind === 'NOTE' && (
              <div>
                <span className="mb-1.5 block text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
                  Tone
                </span>
                <div className="flex gap-2">
                  {(['NOTE', 'WARN', 'SAFETY'] as NoteTone[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAnnotationTone(t)}
                      className={cn(
                        'flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold capitalize',
                        annotationTone === t
                          ? toneBtnActive[t]
                          : 'text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      {t.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Textarea
              value={annotationText}
              onChange={(e) => setAnnotationText(e.target.value)}
              placeholder="e.g. slow build, 5s — watch conductor"
              autoFocus
            />
          </SheetBody>
          {annotationDialog?.mode === 'edit' ? (
            <SheetFooter className="flex-row justify-between">
              <Button variant="destructive" onClick={handleDeleteAnnotation}>
                <Trash2 className="size-3.5" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAnnotationDialog(null)}>
                  Cancel
                </Button>
                <Button onClick={commitAnnotationDialog}>Save</Button>
              </div>
            </SheetFooter>
          ) : (
            <SheetFooter className="flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => setAnnotationDialog(null)}>
                Cancel
              </Button>
              <Button onClick={commitAnnotationDialog}>Save</Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={cutConfirmOpen} onOpenChange={(open) => !open && setAnnotationDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this cut?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            The strikethrough will be removed from the script. Anchors and the cue stack are untouched.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnotationDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAnnotation}>
              <Trash2 className="size-3.5" />
              Remove cut
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CueAnchorPickerSheet
        open={anchorPicker != null}
        cueOrder={cueOrder}
        anchorByCue={anchorByCue}
        preselectCueId={placingCueId}
        onPick={(cueId) => {
          if (anchorPicker) handleAnchorCue(cueId, anchorPicker.region)
        }}
        onClose={() => setAnchorPicker(null)}
      />
    </div>
  )
}
