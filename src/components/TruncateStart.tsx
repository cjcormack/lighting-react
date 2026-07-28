import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Single line clipped at its START — "…3.2.10", keeping the end that distinguishes one
 * cue number from the next.
 *
 * CSS can't do this. `text-overflow: ellipsis` only ever ellipsises the end of a line, and
 * the usual `direction: rtl` flip does move the ellipsis to the left but leaves the clipped
 * glyph's width behind as a gap ("… 3.2.10") — the remaining text is never re-flowed. So
 * the string is shortened here instead, and what renders is exactly what fits.
 *
 * Measurement is done on a canvas rather than by probing the DOM, so narrowing the text
 * costs no layout passes.
 */

const ELLIPSIS = '…'

let measureCtx: CanvasRenderingContext2D | null | undefined

function context(): CanvasRenderingContext2D | null {
  // undefined = not tried yet, null = unavailable (jsdom has no canvas).
  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d')
  }
  return measureCtx
}

export function TruncateStart({
  text,
  className,
  title,
}: {
  text: string
  /** Must give the element a width — it is measured against, not derived from, the text. */
  className?: string
  title?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(text)

  useLayoutEffect(() => {
    const el = ref.current
    const ctx = context()
    // Nothing to measure with (jsdom, or a browser refusing a 2d context): show the string
    // whole. Returning without this would freeze the element on the text it first mounted
    // with, so a renamed or renumbered cue would keep rendering its old label.
    if (!el || !ctx) {
      setDisplay(text)
      return
    }

    const fit = () => {
      const avail = el.clientWidth
      // Not laid out yet (or in a collapsed pane): leave the last good text alone rather
      // than clipping everything down to a bare ellipsis.
      if (avail <= 0) return

      const style = getComputedStyle(el)
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const fits = (s: string) => ctx.measureText(s).width <= avail

      if (fits(text)) {
        setDisplay(text)
        return
      }
      // Longest tail that still fits with the ellipsis in front of it.
      let lo = 0
      let hi = text.length
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (fits(ELLIPSIS + text.slice(text.length - mid))) lo = mid
        else hi = mid - 1
      }
      setDisplay(ELLIPSIS + text.slice(text.length - lo))
    }

    fit()
    // Re-fit when the cell resizes. Absent in some test environments — the one-off fit
    // above still stands, so degrade instead of throwing.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  return (
    <span ref={ref} title={title} className={cn('block overflow-hidden whitespace-nowrap', className)}>
      {/* The clipping is a visual accommodation, so assistive tech gets the whole string:
          announcing "…3.2.10" would make QS1-3.2.10 and QS2-3.2.10 indistinguishable. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{display}</span>
    </span>
  )
}
