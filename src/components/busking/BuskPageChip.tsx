import {
  relinkBuskPage,
  unlinkBuskPage,
  useBuskPageFollow,
} from '@/lib/buskPageFollow'
import { useBuskShowingPageQuery } from '@/store/busk'
import { FollowPill } from '@/components/desk/FollowPill'

/**
 * The **page chip** — whether this window's busk page is the desk's, and a click to flip it.
 *
 * `DeskChip`'s sibling, and its twin in shape because both draw `FollowPill` — same height, same
 * pill, same link / unlink glyph, same solid-following / dashed-local treatment, so the pair reads
 * as one system and cannot drift by one file being edited and not the other. What they do **not**
 * share is state: each carries its own flag, because following the desk's *selection* while holding
 * a page of your own is the whole point (§The busk layout), so neither chip may drive the other.
 *
 * **Both chips name their subject where the pair is on screen together**, and neither does where it
 * is alone. This one sits in the page strip, in a row whose other content is a list of page *names*
 * — nothing there says the word "page" — so it always says *Page:*; the band's `DeskChip` is given
 * `showSubject` to match. On the programmer's row C, which has no page chip and is a 40px chrome
 * row budgeted to the pixel, `DeskChip` stays bare.
 *
 * **Unlinking snapshots what this window is showing**, which is why it takes `activePageId` rather
 * than reading the desk's value: the desk's may be null while this window sits on its `?page=` or
 * on the first page, and "keep what I have" must keep that, not drop to the first page.
 *
 * There is no *from &lt;name&gt;* reading. The desk's showing page carries no mover — `busk.pageState`
 * is a bare page id — and inventing one would mean a second registry lookup for a fact the wire
 * does not have.
 */
export function BuskPageChip({
  activePageId,
  className,
}: {
  activePageId: number | null
  className?: string
}) {
  const following = useBuskPageFollow()
  const { data: deskPageId } = useBuskShowingPageQuery()

  const title = following
    ? deskPageId == null
      ? 'This window follows the desk’s page, and nothing has moved it yet — click to keep a page of your own in this window'
      : 'This window follows the desk’s page — click to keep a page of your own in this window'
    : 'This window is on a page of its own — click to follow the desk’s page again'

  return (
    <FollowPill
      following={following}
      subject="Page"
      title={title}
      onClick={() => (following ? unlinkBuskPage(activePageId) : relinkBuskPage())}
      className={className}
    >
      {following ? 'Desk' : 'This window'}
    </FollowPill>
  )
}
