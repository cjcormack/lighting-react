import { relinkToDesk, useDeskFollow } from '@/lib/deskFollow'
import { FollowPill } from './FollowPill'

/**
 * The **desk chip** — this window has a selection of its own, and a click joins it to the desk
 * again (multi-screen plan §4, `Main.dc.html` / `Screen2.dc.html`; busk-chrome plan D18).
 *
 * **Drawn only while the window is unlinked.** *Desk* is the resting state — every window follows
 * the desk selection unless it chose not to — and a pill saying so all night was noise on a live
 * view, so while following the chip renders nothing at all; unlinked, it is the dashed *This
 * window*, and its press is `relinkToDesk`. The readings the following chip used to carry went
 * with it: *Desk · from <name>* named the last mover, and an operator at a two-screen desk knows
 * which screen they are selecting from. What that leaves is the way *out* of following, which is
 * no longer a press on this chip: ⌘K's *Stop following the desk selection in this window*
 * (`buildWindowCommands`) is the one door — the Screens sheet only *reports* a row's flag, and
 * there is no MIDI target for it — and it lands the operator on a chip that says where they are.
 * A touch-only screen therefore cannot unlink its selection at all; D18 says where the chip goes
 * and not where the unlink moves to, and whether a second door is owed is Chris's call, not
 * something this chip should grow back to provide.
 *
 * It is a fact about the one selection rather than about this window's chrome: unlinked, the
 * selection is this tab's own and a press from here lands on it, not on the desk's (D8). Sitting on
 * the programmer's row C, the busk rig row, the compact boards' rig strip and — in Pads on the
 * desk board, where there is no rig row — the pad row, and nowhere else — the plain lists
 * never bridge to the desk (D1), so they have nothing to say — and on the busk view it has a
 * sibling, `BuskPageChip`, the same pill for the *page*, which is why the band's copy says
 * *Targets:* (`showSubject`) and row C's, alone and budgeted to the pixel, stays bare.
 *
 * The pill itself is `FollowPill`'s, shared with the page chip so the two cannot drift apart
 * visually; the flags stay entirely separate. `subjectClass` is the host's rung for the subject's
 * fold (D19) — the accessible name is whole whatever it hides.
 */
export function DeskChip({
  showSubject,
  subjectClass,
  className,
}: {
  showSubject?: boolean
  subjectClass?: string
  className?: string
}) {
  const following = useDeskFollow()
  if (following) return null
  return (
    <FollowPill
      following={false}
      subject={showSubject ? 'Targets' : undefined}
      subjectClass={subjectClass}
      label="This window"
      title="This window has its own selection — click to follow the desk again"
      onClick={relinkToDesk}
      className={className}
    />
  )
}
