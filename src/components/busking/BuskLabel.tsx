import { cn } from '@/lib/utils'

/**
 * The busk view's one section label — the design canvas's `.lbl`.
 *
 * Every region on this surface is titled the same way: 9px, bold, uppercase, wide-tracked, muted,
 * and **no icon**. That uniformity is the point rather than an economy. The pools and the cue column
 * used to draw a larger icon-bearing heading while the target band and the speed rail drew this one,
 * which made three regions of one instrument read as three surfaces; neither design canvas draws a
 * glyph beside any of them.
 *
 * A `<div>` on purpose, so a test can reach a region's body by walking up from its label. The pools
 * that relied on that are gone — the page is the operator's now — but the palette and the band still
 * label themselves this way, and a `<span>` would make such a walk skip the region root.
 */
export function BuskLabel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn(BUSK_LABEL_CLASS, className)}>{children}</div>
}

/**
 * The same classes as a bare string, for the two places that need them on an element they already
 * compose — the speed rail's card title, which wraps a `BeatIndicator` and a usage badge in one row.
 */
export const BUSK_LABEL_CLASS =
  'text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground'
