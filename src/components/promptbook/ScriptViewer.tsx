import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import { Loader2 } from 'lucide-react'
import { clamp, cn } from '@/lib/utils'
import type { AnnotationDto, AnnotationKind, CueAnchorDto, Rect, Region } from '../../api/promptBooksApi'
import {
  clientPointToNormalized,
  cornersToRect,
  groupByPage,
  MARKER_LANE_X,
  moveRegionVertically,
  rangeToRegion,
  rectToStyle,
} from '../../lib/promptBook/geometry'
import { scriptPosition } from '../../lib/promptBook/desync'
import { CueWash, CueMarginMarker, type CueRunStatus } from './AnchorOverlay'
import { CutOverlay, CutMarginMarker, FreetextOverlay, NoteCallout, NoteInline } from './AnnotationOverlay'
import { FloatingSelectionToolbar } from './FloatingSelectionToolbar'
import type { PromptBookTool } from './ToolPalette'

// Vite worker wiring per react-pdf v10 docs — react-pdf pins the matching
// pdfjs-dist, so API and worker versions can't skew.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/** Default anchor band placed on a click: full text width, ~2.5% page height.
 *  Used only on the scanned-PDF fallback (a page with no selectable text). */
const PLACED_ANCHOR_RECT = { x: 0.04, w: 0.92, h: 0.025 }

/** Below this item count a page is treated as image-only (scanned) — some scans
 *  carry a few junk OCR items, so a bare `> 0` would misfire. */
const MIN_TEXT_ITEMS = 5

/** Normalized gap kept between the text's left edge and the marker rail. */
const TEXT_EDGE_GAP = 0.006
/** Cap on the marker lane's x — a centered/indented page must not push the rail
 *  into the middle of the text; it stays within the left margin. */
const MAX_MARKER_LANE_X = 0.15
/** Normalized gap between the text's right edge and the note tail (a touch wider). */
const NOTE_EDGE_GAP = 0.016
/** Px kept between a note's right edge and the sheet's right edge. */
const NOTE_RIGHT_MARGIN = 8

/**
 * Measure the normalized left/right edge of a rendered page's text block from its
 * text-layer spans. Returns null if the text layer isn't ready / has no text.
 */
function measureTextBounds(pageEl: HTMLElement): { left: number; right: number } | null {
  const box = pageEl.getBoundingClientRect()
  if (box.width === 0) return null
  let minL = 1
  let maxR = 0
  let found = false
  pageEl.querySelectorAll('.textLayer span').forEach((span) => {
    if (!span.textContent?.trim()) return
    const r = span.getBoundingClientRect()
    if (r.width < 1) return
    minL = Math.min(minL, (r.left - box.left) / box.width)
    maxR = Math.max(maxR, (r.right - box.left) / box.width)
    found = true
  })
  return found ? { left: minL, right: maxR } : null
}

/**
 * The PDF page canvas + text layer, memoized so overlay/marker/bounds state changes
 * in the parent don't re-render it — a text-layer re-render would re-fire
 * `onRenderTextLayerSuccess` and, via the bounds setState, loop endlessly. Props are
 * intentionally minimal and stable (callbacks are useCallback'd in the parent).
 */
const PdfPage = memo(function PdfPage({
  index,
  width,
  onHasText,
  onTextLayerRendered,
}: {
  index: number
  width: number
  onHasText: (index: number, hasText: boolean) => void
  onTextLayerRendered: (index: number) => void
}) {
  return (
    <Page
      pageIndex={index}
      width={width}
      renderTextLayer
      renderAnnotationLayer={false}
      onGetTextSuccess={(tc) => onHasText(index, (tc.items?.length ?? 0) >= MIN_TEXT_ITEMS)}
      onRenderTextLayerSuccess={() => onTextLayerRendered(index)}
    />
  )
})

export interface ScriptViewerHandle {
  /** Smooth-scroll so the region's reading position sits ~40% down the viewport. */
  scrollToRegion(region: Region): void
}

