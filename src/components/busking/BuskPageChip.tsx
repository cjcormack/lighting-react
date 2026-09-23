import { relinkBuskPage, useBuskPageFollow } from '@/lib/buskPageFollow'
import { FollowPill } from '@/components/desk/FollowPill'
import { LinkBadge } from '@/components/desk/LinkBadge'
import { useCoPagedWindowNames } from '@/store/windows'

/** The badge's hover and accessible name while this window pages with the desk and nobody else does. */
export const PAGED_WITH_DESK = 'Paged with the desk'

/**
 * The hover and accessible name of the page badge: *Paged with the desk*, and — while other open
 * busk windows page with it — who a tab click here pages too. Every name is listed, since the badge
 * draws only the first.
 */
export function pagedWithDeskTitle(names: readonly string[]): string {
  if (names.length === 0) return PAGED_WITH_DESK
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${PAGED_WITH_DESK}, with ${list} — a tab click here pages ${names.length === 1 ? 'it' : 'them'} too`
}

/**
 * The **page mark** — which page this window is on: the desk's paging group's, or its own
 * (desk-follow plan D6, D7, D9; `Pages.dc.html`'s three states).
 *
 * **Paged with the desk, it is the link badge; on its own page, the dashed *Page: Own*.** D18 drew
 * nothing while following, and the desk-follow review revisited that for the page as D8 did for
 * the selection (Chris, 2026-09-23: "always show when we're linked, even if it is just a small
 * badge"). So while paged with the desk it is `LinkBadge` — the selection's badge, one component
 * so the two cannot drift — naming any other **open** busk window paged with this one
 * (*⛓ Screen 2*, several counted and listed on the hover), because a tab click here pages them
 * too and nothing else on the row says so. The names fold to the glyph on the host's rung
 * ([namesClass]); the glyph never does. On its own page it is `DeskChip`'s twin, the dashed
 * `FollowPill`, reading *Page: Own* — *Own* alone where the host folds [subjectClass] — whose
 * press pages with the desk again.
 *
 * The ways *onto* a page of its own are the ones that were never a press here — arriving with
 * `?page=`, the Screens row's Page segment or its picker on an own-page row, a
 * `windows.viewOptions {page}`, and a tab click that never reached the desk (`BuskingView`'s
 * `onPageSelect`) — and the ways back are this chip, the Screens row and ⌘K.
 *
 * Only the flag is shared with nobody: following the desk's *selection* while holding a page of
 * your own is the whole point (§The busk layout), so neither this nor `DeskChip` reads the other's.
 */
export function BuskPageChip({
  subjectClass,
  namesClass,
  className,
}: {
  /** The pill's *Page:* fold — the host's rung (D19). */
  subjectClass?: string
  /** The badge's names' fold — the host's rung. Drawn always when absent. */
  namesClass?: string
  /** The pill's alone: a host hands `min-w-0 shrink` so its value truncates; the badge never shrinks. */
  className?: string
}) {
  const following = useBuskPageFollow()
  if (following) return <PagedWithDeskBadge namesClass={namesClass} />
  return (
    <FollowPill
      following={false}
      subject="Page"
      subjectClass={subjectClass}
      label="Own"
      title="This window is on a page of its own — click to page with the desk again"
      onClick={relinkBuskPage}
      className={className}
    />
  )
}

/**
 * Split out so the registry subscription is held only while the badge is drawn — an own-page
 * window has no one to name.
 */
function PagedWithDeskBadge({ namesClass }: { namesClass?: string }) {
  const names = useCoPagedWindowNames()
  return <LinkBadge title={pagedWithDeskTitle(names)} names={names} namesClass={namesClass} />
}
