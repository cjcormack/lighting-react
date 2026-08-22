import { Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LookNameBadgeProps {
  /** The Look's name, or undefined when it can't be found — which is what "missing" means. */
  name?: string
  /** Renders as broken: the Look this names is gone. */
  missing?: boolean
  className?: string
}

/**
 * A Look rendered as what the operator called it — the label on a layer row.
 *
 * Always the Look's **name**, never a `P<n>`-style short code: `P1` already means the positional
 * colour list that FX parameters index, and minting a second numeric shorthand here would make two
 * unrelated grammars look identical in the one place the difference matters.
 *
 * Name-only, with no swatch and no attribute-family styling, and both absences are deliberate: a
 * Look declares no type — its families are derived and one may span several — so there is no family
 * to colour the chip by.
 *
 * This was `LookRefBadge`, and it changed in more than name. It rendered a stored `ref:{uuid}` with
 * chain iconography (`Link2` / `Link2Off`), titles reading "References …", and a `resolvedValue`
 * prop naming the literal the reference currently resolved to *for the row it sat on*. The `ref:`
 * grammar retired in session 4 and its sole remaining caller is `LayerRow`, where a chain glyph and
 * the word "references" both misdescribe what a layer is — so the iconography is `Layers` and the
 * titles name the Look plainly.
 */
export function LookNameBadge({ name, missing, className }: LookNameBadgeProps) {
  // `missing` alone, not `name == null`: a caller can legitimately know a layer names a Look while
  // not yet knowing which one (the list is still loading). Painting that destructive-red would
  // claim a healthy layer is broken for as long as the fetch takes.
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
            ? `The look “${name}” no longer exists`
            : 'This names a look that no longer exists'
          : name
            ? `Look “${name}”`
            : 'A look'
      }
    >
      {/* One glyph for both states — the destructive colouring carries "broken". The old badge
          swapped `Link2` for `Link2Off`, which read as "the link is severed"; a layer naming a
          deleted Look is not a severed link, it is a layer pointing at nothing. */}
      <Layers className={cn('size-3 shrink-0', broken ? undefined : 'text-muted-foreground')} />
      <span className="truncate">{name ?? (broken ? 'Look missing' : 'Look')}</span>
    </span>
  )
}