interface ScriptViewerProps {
  fileUrl: string
  anchors: CueAnchorDto[]
  annotations: AnnotationDto[]
  statusOf: (cueId: number) => CueRunStatus
  /** Live cue labels from the cue stack, keyed by cueId — the anchor's cached
   *  label can go stale when a cue number is edited, so this wins when present. */
  cueLabels: Map<number, string>
  warningCueIds: Set<number>
  locked: boolean
  tool: PromptBookTool
  /** Cue armed for click-to-place on a scanned page (no text layer to select). */
  placingCueId: number | null
  /**
   * Commit a completed anchor drag (nudge). `prevRegion` is the region before the
   * drag, for the caller's single-step undo snapshot.
   */
  onMoveAnchor: (cueId: number, region: Region, prevRegion: Region) => void
  /** Place the armed cue's anchor at a clicked point (scanned-page fallback). */
  onPlaceAnchor: (region: Region) => void
  /** Open the cue picker to anchor the given selection region to a chosen cue. */
  onAnchorRequest: (region: Region) => void
  /** Create a free annotation over a selected/drawn region. */
  onCreateAnnotation: (kind: AnnotationKind, region: Region) => void
  onAnnotationClick: (annotation: AnnotationDto) => void
  /** Any edit-surface interaction — feeds the auto-relock idle timer. */
  onEditInteraction: () => void
  onDocumentError: () => void
}

/**
 * The script pane: PDF pages rendered fit-width with a selectable text layer and
 * an absolutely-positioned overlay layer per page. All overlay geometry is
 * normalized [0..1] and rendered as CSS percentages, so zoom/resize is free; only
 * pointer/selection interactions convert through the page element's current box.
 *
 * Annotation creation is selection-driven on text pages (select script text → a
 * floating toolbar), falling back to drag-a-box / click-a-band on scanned pages
 * that have no text layer.
 */
