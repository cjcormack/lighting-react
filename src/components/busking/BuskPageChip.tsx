import { relinkBuskPage, useBuskPageFollow } from '@/lib/buskPageFollow'
import { FollowPill } from '@/components/desk/FollowPill'

/**
 * The **page chip** — this window is on a busk page of its own, and a click follows the desk's
 * page again.
 *
 * `DeskChip`'s sibling, and its twin in shape because both draw `FollowPill` — same height, same
 * pill, same link / unlink glyph, same dashed-local treatment, so the pair reads as one system and
 * cannot drift by one file being edited and not the other. What they do **not** share is state:
 * each carries its own flag, because following the desk's *selection* while holding a page of your
 * own is the whole point (§The busk layout), so neither chip may drive the other.
 *
 * **Drawn only while the page is unlinked** (busk-chrome plan D18), like its sibling: *Desk* is the
 * resting state, and a pill saying so on every page strip was noise. The ways *into* a page of
 * your own are the ones that were never a press on this chip — arriving with `?page=`, a Screens
 * row's page control or a `windows.viewOptions {page}`, and a tab click that never reached the
 * desk (`BuskingView`'s `onPageSelect`) — and each lands on this chip, whose press is the way back.
 *
 * It always says *Page:*: it sits on the pad row, whose other content is a list of page *names*,
 * and nothing there says the word. `subjectClass` is the host's rung for that subject's fold
 * (D19); the accessible name stays *Page: This window* whatever the width hides.
 */
export function BuskPageChip({ subjectClass, className }: { subjectClass?: string; className?: string }) {
  const following = useBuskPageFollow()
  if (following) return null
  return (
    <FollowPill
      following={false}
      subject="Page"
      subjectClass={subjectClass}
      label="This window"
      title="This window is on a page of its own — click to follow the desk’s page again"
      onClick={relinkBuskPage}
      className={className}
    />
  )
}
