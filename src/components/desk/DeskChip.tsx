import { Link2, Unlink2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { relinkToDesk, unlinkFromDesk, useDeskFollow } from '@/lib/deskFollow'
import { useWindowName } from '@/lib/windowIdentity'
import { useDeskSelectionSnapshot } from '@/store/selection'
import type { SelectionSource } from '@/api/selectionApi'

/**
 * The **desk chip** — whose selection this window is showing, and a click to flip it
 * (multi-screen plan §4, `Main.dc.html` / `Screen2.dc.html`).
 *
 * Four readings, and each is a fact about the one selection rather than about this window:
 *
 * - **`Desk`** — following, and either nobody has moved the selection since it was cleared or this
 *   window moved it last. Quiet on the window that made the marquee, which is the point of D7:
 *   the chip names the *other* mover, not yourself.
 * - **`Desk · from <name>`** — following, and another window moved it last. The name is what that
 *   window put on its writes (`lib/windowIdentity.ts`), so before the windows registry exists it
 *   can still say *from Screen 1*.
 * - **`Desk · from the desk`** — following, and a control surface moved it last.
 * - **`This window`**, dashed — unlinked: the selection is this tab's own and a press from here
 *   lands on it, not on the desk's (D8).
 *
 * It is the last **mover**, not a lock, and a press never touches it — so *from Screen 1* an hour
 * later is still true. Sitting on the programmer's row C and in the busk band's label row and
 * nowhere else: the plain lists never bridge to the desk (D1), so they have nothing to say.
 */
export function DeskChip({ className }: { className?: string }) {
  const following = useDeskFollow()
  const snapshot = useDeskSelectionSnapshot()
  const me = useWindowName()

  const reading = following ? deskReading(snapshot.source, me) : null
  const title = following
    ? `${reading?.detail ?? 'This window follows the desk selection'} — click to keep a selection of your own in this window`
    : 'This window has its own selection — click to follow the desk again'

  return (
    <button
      type="button"
      aria-pressed={following}
      title={title}
      onClick={() =>
        following
          ? unlinkFromDesk({ targets: snapshot.targets, families: snapshot.families })
          : relinkToDesk()
      }
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-[10px] font-medium leading-none',
        following
          ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
          : 'border-dashed border-muted-foreground/50 text-muted-foreground hover:bg-accent/50',
        className,
      )}
    >
      {following ? <Link2 className="size-[11px]" /> : <Unlink2 className="size-[11px]" />}
      {following ? (
        <>
          {/* The space is the accessible name's, not the layout's: a whitespace-only text node
              makes no flex item, so the gap still governs, while the name reads `Desk · from …`. */}
          Desk{reading?.from != null && ' '}
          {reading?.from != null && (
            <span className="text-muted-foreground">· from {reading.from}</span>
          )}
        </>
      ) : (
        'This window'
      )}
    </button>
  )
}

/** What the chip says under a mover, and the sentence its hover reads. */
export function deskReading(
  source: SelectionSource | null,
  me: string,
): { from: string | null; detail: string } {
  if (source == null) return { from: null, detail: 'Following the desk selection' }
  if (source.kind === 'surface') {
    return { from: 'the desk', detail: 'Following the desk selection, last moved from a control surface' }
  }
  if (source.name === me) return { from: null, detail: 'Following the desk selection, last moved here' }
  return { from: source.name, detail: `Following the desk selection, last moved from ${source.name}` }
}