// Memoized: the Prompt Book page re-renders on every fade-progress frame during a GO;
// with all props referentially stable through a fade, memo spares the whole PDF + overlay
// subtree from re-reconciling ~60×/s.
export const ScriptViewer = memo(forwardRef<ScriptViewerHandle, ScriptViewerProps>(function ScriptViewer(
  {
    fileUrl,
    anchors,
    annotations,
    statusOf,
    cueLabels,
    warningCueIds,
    locked,
    tool,
    placingCueId,
    onMoveAnchor,
    onPlaceAnchor,
    onAnchorRequest,
    onCreateAnnotation,
    onAnnotationClick,
    onEditInteraction,
    onDocumentError,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pageElsRef = useRef(new Map<number, HTMLDivElement>())
  const [numPages, setNumPages] = useState(0)
  const [containerWidth, setContainerWidth] = useState<number>(0)
  // Which pages have a usable text layer (vs scanned image). Drives the
  // selection-vs-box gesture and is reactive so the cursor updates on load.
  const [hasTextByPage, setHasTextByPage] = useState<Map<number, boolean>>(new Map())
  // Normalized left/right edge of each page's text block, measured from the text
  // layer once it renders. Anchors the margin rail tight to the text (not out in
  // the PDF's own margin) and the note tails tight to the text's right edge.
  const [textBoundsByPage, setTextBoundsByPage] = useState<Map<number, { left: number; right: number }>>(
    new Map(),
  )
  // Pages whose text bounds we've already captured — measured once (bounds are
  // normalized, so width-invariant), which also breaks any re-measure feedback.
  const measuredPagesRef = useRef(new Set<number>())

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Stable callbacks for the memoized PdfPage (identity must not change per render).
  const handleHasText = useCallback((index: number, hasText: boolean) => {
    setHasTextByPage((m) => (m.get(index) === hasText ? m : new Map(m).set(index, hasText)))
  }, [])
  const handleTextLayerRendered = useCallback((index: number) => {
    if (measuredPagesRef.current.has(index)) return
    const el = pageElsRef.current.get(index)
    const bounds = el && measureTextBounds(el)
    if (bounds) {
      measuredPagesRef.current.add(index)
      setTextBoundsByPage((m) => new Map(m).set(index, bounds))
    }
  }, [])

  // Cue/cut markers hug the left edge of the highlighted text and overflow into
  // the left paper gutter; notes get the right gutter. When the pane is narrow
  // both gutters collapse and notes fall inline under their line. The page fills
  // what's left, clamped so a huge monitor doesn't render a canvas wall.
  const narrow = containerWidth > 0 && containerWidth < 720
  const leftGutter = narrow ? 0 : 56
  const rightGutter = narrow ? 0 : 200
  const pageWidth = clamp(containerWidth - leftGutter - rightGutter - 48, 280, 1000)

  const scrollToRegion = useCallback((region: Region) => {
    const container = containerRef.current
    if (!container || region.length === 0) return
    const pos = scriptPosition(region)
    const pageEl = pageElsRef.current.get(pos.page)
    if (!pageEl) return
    const target = pageEl.offsetTop + pos.y * pageEl.clientHeight - container.clientHeight * 0.4
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [])

  useImperativeHandle(ref, () => ({ scrollToRegion }), [scrollToRegion])

  // ── Text-selection capture (edit mode, text pages) ──
  // The selection Region is captured into state on gesture end — eagerly, because
  // a book refetch (WS echo) can remount pages and drop the live DOM selection.
  const [selection, setSelection] = useState<{ region: Region; anchor: { x: number; y: number } } | null>(null)

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }, [])

  const captureSelection = useCallback(() => {
    if (locked) return
    const sel = window.getSelection()
    const container = containerRef.current
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) {
      setSelection(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }
    const region = rangeToRegion(range, pageElsRef.current)
    if (region.length === 0) {
      // No text under the selection (e.g. a scanned page) — nothing to anchor to.
      setSelection(null)
      return
    }
    const b = range.getBoundingClientRect()
    // Selecting text is the primary annotation gesture — feed the auto-relock idle
    // timer so the pane doesn't relock (and drop the selection) while deliberating.
    onEditInteraction()
    setSelection({ region, anchor: { x: b.left + b.width / 2, y: b.top } })
  }, [locked, onEditInteraction])

  // Hide the toolbar when the selection collapses (click elsewhere / post-commit).
  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection()
      if (!s || s.isCollapsed) setSelection(null)
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  // Locking drops any pending selection toolbar and clears the DOM selection so no
  // stray blue highlight lingers after an (auto-)relock.
  useEffect(() => {
    if (locked) {
      window.getSelection()?.removeAllRanges()
      setSelection(null)
    }
  }, [locked])

  // ── Anchor drag (move) ──
  // The ref carries the authoritative in-flight geometry (mutations commit from it
  // on pointer-up — never from inside a setState updater, which React may re-invoke);
  // the state mirror only drives rendering, coalesced to one update per frame.
  const dragRef = useRef<{
    cueId: number
    startY: number
    origRegion: Region
    lastRegion: Region
    pageEl: HTMLDivElement
    /** Set once the pointer moves past a threshold — a drag (nudge) vs a click (re-select). */
    moved: boolean
  } | null>(null)
  const [dragOverride, setDragOverride] = useState<{ cueId: number; region: Region } | null>(null)
  const rafRef = useRef<number | null>(null)

  const scheduleOverlayFrame = useCallback((apply: () => void) => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      apply()
    })
  }, [])

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
  }, [])

  const onAnchorPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, anchor: CueAnchorDto, page: number) => {
      if (locked || tool !== 'move') return
      const pageEl = pageElsRef.current.get(page)
      if (!pageEl) return
      e.stopPropagation()
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = {
        cueId: anchor.cueId,
        startY: e.clientY,
        origRegion: anchor.region,
        lastRegion: anchor.region,
        pageEl,
        moved: false,
      }
      setDragOverride({ cueId: anchor.cueId, region: anchor.region })
      onEditInteraction()
    },
    [locked, tool, onEditInteraction],
  )

  // ── Annotation draw (box) — scanned-page fallback + freetext ──
  const drawRef = useRef<{
    page: number
    start: { x: number; y: number }
    lastRect: Rect
    pageEl: HTMLDivElement
    /** Set once the pointer drags past a threshold — a real box vs a stray click. */
    moved: boolean
  } | null>(null)
  const [draftRect, setDraftRect] = useState<Rect | null>(null)

  const onPagePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, page: number) => {
      if (locked) return
      const pageEl = pageElsRef.current.get(page)
      if (!pageEl) return
      // Unknown (text layer not loaded yet) → assume text, let selection drive.
      const textPage = hasTextByPage.get(page) !== false

      if (placingCueId != null) {
        if (textPage) return // selecting the line will anchor the cue
        // Scanned fallback: click a point → full-width band.
        const point = clientPointToNormalized(e.clientX, e.clientY, pageEl)
        onPlaceAnchor([placedAnchorRect(page, point.y)])
        onEditInteraction()
        return
      }

      // Box-draw: freetext is always placed (works on any page); cut/note fall back
      // to a box only when the page has no selectable text.
      const boxDraw = tool === 'freetext' || (tool !== 'move' && !textPage)
      if (!boxDraw) return
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      const start = clientPointToNormalized(e.clientX, e.clientY, pageEl)
      const rect = cornersToRect(page, start, start)
      drawRef.current = { page, start, lastRect: rect, pageEl, moved: false }
      setDraftRect(rect)
      onEditInteraction()
    },
    [locked, tool, placingCueId, hasTextByPage, onPlaceAnchor, onEditInteraction],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag) {
      if (Math.abs(e.clientY - drag.startY) > 4) drag.moved = true
      const dy = (e.clientY - drag.startY) / drag.pageEl.clientHeight
      drag.lastRegion = moveRegionVertically(drag.origRegion, dy)
      // Coalesce to one render per frame — a raw 120Hz pointer stream would
      // otherwise reconcile every <Page> on every event.
      scheduleOverlayFrame(() => {
        const current = dragRef.current
        if (current) setDragOverride({ cueId: current.cueId, region: current.lastRegion })
      })
      return
    }
    const draw = drawRef.current
    if (draw) {
      const point = clientPointToNormalized(e.clientX, e.clientY, draw.pageEl)
      if (Math.abs(point.x - draw.start.x) > 0.008 || Math.abs(point.y - draw.start.y) > 0.008) {
        draw.moved = true
      }
      draw.lastRect = cornersToRect(draw.page, draw.start, point)
      scheduleOverlayFrame(() => {
        const current = drawRef.current
        if (current) setDraftRect(current.lastRect)
      })
    }
  }, [scheduleOverlayFrame])

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current
    if (drag) {
      dragRef.current = null
      setDragOverride(null)
      // Commit a nudge only if the pointer moved AND the region actually changed
      // (a stray click, or a drag returning to its origin, is ignored — re-anchoring
      // is done by selecting new text → "Anchor cue").
      const changed = drag.lastRegion.some((r, i) => r.y !== drag.origRegion[i]?.y)
      if (drag.moved && changed) onMoveAnchor(drag.cueId, drag.lastRegion, drag.origRegion)
      return
    }
    const draw = drawRef.current
    if (draw) {
      const { moved, lastRect } = draw
      drawRef.current = null
      setDraftRect(null)
      // A plain click (no drag) leaves a min-size rect — don't persist it.
      if (moved && tool !== 'move') {
        onCreateAnnotation(
          tool === 'note' ? 'NOTE' : tool === 'strikethrough' ? 'STRIKETHROUGH' : 'FREETEXT',
          [lastRect],
        )
      }
      return
    }
    // No drag/draw in progress → a text selection may have just ended.
    captureSelection()
  }, [tool, onMoveAnchor, onCreateAnnotation, captureSelection])

  // A cancelled pointer (touch interruption, OS gesture, lost capture) aborts the
  // in-flight gesture — it must NOT commit a nudge or annotation like pointer-up.
  const onPointerCancel = useCallback(() => {
    dragRef.current = null
    drawRef.current = null
    setDragOverride(null)
    setDraftRect(null)
  }, [])

  // Merge the in-flight drag geometry over the cache data. The WS-echo refetch
  // triggered by our own edits can never fight a live drag because the override
  // wins until pointer-up commits.
  const effectiveAnchors = useMemo(() => {
    if (!dragOverride) return anchors
    return anchors.map((a) => (a.cueId === dragOverride.cueId ? { ...a, region: dragOverride.region } : a))
  }, [anchors, dragOverride])

  const anchorsByPage = useMemo(() => groupByPage(effectiveAnchors, (a) => a.region), [effectiveAnchors])
  const annotationsByPage = useMemo(() => groupByPage(annotations, (n) => n.region), [annotations])
  // Cue run-status keyed by cueId. Memoized on `anchors` (not effectiveAnchors) so
  // the per-page render loop doesn't rebuild a status Map on every drag frame.
  const statusByCue = useMemo(
    () => new Map(anchors.map((a) => [a.cueId, statusOf(a.cueId)])),
    [anchors, statusOf],
  )

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={captureSelection}
      // Only drop the toolbar if the selection is actually gone — a programmatic
      // auto-scroll (live cue advancing) must not wipe a pending annotation.
      onScroll={() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) setSelection(null)
      }}
      className="relative flex-1 overflow-y-auto min-h-0 bg-muted/30"
    >
      <Document
        file={fileUrl}
        onLoadSuccess={(doc) => setNumPages(doc.numPages)}
        onLoadError={onDocumentError}
        loading={
          <div className="flex items-center justify-center p-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <div className="flex flex-col items-center gap-4 px-6 py-6">
          {containerWidth > 0 &&
            Array.from({ length: numPages }, (_, i) => {
              const cues = anchorsByPage.get(i) ?? []
              const anns = annotationsByPage.get(i) ?? []
              const cuts = anns.filter((a) => a.item.kind === 'STRIKETHROUGH')
              const notes = anns.filter((a) => a.item.kind === 'NOTE')
              const freetexts = anns.filter((a) => a.item.kind === 'FREETEXT')
              const annLocked = locked || tool !== 'move'
              const textPage = hasTextByPage.get(i) !== false
              // Crosshair only where a box-draw gesture is possible; text pages
              // keep the text layer's I-beam to invite selection.
              const boxCursor =
                !locked && (tool === 'freetext' || (!textPage && (placingCueId != null || tool !== 'move')))
              // Anchor the margin rail just left of the text block and the note
              // tails just right of it — measured from the text layer, falling back
              // to a fixed lane / the gutter edge on scanned pages. laneX is clamped
              // so a centered/indented page can't push the rail over the text.
              const bounds = textBoundsByPage.get(i)
              const laneX = bounds ? clamp(bounds.left - TEXT_EDGE_GAP, 0.006, MAX_MARKER_LANE_X) : MARKER_LANE_X
              const noteLeftNorm = bounds ? Math.min(bounds.right + NOTE_EDGE_GAP, 0.98) : 1
              // Hold desktop notes until the page is classified (bounds measured, or
              // known scanned) so they don't flash at the far-right edge then jump in.
              const notesReady = bounds != null || hasTextByPage.get(i) === false
              // Fill from the text's right edge to a small margin before the sheet edge.
              const noteWidthPx = clamp(
                (1 - noteLeftNorm) * pageWidth + rightGutter - NOTE_RIGHT_MARGIN,
                150,
                250,
              )
              return (
                <div
                  key={i}
                  className="flex items-stretch rounded-sm bg-white shadow-lg"
                  style={{ width: pageWidth + leftGutter + rightGutter }}
                >
                  {/* Left paper gutter — the cue chip / cut tag overflow into it. */}
                  {leftGutter > 0 && <div className="shrink-0" style={{ width: leftGutter }} />}

                  {/* Page + on-page overlays (washes, cuts, markers, notes-when-narrow). */}
                  <div
                    ref={(el) => {
                      if (el) pageElsRef.current.set(i, el)
                      else pageElsRef.current.delete(i)
                    }}
                    data-page-index={i}
                    onPointerDown={(e) => onPagePointerDown(e, i)}
                    className={cn('relative shrink-0', boxCursor && 'cursor-crosshair')}
                    style={{ width: pageWidth }}
                  >
                    <PdfPage
                      index={i}
                      width={pageWidth}
                      onHasText={handleHasText}
                      onTextLayerRendered={handleTextLayerRendered}
                    />
                    {/* Overlay sits ABOVE the text layer (z-index 2) but stays
                        click-through, so native text selection still reaches the
                        text layer; only the markers/bubbles capture pointers. */}
                    <div className="pointer-events-none absolute inset-0 z-[3]">
                      {cuts.map(({ item, rects }) => (
                        <CutOverlay
                          key={item.id}
                          rects={rects}
                          locked={annLocked}
                          onClick={() => onAnnotationClick(item)}
                        />
                      ))}
                      {freetexts.map(({ item, rects }) => (
                        <FreetextOverlay
                          key={item.id}
                          annotation={item}
                          rects={rects}
                          locked={annLocked}
                          onClick={() => onAnnotationClick(item)}
                        />
                      ))}
                      {cues.map(({ item: anchor, rects }) => {
                        const status = statusByCue.get(anchor.cueId)!
                        return (
                          <CueWash key={anchor.cueId} rects={rects} status={status} isLive={status === 'live'} />
                        )
                      })}
                      {/* Margin markers — cue/cut labels + accent bands, tight to the text. */}
                      {cuts.map(({ item, rects }) => (
                        <CutMarginMarker
                          key={item.id}
                          rects={rects}
                          locked={annLocked}
                          laneX={laneX}
                          onClick={() => onAnnotationClick(item)}
                        />
                      ))}
                      {cues.map(({ item: anchor, rects }) => (
                        <CueMarginMarker
                          key={anchor.cueId}
                          anchor={anchor}
                          label={cueLabels.get(anchor.cueId) ?? anchor.label}
                          rects={rects}
                          status={statusByCue.get(anchor.cueId)!}
                          hasWarning={warningCueIds.has(anchor.cueId)}
                          locked={locked || tool !== 'move' || placingCueId != null}
                          dragging={dragOverride?.cueId === anchor.cueId}
                          laneX={laneX}
                          onPointerDown={(e) => onAnchorPointerDown(e, anchor, i)}
                        />
                      ))}
                      {/* Notes — desktop: tail anchored to the text's right edge, bubble
                          extends into the paper gutter; narrow: inline under the line. */}
                      {!narrow &&
                        notesReady &&
                        notes.map(({ item, rects }) => (
                          <NoteCallout
                            key={item.id}
                            annotation={item}
                            rects={rects}
                            locked={annLocked}
                            leftPct={noteLeftNorm * 100}
                            widthPx={noteWidthPx}
                            onClick={() => onAnnotationClick(item)}
                          />
                        ))}
                      {narrow &&
                        notes.map(({ item, rects }) => (
                          <NoteInline
                            key={item.id}
                            annotation={item}
                            rects={rects}
                            locked={annLocked}
                            onClick={() => onAnnotationClick(item)}
                          />
                        ))}
                      {draftRect && draftRect.page === i && (
                        <div
                          style={rectToStyle(draftRect)}
                          className="rounded-sm border border-dashed border-amber-400 bg-amber-400/10"
                        />
                      )}
                    </div>
                  </div>

                  {/* Right paper gutter — the note bubbles overflow into it. */}
                  {rightGutter > 0 && <div className="shrink-0" style={{ width: rightGutter }} />}
                </div>
              )
            })}
        </div>
      </Document>

      {selection && !locked && (
        <FloatingSelectionToolbar
          anchor={selection.anchor}
          onAnchor={() => {
            onAnchorRequest(selection.region)
            onEditInteraction()
            clearSelection()
          }}
          onCut={() => {
            onCreateAnnotation('STRIKETHROUGH', selection.region)
            onEditInteraction()
            clearSelection()
          }}
          onNote={() => {
            onCreateAnnotation('NOTE', selection.region)
            onEditInteraction()
            clearSelection()
          }}
        />
      )}
    </div>
  )
}))

/** Compute the default band rect for a click-placed anchor (scanned fallback). */
function placedAnchorRect(page: number, y: number): Rect {
  const h = PLACED_ANCHOR_RECT.h
  return { page, x: PLACED_ANCHOR_RECT.x, y: clamp(y - h / 2, 0, 1 - h), w: PLACED_ANCHOR_RECT.w, h }
}
