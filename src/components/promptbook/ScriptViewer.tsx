import {
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
import { Loader2 } from 'lucide-react'
import { clamp, cn } from '@/lib/utils'
import type { AnnotationDto, AnnotationKind, CueAnchorDto, Rect, Region } from '../../api/promptBooksApi'
import {
  clientPointToNormalized,
  cornersToRect,
  groupByPage,
  moveRegionVertically,
  rectToStyle,
} from '../../lib/promptBook/geometry'
import { scriptPosition } from '../../lib/promptBook/desync'
import { CueWash, CueMarginMarker, type CueRunStatus } from './AnchorOverlay'
import { CutOverlay, CutMarginMarker, FreetextOverlay, NoteCallout, NoteInline } from './AnnotationOverlay'
import type { PromptBookTool } from './ToolPalette'

// Vite worker wiring per react-pdf v10 docs — react-pdf pins the matching
// pdfjs-dist, so API and worker versions can't skew.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/** Default anchor band placed on a click: full text width, ~2.5% page height. */
const PLACED_ANCHOR_RECT = { x: 0.04, w: 0.92, h: 0.025 }

export interface ScriptViewerHandle {
  /** Smooth-scroll so the region's reading position sits ~40% down the viewport. */
  scrollToRegion(region: Region): void
}

interface ScriptViewerProps {
  fileUrl: string
  anchors: CueAnchorDto[]
  annotations: AnnotationDto[]
  statusOf: (cueId: number) => CueRunStatus
  warningCueIds: Set<number>
  locked: boolean
  tool: PromptBookTool
  /** Cue armed for click-to-place (unlocked); crosshair cursor while set. */
  placingCueId: number | null
  /**
   * Commit a completed anchor drag. `prevRegion` is the region before the drag,
   * for the caller's single-step undo snapshot.
   */
  onMoveAnchor: (cueId: number, region: Region, prevRegion: Region) => void
  onPlaceAnchor: (page: number, y: number) => void
  onDrawAnnotation: (kind: AnnotationKind, rect: Rect) => void
  onAnnotationClick: (annotation: AnnotationDto) => void
  /** Any edit-surface interaction — feeds the auto-relock idle timer. */
  onEditInteraction: () => void
  onDocumentError: () => void
}

/**
 * The script pane: PDF pages rendered fit-width with an absolutely-positioned
 * overlay layer per page. All overlay geometry is normalized [0..1] and rendered
 * as CSS percentages, so zoom/resize is free; only pointer interactions convert
 * through the page element's current box.
 */
export const ScriptViewer = forwardRef<ScriptViewerHandle, ScriptViewerProps>(function ScriptViewer(
  {
    fileUrl,
    anchors,
    annotations,
    statusOf,
    warningCueIds,
    locked,
    tool,
    placingCueId,
    onMoveAnchor,
    onPlaceAnchor,
    onDrawAnnotation,
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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Cue/cut markers sit in the page's own left margin (assumed present); notes
  // get a right gutter beside the page. When the pane is narrow the note gutter
  // collapses and notes fall inline under their line instead. The page fills
  // what's left, clamped so a huge monitor doesn't render a canvas wall.
  const narrow = containerWidth > 0 && containerWidth < 720
  const rightGutter = narrow ? 0 : 224
  const pageWidth = clamp(containerWidth - rightGutter - 48, 280, 1000)

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
      }
      setDragOverride({ cueId: anchor.cueId, region: anchor.region })
      onEditInteraction()
    },
    [locked, tool, onEditInteraction],
  )

  // ── Annotation draw (drag a rect with a non-move tool) ──
  const drawRef = useRef<{
    page: number
    start: { x: number; y: number }
    lastRect: Rect
    pageEl: HTMLDivElement
  } | null>(null)
  const [draftRect, setDraftRect] = useState<Rect | null>(null)

  const onPagePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, page: number) => {
      if (locked) return
      const pageEl = pageElsRef.current.get(page)
      if (!pageEl) return

      if (placingCueId != null) {
        const point = clientPointToNormalized(e.clientX, e.clientY, pageEl)
        onPlaceAnchor(page, point.y)
        onEditInteraction()
        return
      }

      if (tool === 'move') return
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      const start = clientPointToNormalized(e.clientX, e.clientY, pageEl)
      const rect = cornersToRect(page, start, start)
      drawRef.current = { page, start, lastRect: rect, pageEl }
      setDraftRect(rect)
      onEditInteraction()
    },
    [locked, tool, placingCueId, onPlaceAnchor, onEditInteraction],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag) {
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
      onMoveAnchor(drag.cueId, drag.lastRegion, drag.origRegion)
      return
    }
    const draw = drawRef.current
    if (draw) {
      drawRef.current = null
      setDraftRect(null)
      if (tool !== 'move') {
        onDrawAnnotation(
          tool === 'note' ? 'NOTE' : tool === 'strikethrough' ? 'STRIKETHROUGH' : 'FREETEXT',
          draw.lastRect,
        )
      }
    }
  }, [tool, onMoveAnchor, onDrawAnnotation])

  // Merge the in-flight drag geometry over the cache data. The WS-echo refetch
  // triggered by our own edits can never fight a live drag because the override
  // wins until pointer-up commits.
  const effectiveAnchors = useMemo(() => {
    if (!dragOverride) return anchors
    return anchors.map((a) => (a.cueId === dragOverride.cueId ? { ...a, region: dragOverride.region } : a))
  }, [anchors, dragOverride])

  const anchorsByPage = useMemo(() => groupByPage(effectiveAnchors, (a) => a.region), [effectiveAnchors])
  const annotationsByPage = useMemo(() => groupByPage(annotations, (n) => n.region), [annotations])

  const drawing = !locked && tool !== 'move'

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="flex-1 overflow-y-auto min-h-0 bg-muted/30"
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
              // One status lookup per cue, shared by its wash and margin marker.
              const cueStatus = new Map(cues.map((c) => [c.item.cueId, statusOf(c.item.cueId)]))
              return (
                <div key={i} className="flex items-stretch" style={{ width: pageWidth + rightGutter }}>
                  {/* Page + on-page overlays (markers in the left margin, washes, cuts, notes). */}
                  <div
                    ref={(el) => {
                      if (el) pageElsRef.current.set(i, el)
                      else pageElsRef.current.delete(i)
                    }}
                    data-page-index={i}
                    onPointerDown={(e) => onPagePointerDown(e, i)}
                    className={cn(
                      'relative shrink-0 shadow-lg',
                      (placingCueId != null || drawing) && 'cursor-crosshair',
                    )}
                    style={{ width: pageWidth }}
                  >
                    <Page
                      pageIndex={i}
                      width={pageWidth}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    <div className="pointer-events-none absolute inset-0">
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
                        const status = cueStatus.get(anchor.cueId)!
                        return (
                          <CueWash key={anchor.cueId} rects={rects} status={status} isLive={status === 'live'} />
                        )
                      })}
                      {/* Margin markers — cue/cut labels + bands in the page's left margin. */}
                      {cuts.map(({ item, rects }) => (
                        <CutMarginMarker
                          key={item.id}
                          rects={rects}
                          locked={annLocked}
                          onClick={() => onAnnotationClick(item)}
                        />
                      ))}
                      {cues.map(({ item: anchor, rects }) => (
                        <CueMarginMarker
                          key={anchor.cueId}
                          anchor={anchor}
                          rects={rects}
                          status={cueStatus.get(anchor.cueId)!}
                          hasWarning={warningCueIds.has(anchor.cueId)}
                          locked={locked || tool !== 'move' || placingCueId != null}
                          dragging={dragOverride?.cueId === anchor.cueId}
                          onPointerDown={(e) => onAnchorPointerDown(e, anchor, i)}
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

                  {/* Right gutter — note callouts (desktop). */}
                  {rightGutter > 0 && (
                    <div className="relative shrink-0" style={{ width: rightGutter }}>
                      {notes.map(({ item, rects }) => (
                        <NoteCallout
                          key={item.id}
                          annotation={item}
                          rects={rects}
                          locked={annLocked}
                          onClick={() => onAnnotationClick(item)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </Document>
    </div>
  )
})

/** Compute the default band rect for a click-placed anchor. */
export function placedAnchorRect(page: number, y: number): Rect {
  const h = PLACED_ANCHOR_RECT.h
  return { page, x: PLACED_ANCHOR_RECT.x, y: clamp(y - h / 2, 0, 1 - h), w: PLACED_ANCHOR_RECT.w, h }
}
