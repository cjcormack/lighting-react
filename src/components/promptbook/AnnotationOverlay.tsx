import { Scissors } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnnotationDto, NoteTone, Rect } from '../../api/promptBooksApi'
import { MARKER_LANE_X, marginRailStyle, rectToStyle, verticalBounds } from '../../lib/promptBook/geometry'

/** Above this normalized height a cut rect is a multi-line block/region (a drawn
 *  box or legacy band) rather than one text line, and gets the obvious crossed-out
 *  treatment instead of a single strikethrough rule. */
const BLOCK_CUT_MIN_H = 0.03

/** Note callout styling by tone — a dark sticky-note that reads over the page.
 *  `tailBd`/`tailBg` are concrete colours for the CSS speech-bubble tail. */
const toneStyles: Record<
  NoteTone,
  { box: string; tag: string; label: string; tailBd: string; tailBg: string }
> = {
  NOTE: {
    box: 'border-sky-700 bg-sky-950/95 text-sky-100',
    tag: 'border-sky-700 text-sky-300',
    label: 'Note',
    tailBd: '#0369a1',
    tailBg: '#082f49',
  },
  WARN: {
    box: 'border-amber-700 bg-amber-950/95 text-amber-100',
    tag: 'border-amber-700 text-amber-300',
    label: 'Warn',
    tailBd: '#b45309',
    tailBg: '#451a03',
  },
  SAFETY: {
    box: 'border-red-800 bg-red-950/95 text-red-100',
    tag: 'border-red-800 text-red-300',
    label: 'Safety',
    tailBd: '#991b1b',
    tailBg: '#450a0a',
  },
}

/**
 * On-page cut. Two treatments, chosen per rect by height:
 *  • Text-line rect (from a selection) → a real strikethrough: a thin rule at the
 *    rect's vertical midpoint, following the struck words exactly (the text-layer
 *    glyphs are transparent, so they can't be CSS `line-through`d directly).
 *  • Block / region rect (a drawn box or legacy band, taller than one line) → an
 *    obvious crossed-out treatment: a red wash, outline, and a diagonal X, since a
 *    single mid-rule across a tall block reads as far too subtle.
 * The margin marker (see {@link CutMarginMarker}) carries the "CUT" label.
 */
export function CutOverlay({
  rects,
  locked,
  onClick,
}: {
  rects: Rect[]
  locked: boolean
  onClick: () => void
}) {
  return (
    <>
      {rects.map((rect, i) =>
        rect.h > BLOCK_CUT_MIN_H ? (
          <div
            key={i}
            style={rectToStyle(rect)}
            onClick={locked ? undefined : onClick}
            className={cn(
              'rounded-sm bg-red-500/12 outline outline-1 outline-red-500/45',
              !locked && 'pointer-events-auto cursor-pointer hover:bg-red-500/20',
            )}
          >
            {/* Inset wrapper (a block box sizes to `inset`; a bare <svg> would keep
                its intrinsic height) so the cross ends inside the rounded corners. */}
            <div className="absolute inset-[4px]">
              <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line x1="0" y1="0" x2="100" y2="100" stroke="rgba(220,38,38,0.7)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(220,38,38,0.7)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          </div>
        ) : (
          <div
            key={i}
            style={rectToStyle(rect)}
            onClick={locked ? undefined : onClick}
            className={cn('flex items-center', !locked && 'pointer-events-auto cursor-pointer')}
          >
            <span className={cn('h-[2px] w-full rounded-full bg-red-600/85', !locked && 'hover:bg-red-500')} />
          </div>
        ),
      )}
    </>
  )
}

/** On-page freetext annotation — text rendered inside its region. */
export function FreetextOverlay({
  annotation,
  rects,
  locked,
  onClick,
}: {
  annotation: AnnotationDto
  rects: Rect[]
  locked: boolean
  onClick: () => void
}) {
  return (
    <>
      {rects.map((rect, i) => (
        <div
          key={i}
          style={rectToStyle(rect)}
          onClick={locked ? undefined : onClick}
          className={cn(
            'rounded-sm outline-1 outline-dashed outline-slate-400/40',
            !locked && 'pointer-events-auto cursor-pointer hover:outline-slate-300/70',
          )}
        >
          <span
            className="absolute inset-0 flex items-start overflow-hidden p-0.5 text-[11px] leading-tight font-medium"
            style={{ color: annotation.color ?? '#1d4ed8' }}
          >
            {annotation.text}
          </span>
        </div>
      ))}
    </>
  )
}

