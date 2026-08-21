import { Link2, Link2Off } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LookRefBadgeProps {
  /** The Look's name, or undefined when it can't be found — which is what "missing" means. */
  name?: string
  /** The literal this reference currently resolves to *for the row it sits on*. Shown in the title. */
  resolvedValue?: string
  /** Renders as broken: the Look is gone, or no longer covers this target. */
  missing?: boolean
  className?: string
}

/**
 * A stored `ref:{uuid}` rendered as what the operator called it.
 *
 * Always the Look's **name**, never a `P<n>`-style short code: `P1` already means the positional
 * colour list that FX parameters index, and minting a second numeric shorthand here would make two
 * unrelated grammars look identical in the one place the difference matters.
 *
 * Name-only, with no swatch and no attribute-family styling, and both absences are deliberate. A
 * Look declares no type — its families are derived and one may span several — so there is no family
 * to colour the chip by; and nothing in the UI authors a `ref:` any more, so this is a chip for
 * reading rows that already hold one rather than a control. Layers replace the mechanism outright.
 */
export function LookRefBadge({ name, resolvedValue, missing, className }: LookRefBadgeProps) {
  // `missing` alone, not `name == null`: a caller can legitimately know a row references a Look
  // while not yet knowing which one (the list is still loading). Painting that destructive-red
  // would claim a healthy row is broken for as long as the fetch takes.
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
            : 'References a look that no longer exists'
          : name
            ? `References “${name}”${resolvedValue ? ` — currently ${resolvedValue}` : ''}`
            : 'References a look'
      }
    >
      {broken ? (
        <Link2Off className="size-3 shrink-0" />
      ) : (
        <Link2 className="size-3 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{name ?? (broken ? 'Look missing' : 'Look')}</span>
    </span>
  )
}
