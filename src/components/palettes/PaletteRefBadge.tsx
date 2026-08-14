import { Link2, Link2Off } from 'lucide-react'
import { cn } from '@/lib/utils'
import { paletteColourCss } from './paletteValue'
import type { PaletteType } from '@/api/palettesApi'

export interface PaletteRefBadgeProps {
  /** The palette's name, or undefined when it can't be found — which is what "missing" means. */
  name?: string
  type?: PaletteType
  /**
   * The literal this reference currently resolves to *for the row it sits on*. Drives the leading
   * swatch on a COLOUR reference; a POSITION or level reference has no swatch to lead with.
   */
  resolvedValue?: string
  /** Renders as broken: the palette is gone, or no longer covers this target. */
  missing?: boolean
  className?: string
}

/**
 * A stored `ref:{uuid}` rendered as what the operator called it.
 *
 * Always the palette's **name**, never a `P<n>`-style short code: `P1` already means the positional
 * colour list that FX parameters index, and minting a second numeric shorthand for named palettes
 * would make two unrelated grammars look identical in the one place the difference matters.
 *
 * The swatch leads for COLOUR because that is the fastest read; the chain glyph is what says
 * "this tracks a palette" for every type, including the ones with nothing to show.
 */
export function PaletteRefBadge({
  name,
  type,
  resolvedValue,
  missing,
  className,
}: PaletteRefBadgeProps) {
  const swatch = !missing && type === 'COLOUR' && resolvedValue ? paletteColourCss(resolvedValue) : null
  // `missing` alone, not `name == null`: a caller can legitimately know a row references a
  // palette while not yet knowing which one (the palette list is still loading). Painting that
  // destructive-red would claim a healthy row is broken for as long as the fetch takes.
  const broken = missing === true

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-sm border px-1 py-px text-xs',
        broken
          ? 'border-destructive/60 bg-destructive/10 text-destructive'
          : 'border-border bg-muted/60',
        className,
      )}
      title={
        broken
          ? name
            ? `References “${name}”, which no longer covers this fixture`
            : 'References a palette that no longer exists'
          : name
            ? `References “${name}”${resolvedValue ? ` — currently ${resolvedValue}` : ''}`
            : 'References a palette'
      }
    >
      {swatch && (
        <span
          className="size-3 shrink-0 rounded-[2px] border border-border/60"
          style={{ background: swatch }}
        />
      )}
      {broken ? (
        <Link2Off className="size-3 shrink-0" />
      ) : (
        !swatch && <Link2 className="size-3 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{name ?? (broken ? 'Palette missing' : 'Palette')}</span>
    </span>
  )
}
