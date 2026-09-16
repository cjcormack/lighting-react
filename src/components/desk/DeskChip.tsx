import { Link2, Unlink2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { relinkToDesk, unlinkFromDesk, useDeskFollow } from '@/lib/deskFollow'
import { useWindowName } from '@/lib/windowIdentity'
import { useDeskSelectionSnapshot } from '@/store/selection'
import { useDeskWindows, thisWindowRow } from '@/store/windows'
import type { SelectionSource } from '@/api/selectionApi'
import type { DeskWindow } from '@/api/windowsApi'

/**
 * The **desk chip** — whose selection this window is showing, and a click to flip it
 * (multi-screen plan §4, `Main.dc.html` / `Screen2.dc.html`).
 *
 * Four readings, and each is a fact about the one selection rather than about this window:
 *
 * - **`Desk`** — following, and either nobody has moved the selection since it was cleared or this
 *   window moved it last. Quiet on the window that made the marquee, which is the point of D7:
 *   the chip names the *other* mover, not yourself.
 * - **`Desk · from <name>`** — following, and another window moved it last.
 * - **`Desk · from the desk`** — following, and a control surface moved it last.
 * - **`This window`**, dashed — unlinked: the selection is this tab's own and a press from here
 *   lands on it, not on the desk's (D8).
 *
 * **"This window" is resolved through `windows.state`, not through `sessionStorage`.** The desk
 * stamps `source.id` with the mover's socket-minted *row* id (lighting7 d774fd9), which this tab
 * never sees except in its own registry row — so *my* row is the one whose `windowId` is this
 * tab's, and the chip reads *Desk* when `source.id` equals that row's id, *from <name>* when it
 * names another row (the row's current name, so a rename shows at once), and *from the desk* for
 * kind `surface`. `source.id` is absent for a surface write and for a socket that never announced
 * — a pre-registry client on the `sourceName` fallback — and there the chip falls back to comparing
 * names. A duplicated tab copies its `sessionStorage`, so two rows can share one `windowId`: then
 * "my row" is whichever matches first and the twin's write can read as this window's own. D9
 * accepts that as cosmetic; `FU-WINDOWS-OWN-ROW-ID` in lighting7 is the exact fix.
 *
 * It is the last **mover**, not a lock, and a press never touches it — so *from Screen 1* an hour
 * later is still true. Sitting on the programmer's row C and in the busk band's label row and
 * nowhere else: the plain lists never bridge to the desk (D1), so they have nothing to say.
 */
export function DeskChip({ className }: { className?: string }) {
  const following = useDeskFollow()
  const snapshot = useDeskSelectionSnapshot()
  const windows = useDeskWindows()
  const name = useWindowName()
  const me: ThisWindow = { id: thisWindowRow(windows)?.id ?? null, name }

  const reading = following ? deskReading(snapshot.source, me, windows) : null
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

/** This tab, as the chip knows it: its registry row id (null before the announce lands) and name. */
export interface ThisWindow {
  id: string | null
  name: string
}

/** What the chip says under a mover, and the sentence its hover reads. */
export function deskReading(
  source: SelectionSource | null,
  me: ThisWindow,
  windows: readonly DeskWindow[] = [],
): { from: string | null; detail: string } {
  if (source == null) return { from: null, detail: 'Following the desk selection' }
  if (source.kind === 'surface') {
    return { from: 'the desk', detail: 'Following the desk selection, last moved from a control surface' }
  }
  // The id decides only while it can: ours, or another row still in the registry. A row id is
  // socket-minted, so after a reconnect this tab's own standing write names a row that no longer
  // exists — and read by id alone that would fall through to `from <our own name>`. An
  // unresolvable id is a name comparison, which is what a pre-registry write gets too.
  const resolved = source.id != null ? windows.find((w) => w.id === source.id) : undefined
  const byId = source.id != null && me.id != null && (source.id === me.id || resolved != null)
  const mine = byId ? source.id === me.id : source.name === me.name
  if (mine) return { from: null, detail: 'Following the desk selection, last moved here' }
  // The row's current name where the id resolves to one, so a rename shows without a new write;
  // the name the write was stamped with otherwise.
  const from = resolved?.name ?? source.name
  return { from, detail: `Following the desk selection, last moved from ${from}` }
}
