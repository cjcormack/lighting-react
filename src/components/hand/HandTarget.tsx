import { Hand } from 'lucide-react'
import type { HeldRecord } from '@/api/handApi'
import { canHandLand, type HandCandidate, type HandTargetKind } from '@/lib/handTargets'
import { heldName, useDeskHandQuery } from '@/store/hand'
import { cn } from '@/lib/utils'

/**
 * The **target affordance** for the desk's hand — the one thing session 3 adds beyond the wire
 * (multi-screen plan §3.5).
 *
 * ### A lit target is tapped, so it is a button and not a droppable
 *
 * The plan's sketch calls these `useDroppable` sites. They are not, deliberately. A hand place is a
 * **tap** — the whole point of the hand is that no pointer drag is in flight, because the drag is
 * what could not cross the window boundary — so a droppable would never be dropped on in this
 * session, while being registered on the app's *one* `DndContext` for every busk-page and surface
 * drag that is. `DeskDndProvider`'s collision detection falls back to
 * `closestCenter(args).slice(0, 1)` in the gaps between banks, and a foreign candidate there is
 * exactly the "highlight in one place, slot in another" failure §"The busk layout" was written
 * about. Adding one would buy nothing and risk that.
 *
 * Session 4's edge drag does need these targets to be findable from a point, and a droppable would
 * not have helped there either: `document.elementsFromPoint` answers with DOM elements, and dnd-kit
 * gives no way back from one to a droppable. That is what `data-hand-target` is for — the
 * registration both this session and the next can read.
 *
 * ### The affordance is explicit, never a hijacked press
 *
 * Every surface here has a primary gesture that means something (expand a cue card, add a layer,
 * press a slot), so the place is drawn as its own control rather than as a temporary second meaning
 * for the existing one. A mode is state the operator forgets; a dashed strip that is either there
 * or not is not.
 */

/** The candidate a held record makes, which is only ever these two facts. */
export function handCandidate(held: HeldRecord): HandCandidate {
  return { kind: held.kind, hasDeferredEffects: held.look?.hasDeferredEffects }
}

/**
 * What this kind of target could take right now, or null.
 *
 * Null covers all three of "the hand is empty", "the desk has not said yet" and "what is held
 * cannot land here" — one answer, because every caller wants the same thing from all three: draw
 * nothing.
 *
 * **`selectFromResult`, not a plain `useHand()`**, for `useIsDeskConnected`'s reason and at a
 * bigger multiple: this runs once per busk bank and *unconditionally* in every `CueSlotCell` (hooks
 * cannot be conditional, so the filled-slot path pays for it too). A plain subscription re-renders
 * all of them on every `hand.state` frame desk-wide — every pick-up and every drop from any window
 * — including the overwhelmingly common case where this target's own answer was null before and is
 * null again. Narrowing to the offer means a tile whose target cannot take what is held stays put.
 */
export function useHandOffer(target: HandTargetKind): HeldRecord | null {
  const { offer } = useDeskHandQuery(undefined, {
    selectFromResult: ({ data }) => ({
      offer: data != null && canHandLand(handCandidate(data), target) ? data : null,
    }),
  })
  return offer
}

export interface HandPlaceStripProps {
  target: HandTargetKind
  /** Where it would land, in the operator's words: `Colours`, `the programmer`, `Cue 4`. */
  where: string
  onPlace: (held: HeldRecord) => void
  className?: string
}

/**
 * The dashed *Place “X” here* band, drawn only while the hand holds something this target can take.
 *
 * Renders **null** otherwise, which is what keeps it addable to a crowded surface without costing
 * that surface a row.
 */
export function HandPlaceStrip({ target, where, onPlace, className }: HandPlaceStripProps) {
  const held = useHandOffer(target)
  if (held == null) return null
  const name = heldName(held)
  return (
    <button
      type="button"
      data-hand-target={target}
      onClick={() => onPlace(held)}
      title={`Place “${name}” in ${where}`}
      className={cn(
        'flex w-full items-center justify-center gap-1.5 rounded-md border-2 border-dashed',
        'border-primary bg-primary/5 px-2 py-1.5 text-[11px] font-medium text-primary',
        'hover:bg-primary/10',
        className,
      )}
    >
      <Hand className="size-3 shrink-0" aria-hidden />
      <span className="truncate">Place “{name}” here</span>
    </button>
  )
}

/**
 * The ring a target wears when it is *itself* the tap — the empty cue slot, which is already a
 * dashed placeholder and has no room for a band.
 */
export const HAND_TARGET_RING = 'border-primary bg-primary/5 text-primary'
