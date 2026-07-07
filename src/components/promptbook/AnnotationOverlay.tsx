import { cn } from '@/lib/utils'
import type { AnnotationDto, NoteTone, Rect } from '../../api/promptBooksApi'
import { MARKER_MARGIN_X, rectToStyle, verticalBounds } from '../../lib/promptBook/geometry'

/** Note callout styling by tone — a dark sticky-note that reads over the page. */
const toneStyles: Record<NoteTone, { box: string; tag: string; label: string }> = {
  NOTE: { box: 'border-sky-700 bg-sky-950/95 text-sky-100', tag: 'border-sky-700 text-sky-300', label: 'Note' },
  WARN: { box: 'border-amber-700 bg-amber-950/95 text-amber-100', tag: 'border-amber-700 text-amber-300', label: 'Warn' },
  SAFETY: { box: 'border-red-800 bg-red-950/95 text-red-100', tag: 'border-red-800 text-red-300', label: 'Safety' },
}

/**
 * On-page cut: the struck block is tinted red, outlined, and crossed out with an
 * X. Crossing the whole region (rather than per-line rules) needs no text-layer
 * geometry, so it can't drift out of line with the actual text. The dashed margin
 * marker (see {@link CutMarginMarker}) carries the label.
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
      {rects.map((rect, i) => (
        <div
          key={i}
          style={rectToStyle(rect)}
          onClick={locked ? undefined : onClick}
          className={cn(
            'rounded-sm bg-red-500/10 outline-1 outline-red-400/50',
            !locked && 'pointer-events-auto cursor-pointer hover:bg-red-500/20',
          )}
        >
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="0" y1="0" x2="100" y2="100" stroke="rgba(220,38,38,0.55)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(220,38,38,0.55)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      ))}
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
 * Cut marker in the page's left margin: a dashed red band the height of the
 * region + a CUT tag, sitting just left of the text. Mirrors the cue marker's
 * placement so cues and cuts line up in the same margin lane.
 */
export function CutMarginMarker({
  rects,
  locked,
  onClick,
}: {
  rects: Rect[]
  locked: boolean
  onClick: () => void
}) {
  const { top, height } = verticalBounds(rects)
  return (
    <div
      style={{
        top: `${top * 100}%`,
        height: `${Math.max(height * 100, 1.6)}%`,
        left: `${MARKER_MARGIN_X * 100}%`,
        transform: 'translateX(-100%)',
      }}
      onClick={locked ? undefined : onClick}
      className={cn(
        'absolute flex items-start justify-end',
        locked ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer',
      )}
    >
      <span className="mr-1 rounded border border-red-300 bg-red-50 px-1 font-mono text-[9px] font-bold tracking-wide text-red-600 uppercase">
        cut
      </span>
      <span className="h-full w-0 shrink-0 border-r-2 border-dashed border-red-500/70" />
    </div>
  )
}

/** Tone-coloured note callout. Used in the right gutter (desktop) or inline (narrow). */
function NoteBubble({
  annotation,
  locked,
  onClick,
}: {
  annotation: AnnotationDto
  locked: boolean
  onClick: () => void
}) {
  const tone: NoteTone = annotation.tone ?? 'NOTE'
  const t = toneStyles[tone]
  return (
    <div
      onClick={locked ? undefined : onClick}
      className={cn(
        'rounded-md border p-2 shadow-lg',
        t.box,
        !locked && 'pointer-events-auto cursor-pointer hover:brightness-110',
      )}
    >
      <span
        className={cn(
          'mb-1 inline-block rounded border px-1 font-mono text-[8.5px] font-bold tracking-wide uppercase',
          t.tag,
        )}
      >
        {t.label}
      </span>
      <div className="text-[11.5px] leading-snug">{annotation.text}</div>
    </div>
  )
}

/** Right-gutter note callout, top-aligned to the annotated region. */
export function NoteCallout({
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
  const { top } = verticalBounds(rects)
  return (
    <div className="pointer-events-none absolute right-1 left-1" style={{ top: `${top * 100}%` }}>
      <NoteBubble annotation={annotation} locked={locked} onClick={onClick} />
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
