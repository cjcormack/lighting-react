import { cn } from '@/lib/utils'
import type { AnnotationDto, Rect } from '../../api/promptBooksApi'
import { rectToStyle } from '../../lib/promptBook/geometry'

interface AnnotationOverlayProps {
  annotation: AnnotationDto
  /** Rects of this annotation's region that sit on the rendered page. */
  rects: Rect[]
  locked: boolean
  onClick: () => void
}

/**
 * A free annotation on a script page. Strikethroughs render as a cold rule
 * through the region's vertical centre (struck, dead); notes get a margin tag;
 * freetext renders its text inside the region.
 */
export function AnnotationOverlay({ annotation, rects, locked, onClick }: AnnotationOverlayProps) {
  return (
    <>
      {rects.map((rect, i) => {
        if (annotation.kind === 'STRIKETHROUGH') {
          const mid: Rect = { ...rect, y: rect.y + rect.h / 2, h: 0 }
          return (
            <div
              key={`${annotation.id}-${i}`}
              style={{ ...rectToStyle(mid), height: 0 }}
              onClick={locked ? undefined : onClick}
              className={cn(
                'border-t-2 border-slate-400/80',
                !locked && 'pointer-events-auto cursor-pointer hover:border-slate-300',
              )}
            />
          )
        }
        return (
          <div
            key={`${annotation.id}-${i}`}
            style={rectToStyle(rect)}
            onClick={locked ? undefined : onClick}
            className={cn(
              'rounded-sm',
              annotation.kind === 'NOTE' && 'bg-sky-400/10 outline-1 outline-dashed outline-sky-400/40',
              annotation.kind === 'FREETEXT' && 'outline-1 outline-dashed outline-slate-400/40',
              !locked && 'pointer-events-auto cursor-pointer hover:outline-sky-300/70',
            )}
          >
            {annotation.kind === 'NOTE' && i === 0 && annotation.text && (
              <span className="absolute -right-2 top-1/2 translate-x-full -translate-y-1/2 max-w-40 truncate rounded border bg-background/95 px-1.5 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
                ✎ {annotation.text}
              </span>
            )}
            {annotation.kind === 'FREETEXT' && (
              <span
                className="absolute inset-0 flex items-start overflow-hidden p-0.5 text-[11px] leading-tight font-medium"
                style={{ color: annotation.color ?? '#1d4ed8' }}
              >
                {annotation.text}
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}
