import { useCallback, type ReactNode } from 'react'
import { Crosshair, Flashlight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useLocateStateQuery, useToggleLocateMutation } from '../../store/locate'
import { useHighlight } from './useHighlight'
import type { LocateTarget } from '../../store/locate'
import type { WriteTarget } from './rowModel'

export interface SelectionToolbarProps {
  /** Selected rows as locate targets (groups stay groups — the backend
   *  handles their members natively). */
  locateTargets: readonly LocateTarget[]
  /** Distinct write targets (fixtures or elements) the selection expands to,
   *  in visible row order. */
  targets: readonly WriteTarget[]
  /** Drops the selection — cells if there are any, the rows otherwise. */
  onClear: () => void
  /**
   * The selection's own verbs, drawn before Locate and Highlight. On the programmer a cell
   * selection's Set · Clear · Fan (`CellSelectionActions`) and nothing for rows; on the two plain
   * list routes, which cannot select a cell, the row Fan they have always had.
   */
  actions?: ReactNode
}

/**
 * When the two verbs keep their words.
 *
 * `hidden sm:inline` is the viewport rule this bar has always had: on a phone the icons and their
 * tooltips carry it. `@max-[1100px]:hidden` is the *container* rule the programmer's selection bar
 * adds on top — that bar is one 34px line that must not wrap, and these two words are the widest
 * thing on it that a tooltip already says. The two compose: a word shows only when the viewport is
 * at least `sm` **and** the container is at least 1100px wide.
 *
 * On `/fixtures/list` and `/groups/list` there is no query container above this toolbar at all, so
 * the container half is *unknown* and never applies — those routes keep exactly today's behaviour,
 * which is what §5 of the space plan asks for. That is a real dependency on those pages not
 * gaining an ancestor `@container`; if one ever does, these words vanish there and the fix is to
 * name the container rather than to widen the threshold.
 */
export const WORD_CLASS = 'hidden sm:inline @max-[1100px]:hidden'

/**
 * Where Locate, Highlight and Fan go on a phone-width programmer bar, and Deselect does not.
 * Set and Clear stay too — see `CellSelectionActions`.
 *
 * `PD-SELECTION-BAR-DENSITY` and `PD-CLEAR-SELECTION-TOUCH`, decided together because they pull
 * against each other: the chips are the only thing on that row an operator presses, so the width
 * goes to them, and the one control the row keeps at every width is the one a phone has no other
 * way to do — Escape is a key, and "click off" needs empty grid space a full list has none of.
 * This is what the `Phone` artboard draws: glyph · count · chips · New · X. The three folded here
 * are not lost — Locate and Highlight are on the busk target band, and Fan comes back with the
 * width.
 *
 * Same container rule as `WORD_CLASS`, with the same dependency: with no ancestor `@container`
 * the query is false and `/fixtures/list` and `/groups/list` keep every button at every width.
 * `@[600px]` is the bar's phone arm — the threshold row B's key button already uses for "this grid
 * column is a phone's".
 *
 * Exported because the programmer's `SelectionBar` folds its own counts and badge at the same
 * width: one constant, so the two halves of one row cannot fold at different thresholds. The
 * import runs this way round — the bar already depends on this toolbar, never the reverse.
 */
export const PHONE_FOLDED_CLASS = '@max-[600px]:hidden'

export function SelectionToolbar({
  locateTargets,
  targets,
  onClear,
  actions,
}: SelectionToolbarProps) {
  const { data: locateState } = useLocateStateQuery()
  const [toggleLocate] = useToggleLocateMutation()
  const getTargets = useCallback(() => [...targets], [targets])
  const highlight = useHighlight(getTargets)

  const isActive = (target: LocateTarget) =>
    locateState?.targets.some((t) => t.type === target.type && t.key === target.key) ?? false
  const allLocated = locateTargets.length > 0 && locateTargets.every(isActive)

  // All located → release everything; otherwise light up the ones not yet on.
  const locateSelection = () => {
    const toToggle = allLocated ? locateTargets : locateTargets.filter((t) => !isActive(t))
    for (const target of toToggle) {
      toggleLocate(target)
        .unwrap()
        .catch((err) => console.error(`Locate toggle failed for ${target.type} '${target.key}'`, err))
    }
  }

  // `shrink-0`: in the programmer's one-line selection bar this sits at the right end of a row
  // whose middle is a scroller, and a flex item that gives would be squeezed by the chips it is
  // supposed to sit beside. In the default wrapping toolbar it simply wraps instead.
  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      {/* "12 selected" is three times the width of "12" and says the same thing next to a
          row of selection actions. Narrow viewports get the number alone.

          And in the programmer's selection bar it goes entirely, on the same `@max-[1100px]`
          rule as the two verbs' words: that bar counts the selection itself, at its left end, as
          "4 fixtures" — the heads a press lands on — and the same number twice at opposite ends of
          one 34px line reads as two different facts that happen to agree. The list routes have no
          such count of their own, so there it stays.

          Since the two selections became one (`FixturesListContainer`), a marquee's rows are the
          selection too, so this counts the cells' heads under a marquee and the rows' otherwise. */}
      <span className="text-xs text-muted-foreground tabular-nums @max-[1100px]:hidden">
        {targets.length}
        <span className="hidden sm:inline"> selected</span>
      </span>
      {actions}
      {/* No "Apply palette" or "Record palette" here any more. Both authored value-level
          references, which layers replace: applying a look to a cue is a layer, and recording the
          programmer into a look is the record rewrite. Leaving Record in place would have been
          worse than removing it — its route still answers 200 while writing rows no consumer
          reads. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={allLocated ? 'default' : 'outline'}
            size="sm"
            onClick={locateSelection}
            className={cn(PHONE_FOLDED_CLASS, allLocated && 'bg-sky-500 text-white hover:bg-sky-600')}
          >
            <Crosshair className="size-3.5" />
            <span className={WORD_CLASS}>Locate</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {allLocated ? 'Release locate on the selection' : 'Locate the selection: white beam at centre'}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={highlight.isActive ? 'default' : 'outline'}
            size="sm"
            className={PHONE_FOLDED_CLASS}
            onPointerDown={highlight.press}
            onPointerUp={highlight.release}
            onPointerCancel={highlight.release}
            onPointerLeave={highlight.release}
          >
            <Flashlight className="size-3.5" />
            <span className={WORD_CLASS}>Highlight</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Hold: full intensity on the selection, restored on release</TooltipContent>
      </Tooltip>
      {/* "Deselect", not "Clear": on the programmer sheet this sits beside the programmer's
          own Clear, and two buttons a few pixels apart that mean "drop the selection" and
          "release every value on the rig" must not share a label. */}
      <Button variant="ghost" size="sm" onClick={onClear} title="Deselect all">
        <X className="size-3.5" />
        <span className="hidden sm:inline">Deselect</span>
      </Button>
    </div>
  )
}
