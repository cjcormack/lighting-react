import { Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The **link badge** — a window following the desk always says so (desk-follow plan D7, D8;
 * `Selection.dc.html`, `Pages.dc.html`). D18 had hidden both desk chips while following, on the
 * reasoning that a pill saying *Desk* all night is noise; the review kept the reasoning and changed
 * the answer: a glyph is not a pill, and a window that says nothing about which selection or page
 * it is on leaves the operator to remember. So while linked a host draws this, and while local the
 * dashed chip (`FollowPill`) takes its place and presses back.
 *
 * **One component for both uses so they cannot drift**: `DeskChip` draws it beside the family pill
 * for the selection, glyph only at every width, and the page's (D7) beside the tabs, naming
 * any other window paged with this one. [names] is that list — the first is drawn after the glyph,
 * the rest counted as `+N`, every one listed by the host in [title] — and [namesClass] is the row's
 * rung for folding them to the glyph alone (D19's convention: the host measures, the part takes a
 * class). With no names it is the glyph and nothing else.
 *
 * **A mark, never a control.** The way out of following is the Screens row and ⌘K, and the way
 * back is the chip that replaces this, so a press here would be a third door that had to answer
 * *to what?*. It is an `img` with the whole reading as its accessible name — the hover sentence,
 * names included — so a test or a screen reader gets the same name at every width. `shrink-0`, and
 * the same 20px height as the pills beside it: a badge that gave way would move the controls it
 * exists to sit quietly beside.
 */
export function LinkBadge({
  title,
  names,
  namesClass,
  className,
}: {
  /** The hover and the accessible name: *Following the desk selection*. */
  title: string
  /** Other windows linked with this one, drawn after the glyph. Absent or empty draws the glyph alone. */
  names?: readonly string[]
  /** The names' fold — the host's rung. Drawn always when absent. */
  namesClass?: string
  className?: string
}) {
  const shown = names != null && names.length > 0 ? names : null
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      data-link-badge
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-1 text-[10px] font-semibold leading-none text-muted-foreground',
        className,
      )}
    >
      <Link2 className="size-[11px] shrink-0" aria-hidden />
      {shown != null && (
        <span data-link-badge-names className={namesClass}>
          {shown[0]}
          {shown.length > 1 && ` +${shown.length - 1}`}
        </span>
      )}
    </span>
  )
}
