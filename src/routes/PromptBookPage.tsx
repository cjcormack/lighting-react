import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, Trash2 } from 'lucide-react'
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
import { useProjectProgramStateQuery, useActivateProgramMutation, useDeactivateProgramMutation } from '../store/cueStacks'
import { useProjectCueStackListQuery } from '../store/cueStacks'
import type { CueStackCueEntry } from '../api/cueStacksApi'
import { useFxStateQuery, tapTempo } from '../store/fx'
import { useNarrowContainer } from '../hooks/useNarrowContainer'
import { useShowTransport } from '../hooks/useShowTransport'
import {
  useProjectPromptBookQuery,
  useSetPromptBookMutation,
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
import { flattenCueOrder, flattenShowRows } from '../lib/promptBook/geometry'
import { ScriptViewer, type ScriptViewerHandle } from '../components/promptbook/ScriptViewer'
import { CueAnchorPickerSheet } from '../components/promptbook/CueAnchorPickerSheet'
import { ShowHeader } from '../components/ShowHeader'
import { ShowBar } from '../components/ShowBar'
import { PromptBookToolbar } from '../components/promptbook/PromptBookToolbar'
import { ToolPalette, type PromptBookTool } from '../components/promptbook/ToolPalette'
import { CueStackPanel } from '../components/promptbook/CueStackPanel'
import type { ExpansionMode } from '../components/runner/run/CueCardBody'
import { ScriptUploadCard, type PickedScript } from '../components/promptbook/ScriptUploadCard'
import { useAutoRelock } from '../components/promptbook/hooks/useAutoRelock'
import type { CueRunStatus } from '../components/promptbook/AnchorOverlay'

export function PromptBookRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/prompt-book`, { replace: true })
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

// ─── Viewer ──────────────────────────────────────────────────────────────

type AnnotationDialogState =
  | { mode: 'create'; kind: AnnotationKind; region: Region }
  | { mode: 'edit'; annotation: AnnotationDto }

export function PromptBookViewerPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)

  const navigate = useNavigate()
  const { data: book, isLoading: bookLoading, error: bookError, refetch: refetchBook } = useProjectPromptBookQuery(projectIdNum)
  const { data: project } = useProjectQuery(projectIdNum)
  const { data: programState } = useProjectProgramStateQuery(projectIdNum)
  const { data: stacks } = useProjectCueStackListQuery(projectIdNum)
  const { data: fxState } = useFxStateQuery()

  const [activateShow] = useActivateProgramMutation()
  const [deactivateShow] = useDeactivateProgramMutation()

  const activeStackId = programState?.activeStackId ?? null

  const [upsertAnchor] = useUpsertAnchorMutation()
  const [deleteAnchor] = useDeleteAnchorMutation()
  const [createAnnotation] = useCreateAnnotationMutation()
  const [updateAnnotation] = useUpdateAnnotationMutation()
  const [deleteAnnotation] = useDeleteAnnotationMutation()
  const [uploadScriptDoc, { isLoading: reuploading }] = useUploadScriptDocMutation()
  const [setPromptBook, { isLoading: settingBook }] = useSetPromptBookMutation()

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

  // Which rail cards are expanded. Live + next expand by default and snap back to
  // that default whenever the live/next cue changes (see the effect below).
  const [expandedCues, setExpandedCues] = useState<Set<number>>(new Set())
  const toggleExpanded = useCallback((cueId: number) => {
    setExpandedCues((prev) => {
      const next = new Set(prev)
      if (next.has(cueId)) next.delete(cueId)
      else next.add(cueId)
      return next
    })
  }, [])

  // Stage/Details view persists across cue changes: `viewMode` is the live card's current
  // view (null = body collapsed) and is carried to the next live cue on GO. A non-live
  // cue the operator toggled remembers its own choice via `cueModeOverrides` until it
  // becomes live, when it rejoins viewMode. Overrides are transient (per session).
  const [viewMode, setViewMode] = useState<ExpansionMode | null>('stage')
  const [cueModeOverrides, setCueModeOverrides] = useState<Map<number, ExpansionMode | null>>(
    new Map(),
  )
  const handleCardModeChange = useCallback(
    (cueId: number, status: CueRunStatus, next: ExpansionMode | null) => {
      if (status === 'live') {
        // Toggling the live card updates the shared view (which the next GO carries).
        // Never write a per-cue override for the live cue, so it can't get pinned stale.
        setViewMode(next)
      } else {
        setCueModeOverrides((prev) => {
          const m = new Map(prev)
          m.set(cueId, next)
          return m
        })
      }
    },
    [],
  )

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
  const cueOrder: FlatCue[] = useMemo(() => flattenCueOrder(stacks), [stacks])
  // Rail rows include separators + per-stack headers (multi-stack only).
  const railRows = useMemo(() => flattenShowRows(stacks), [stacks])
  const cueOrderIndex = useMemo(() => new Map(cueOrder.map((c, i) => [c.cueId, i])), [cueOrder])
  // Live cue labels — the pill reads these so an edited cue number reflects at once
  // (the anchor's own cached label only refreshes when the anchor is re-saved).
  const cueLabelByCue = useMemo(() => new Map(cueOrder.map((c) => [c.cueId, c.label])), [cueOrder])

  const isShowActive = activeStackId != null

  // Row 3 (show bar) + rail transport — the follow-server runner shared with the Edit view.
  // `onBeforeGo: noteGo` preserves relock-on-GO; `canOperate: canEdit` gates GO exactly as the
  // old inline `goDisabled` did. Aliased to fireGo/fireBack so the rest of the page is unchanged.
  const transport = useShowTransport({
    projectId: projectIdNum,
    activeStackId,
    stacks,
    canOperate: canEdit,
    onBeforeGo: noteGo,
  })
  const {
    activeStack,
    activeCueId,
    standbyCueId,
    fadeProgress,
    fadeRemainMs,
    goDisabled,
    go: fireGo,
    back: fireBack,
  } = transport

  // The cue armed to fire on the next GO: an explicit standby, else the next cue
  // in reading order. Pre-show (nothing live) the first cue sits on deck.
  const nextCueId = useMemo(() => {
    // Stopped show: nothing is on deck. Without this, a null activeCueId would put
    // the first cue on deck (blue "NEXT"), making a stopped rail look pre-show/armed.
    if (!isShowActive) return null
    // An explicitly-armed standby is the next GO — but never treat the cue that's
    // already live as "next" (activating a standby leaves standbyCueId sitting on it).
    const sb = standbyCueId
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
  }, [isShowActive, standbyCueId, activeCueId, activeStackId, cueOrder, cueOrderIndex])

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

  // Effective Stage/Details mode for a cue: the live cue ALWAYS follows the persistent
  // viewMode (so GO carries the view forward and a cue never opens live with a stale
  // pinned mode); a non-live cue uses the operator's own choice if it has one, else opens
  // with neither selected.
  const modeOf = useCallback(
    (cueId: number, status: CueRunStatus): ExpansionMode | null => {
      if (status === 'live') return viewMode
      return cueModeOverrides.has(cueId) ? cueModeOverrides.get(cueId) ?? null : null
    },
    [cueModeOverrides, viewMode],
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

  // Full stack entries by cue id — each expanded rail card renders the shared Run
  // card, which needs the entry's cueNumber/notes/auto (FlatCue carries only a label).
  const cueEntryByCue = useMemo(() => {
    const m = new Map<number, CueStackCueEntry>()
    for (const s of stacks ?? []) for (const c of s.cues) m.set(c.id, c)
    return m
  }, [stacks])

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

  // Reset rail expansion to its default — live + next expanded, everything else
  // collapsed — whenever the live or next cue changes (GO, Back, or arming a new
  // standby). Manual chevron toggles persist between those transitions.
  useEffect(() => {
    setExpandedCues(new Set([activeCueId, nextCueId].filter((id): id is number => id != null)))
  }, [activeCueId, nextCueId])

  // Arm a cue as the next GO (mirrors the Run page's standby). Does NOT fire it. The
  // transport ignores the live cue; we just also close the narrow drawer here.
  const handleSetStandby = useCallback(
    (cueId: number) => {
      transport.setStandby(cueId)
      setDrawerOpen(false)
    },
    [transport],
  )

  // Jump to the cue's editor in Program, deep-linking to the exact cue (mirrors Run's
  // "Edit Cue"). Program's ?stack=&cue= handler requires the stack, so resolve it first.
  const handleEditCue = useCallback(
    (cueId: number) => {
      const flat = cueOrder[cueOrderIndex.get(cueId) ?? -1]
      if (flat?.stackId != null) {
        navigate(`/projects/${projectIdNum}/program/stacks/${flat.stackId}?cue=${cueId}`)
      } else {
        navigate(`/projects/${projectIdNum}/program`)
      }
    },
    [cueOrder, cueOrderIndex, navigate, projectIdNum],
  )

  // Start/Stop the show in place from the header (parity with Program/Run). State is
  // derived from the program playhead, so no local entry tracking is needed here.
  const runnableStackCount = stacks?.filter((s) => s.type === 'STACK').length ?? 0
  const canStart = !isShowActive && runnableStackCount > 0
  const handleStartShow = useCallback(() => {
    activateShow({ projectId: projectIdNum })
      .unwrap()
      .catch(() => {
        // Silently fail
      })
  }, [activateShow, projectIdNum])
  const handleStopShow = useCallback(async () => {
    await deactivateShow({ projectId: projectIdNum }).unwrap()
  }, [deactivateShow, projectIdNum])

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
        cueId,
        region,
        label: anchor?.label ?? undefined,
      })
      noteEdit()
    },
    [anchorByCue, upsertAnchor, projectIdNum, noteEdit],
  )

  const handleUndo = useCallback(() => {
    if (!undoSnapshot) return
    upsertAnchor({
      projectId: projectIdNum,
      cueId: undoSnapshot.cueId,
      region: undoSnapshot.region,
      label: undoSnapshot.label ?? undefined,
    })
    setUndoSnapshot(null)
    noteEdit()
  }, [undoSnapshot, upsertAnchor, projectIdNum, noteEdit])

  const handlePlaceAnchor = useCallback(
    (region: Region) => {
      if (placingCueId == null) return
      // Re-anchoring an existing cue → snapshot the old region so it can be undone.
      const existing = anchorByCue.get(placingCueId)
      if (existing) setUndoSnapshot({ cueId: placingCueId, region: existing.region, label: existing.label ?? null })
      upsertAnchor({
        projectId: projectIdNum,
        cueId: placingCueId,
        region,
        label: cueLabelByCue.get(placingCueId),
      })
      setPlacingCueId(null)
    },
    [placingCueId, cueLabelByCue, anchorByCue, upsertAnchor, projectIdNum],
  )

  // Anchor a chosen cue to a selected region (from the cue picker). Overwriting an
  // existing anchor re-anchors it; snapshot the old region so it can be undone.
  const handleAnchorCue = useCallback(
    (cueId: number, region: Region) => {
      const existing = anchorByCue.get(cueId)
      if (existing) setUndoSnapshot({ cueId, region: existing.region, label: existing.label ?? null })
      upsertAnchor({ projectId: projectIdNum, cueId, region, label: cueLabelByCue.get(cueId) })
      setAnchorPicker(null)
      setPlacingCueId(null)
      noteEdit()
    },
    [cueLabelByCue, anchorByCue, upsertAnchor, projectIdNum, noteEdit],
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
      deleteAnchor({ projectId: projectIdNum, cueId })
      noteEdit()
    },
    [deleteAnchor, projectIdNum, noteEdit],
  )

  // Stable identity so the memoized ScriptViewer isn't re-rendered every fade frame.
  const handleAnchorRequest = useCallback((region: Region) => setAnchorPicker({ region }), [])

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
        createAnnotation({ projectId: projectIdNum, kind, region })
        return
      }
      setAnnotationText('')
      setAnnotationTone('NOTE')
      setAnnotationDialog({ mode: 'create', kind, region })
    },
    [createAnnotation, projectIdNum],
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
        kind: annotationDialog.kind,
        region: annotationDialog.region,
        text: annotationText || undefined,
        tone: annotationDialog.kind === 'NOTE' ? annotationTone : undefined,
      })
    } else {
      const { annotation } = annotationDialog
      updateAnnotation({
        projectId: projectIdNum,
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
  }, [annotationDialog, annotationText, annotationTone, createAnnotation, updateAnnotation, projectIdNum, noteEdit])

  const handleDeleteAnnotation = useCallback(() => {
    if (annotationDialog?.mode !== 'edit') return
    deleteAnnotation({ projectId: projectIdNum, annotationId: annotationDialog.annotation.id })
    setAnnotationDialog(null)
    noteEdit()
  }, [annotationDialog, deleteAnnotation, projectIdNum, noteEdit])

  // Change the front-matter (cover/title) page count. Reuses the create-or-replace PUT
  // (which keeps anchors/annotations) to persist just this field; the optimistic patch in
  // the mutation makes the stepper snappy. Clamped so at least one numbered page remains.
  const handleCoverPagesChange = useCallback(
    (n: number) => {
      if (!book) return
      const next = Math.max(0, Math.min(n, book.pageCount - 1))
      if (next === book.coverPages) return
      setPromptBook({
        projectId: projectIdNum,
        scriptHash: book.scriptHash,
        pageCount: book.pageCount,
        scriptFileName: book.scriptFileName ?? undefined,
        coverPages: next,
      })
      noteEdit()
    },
    [book, setPromptBook, projectIdNum, noteEdit],
  )

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

  // Import the show's prompt book from a picked PDF (the empty-state flow). The same
  // route then shows the reader once the book exists — no navigation needed. The
  // server computes the content hash (the script's identity), so import works on
  // plain-HTTP LAN origins where crypto.subtle doesn't exist.
  const [importError, setImportError] = useState<string | null>(null)
  const handleImportBook = useCallback(
    async (script: PickedScript) => {
      setImportError(null)
      try {
        const upload = await uploadScriptDoc({ projectId: projectIdNum, bytes: script.bytes }).unwrap()
        await setPromptBook({
          projectId: projectIdNum,
          scriptHash: upload.scriptHash,
          pageCount: script.pageCount,
          scriptFileName: script.fileName,
        }).unwrap()
      } catch (err) {
        setImportError(`Import failed: ${formatError(err)}`)
      }
    },
    [uploadScriptDoc, setPromptBook, projectIdNum],
  )

  // ── Guards ──

  if (bookLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!book) {
    // Only a genuine 404 means "no book yet". Any other failure (backend restarting,
    // 500, network blip) must NOT show the import card — otherwise a transient blip
    // during a show tempts the operator into re-importing, and setPromptBook (PUT
    // upsert) would replace the real book. Show a retry instead.
    const noBook = bookError != null && 'status' in bookError && bookError.status === 404
    if (!noBook && bookError != null) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="font-medium">Couldn't load the prompt book</p>
          <p className="max-w-md text-sm text-muted-foreground">
            The backend may be restarting or the connection blipped. Your prompt book is untouched.
          </p>
          <Button variant="outline" onClick={() => refetchBook()}>
            Retry
          </Button>
        </div>
      )
    }
    // No book yet → offer the import. Importing sets the show's one book and this
    // same route re-renders as the reader.
    return (
      <div className="mx-auto mt-8 w-full max-w-md p-4">
        <ScriptUploadCard
          title="Import a script PDF"
          description="The PDF becomes the spatial backbone of the show's prompt book — cue anchors pin cues to it. Identity is the file's content, so re-importing the same PDF re-attaches cleanly."
          uploading={reuploading || settingBook}
          error={importError}
          onUpload={handleImportBook}
        />
      </div>
    )
  }

  // O(1) lookups via the existing cueOrderIndex map (this render path runs every fade frame).
  const liveCue = activeCueId != null ? (cueOrder[cueOrderIndex.get(activeCueId) ?? -1] ?? null) : null
  const activeCueLabel = liveCue?.label ?? null
  const nextCue = nextCueId != null ? (cueOrder[cueOrderIndex.get(nextCueId) ?? -1] ?? null) : null
  const railStackName = activeStack?.name ?? cueOrder[0]?.stackName ?? null
  // The show bar wants the Q-number and name as separate fields — FlatCue.label folds the
  // name in for numberless cues, so pull the real cueNumber from the stack entry instead.
  const liveEntry = liveCue ? cueEntryByCue.get(liveCue.cueId) : undefined
  const nextEntry = nextCue ? cueEntryByCue.get(nextCue.cueId) : undefined

  // Shared rail props — the same panel serves the desktop side rail and the drawer.
  const railProps = {
    rows: railRows,
    anchorByCue,
    cueEntryByCue,
    statusOf,
    warningsByCue,
    warnings,
    showWarnings,
    locked,
    placingCueId,
    expandedCues,
    onToggleExpanded: toggleExpanded,
    modeOf,
    onCueModeChange: handleCardModeChange,
    fadeProgress,
    fadeRemainMs,
    activeStackId,
    onCueClick: handleCueClick,
    onRemoveAnchor: handleRemoveAnchor,
    onWarningClick: handleWarningClick,
    onSetStandby: handleSetStandby,
    onEditCue: handleEditCue,
    goDisabled,
    showActive: isShowActive,
    stackName: railStackName,
    bpm: fxState?.bpm ?? null,
    onTap: tapTempo,
    dbo,
    onDbo: () => setDbo((d) => !d),
    projectId: projectIdNum,
    coverPages: book.coverPages,
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
      <ShowHeader
        view="prompt-book"
        projectId={projectIdNum}
        projectName={project?.name ?? ''}
        isShowActive={isShowActive}
        canStart={canStart}
        onStart={handleStartShow}
        onStop={handleStopShow}
      />
      {isShowActive && (
        <ShowBar
          stackName={railStackName}
          dbo={dbo}
          onDbo={() => setDbo((d) => !d)}
          bpm={fxState?.bpm ?? null}
          onTap={tapTempo}
          activeNumber={liveEntry?.cueNumber ? `Q${liveEntry.cueNumber}` : null}
          activeName={liveCue?.name ?? null}
          standbyNumber={nextEntry?.cueNumber ? `Q${nextEntry.cueNumber}` : null}
          standbyName={nextCue?.name ?? null}
          fadeRemainMs={fadeRemainMs}
          onGo={fireGo}
          onBack={fireBack}
          goDisabled={goDisabled}
        />
      )}
      <PromptBookToolbar
        scriptFileName={book.scriptFileName}
        locked={locked}
        canEdit={canEdit}
        onToggleLock={toggleLock}
        canUndo={undoSnapshot != null}
        onUndo={handleUndo}
        coverPages={book.coverPages}
        pageCount={book.pageCount}
        onCoverPagesChange={handleCoverPagesChange}
        activeLabel={activeCueLabel}
        onJumpToLive={jumpToLive}
        warningCount={warnings.length}
        onToggleWarnings={() => setShowWarnings((s) => !s)}
        relockCountdown={relock.countdownSecondsLeft}
        onStayUnlocked={relock.stayUnlocked}
        onOpenCues={isNarrow ? () => setDrawerOpen((o) => !o) : undefined}
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
              onAnchorRequest={handleAnchorRequest}
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