/**
 * Cut marker in the fixed left-margin rail: a dashed red band + a "CUT" pill,
 * anchored to {@link MARKER_LANE_X} so it lines up with the cue markers (overflowing
 * left into the paper gutter), independent of where the struck text starts.
 */
export function CutMarginMarker({
  rects,
  locked,
  laneX = MARKER_LANE_X,
  onClick,
}: {
  rects: Rect[]
  locked: boolean
  /** Normalized x of the shared margin rail (just left of the page's text block). */
  laneX?: number
  onClick: () => void
}) {
  return (
    <div
      style={marginRailStyle(rects, laneX)}
      onClick={locked ? undefined : onClick}
      className={cn(
        'flex items-start',
        locked ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer',
      )}
    >
      <span className="mr-1 inline-flex items-center gap-0.5 rounded border border-red-300 bg-red-50 px-1 font-mono text-[9px] font-bold tracking-wide text-red-600 uppercase">
        <Scissors className="size-2.5" />
        cut
      </span>
      <span className="h-full w-0 shrink-0 border-r-2 border-dashed border-red-500/70" />
    </div>
  )
}

/** Tone-coloured note callout. Used in the right gutter (desktop, with a tail) or inline (narrow). */
function NoteBubble({
  annotation,
  locked,
  onClick,
  withTail,
}: {
  annotation: AnnotationDto
  locked: boolean
  onClick: () => void
  withTail?: boolean
}) {
  const tone: NoteTone = annotation.tone ?? 'NOTE'
  const t = toneStyles[tone]
  return (
    <div
      onClick={locked ? undefined : onClick}
      className={cn(
        'relative rounded-md border p-2 shadow-lg',
        t.box,
        !locked && 'pointer-events-auto cursor-pointer hover:brightness-110',
      )}
    >
      {/* Left-pointing speech-bubble tail (two triangles: border then fill). */}
      {withTail && (
        <>
          <span
            className="absolute top-3 -left-[7px]"
            style={{
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderRight: `7px solid ${t.tailBd}`,
            }}
          />
          <span
            className="absolute top-3 -left-[6px] mt-px"
            style={{
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderRight: `6px solid ${t.tailBg}`,
            }}
          />
        </>
      )}
      <span
        className={cn(
          'mb-1 block w-fit rounded border px-1 font-mono text-[8.5px] leading-tight font-bold tracking-wide uppercase',
          t.tag,
        )}
      >
        {t.label}
      </span>
      <div className="text-[11.5px] leading-snug">{annotation.text}</div>
    </div>
  )
}

/**
 * Note callout, top-aligned to the annotated region, with its tail anchored just
 * right of the text block ({@link leftPct}) so it hugs the text's right edge and
 * extends into the paper gutter. Rendered in the page overlay, mirroring the cue
 * markers on the left.
 */
export function NoteCallout({
  annotation,
  rects,
  locked,
  leftPct,
  widthPx,
  onClick,
}: {
  annotation: AnnotationDto
  rects: Rect[]
  locked: boolean
  /** Normalized x (×100) of the note's tail — just right of the text block. */
  leftPct: number
  /** Bubble width in px — fills from the text's right edge across the paper gutter. */
  widthPx: number
  onClick: () => void
}) {
  const { top } = verticalBounds(rects)
  return (
    <div
      className="pointer-events-none absolute"
      style={{ top: `${top * 100}%`, left: `${leftPct}%`, width: widthPx }}
    >
      <NoteBubble annotation={annotation} locked={locked} onClick={onClick} withTail />
    </div>
  )
}

/** Narrow-layout note: rendered inline over the page, just below the region. */
export function NoteInline({
  annotation,
  rects,
  locked,
  onClick,
}: {
  annotation: AnnotationDto
  rects: Rect[]
  locked: boolean
  onClick: () => void
}) {
  const { top, height } = verticalBounds(rects)
  return (
    <div
      className="absolute right-2 left-2"
      style={{ top: `${(top + height) * 100}%`, marginTop: 4 }}
    >
      <div className="max-w-[min(320px,90%)]">
        <NoteBubble annotation={annotation} locked={locked} onClick={onClick} />
      </div>
    </div>
  )
}
