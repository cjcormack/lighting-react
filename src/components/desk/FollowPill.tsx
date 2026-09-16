import { Link2, Unlink2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The **follow/local pill** — the chrome both desk chips are drawn from.
 *
 * There are two of them: `DeskChip` for the selection and `components/busking/BuskPageChip` for the
 * busk page. They must read as one system, because on the busk view they sit a row apart and say
 * the same two words; and the thing they must *not* share is their state, since following the
 * desk's selection while holding a page of your own is the whole point of the pair existing.
 *
 * So the split is: this owns the shape — height, pill, the link / unlink glyph, the solid-following
 * and dashed-local treatments, the optional muted subject — and each chip owns its own flag, its
 * own label and its own click. The visual promise is then kept by the type system rather than by
 * two developers remembering to edit both files; the two flags stay as independent as they were.
 *
 * `subject` is a word like *Targets* or *Page*, drawn muted before the value. It is shown where the
 * pair is on screen together and omitted where a chip is alone (the programmer's row C), which is
 * both a legibility call and a width one — that row is a 40px chrome row budgeted to the pixel.
 * The space after it is a whitespace-only text node, which makes no flex item, so the gap still
 * governs the layout while the accessible name reads `Targets: Desk`.
 */
export function FollowPill({
  following,
  subject,
  title,
  onClick,
  className,
  children,
}: {
  following: boolean
  subject?: string
  title: string
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={following}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-[10px] font-medium leading-none',
        following
          ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
          : 'border-dashed border-muted-foreground/50 text-muted-foreground hover:bg-accent/50',
        className,
      )}
    >
      {following ? <Link2 className="size-[11px]" /> : <Unlink2 className="size-[11px]" />}
      {subject != null && <span className="text-muted-foreground">{subject}:</span>}
      {subject != null && ' '}
      {children}
    </button>
  )
}
