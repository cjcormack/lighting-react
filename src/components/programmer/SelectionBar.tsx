import { useMemo, useRef } from 'react'
import { MousePointerSquareDashed, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { formatFamilyList, type AttributeFamily } from '@/lib/attributeFamily'
import { describeCellScope, type CellRef } from '@/components/fixtures-list/cellSelectionModel'
import { cellFamilies, COLUMN_DEFS, type ColumnKey } from '@/components/fixtures-list/columns'
import { PHONE_FOLDED_CLASS } from '@/components/fixtures-list/SelectionToolbar'
import { TemplateStrip } from './TemplateStrip'
import { selectionBandState } from './selectionBand'
import type { LocateTarget } from '@/store/locate'

/** Column labels for the scope description, from the same table the header renders. */
const COLUMN_LABELS = new Map(COLUMN_DEFS.map((d) => [d.key, d.label]))
const columnLabel = (col: ColumnKey) => COLUMN_LABELS.get(col) ?? col

/** The ShowBar's key-cap styling, so the two hints read as one vocabulary. */
const KBD_CLASS = 'rounded border bg-muted/50 px-1.5 py-px text-[9.5px]'

/**
 * The short-viewport fold, spelled for `matchMedia` — a second copy of `ProgrammerPage`'s own
 * constant, and `shortViewport.test.ts` is what keeps the two one number. It cannot be imported
 * from there: this module is part of that page's own tree, and `import/no-cycle` is an error here.
 *
 * Row C asks it for a different reason than the rest of D8 does. The others fold *chrome* to buy
 * height; this one decides whether the selection bar is permanently in the flow or held back until
 * a drag ends — see `selectionBandState`.
 */
const SHORT_VIEWPORT = '(max-height: 500px)'

/**
 * Row C — the selection bar, which is also where the templates now live.
 *
 * **One 34px line, and it never wraps**, which is the change session 2 of the space plan is for.
 * It used to be two bands: a full-width template strip that showed the whole library with nothing
 * selected (and wrapped to four rows on a real one), and a rounded selection card below it.
 * Together they cost ~90px of a grid's height, permanently, for a strip whose press could only
 * toast. Now the chips scroll sideways inside it under a fade, and the bar carries only what a
 * live selection has to say.
 *
 * **Whether it is in the flow with nothing selected is `selectionBandState`'s answer, not a
 * constant** (`PD-SELECTION-BAR-SHIFT`). It used to be simply absent, which meant the first cell
 * of a marquee mounted it and pushed every row down 34px under a pointer that was mid-drag. On a
 * desk the band is now always in the flow — reserved and quiet when there is no selection, since
 * the height is only saved at a moment the grid is not being used anyway. On a landscape phone the
 * 34px is worth more than that, so there it stays out of the flow and its presence is *held* for
 * the duration of a drag instead: it arrives on pointer-up, not on the first cell.
 *
 * It is full-bleed with a `border-b` rather than a rounded card inset in a padded block: it is a
 * *rung of the grid's chrome* like row B above it, not an object floating over the page, and the
 * card's 16px of surrounding padding was height.
 *
 * **Below `@[600px]` it is glyph · count · chips · New · X**, which is the `Phone` artboard
 * (`PD-SELECTION-BAR-DENSITY`). The fixture count folds into the cell count's hover, the family
 * badge goes (the chips are already filtered by it), and `SelectionToolbar` folds Locate,
 * Highlight and Fan — the chips are the only thing on this row an operator presses, and on a
 * 393px phone the detail was taking the width they needed. Deselect is the one control kept at
 * every width, because on a phone it and a tap on the grid's empty background are the only ways
 * to drop a selection (`PD-CLEAR-SELECTION-TOUCH`): Escape is a key. Decided together, since
 * "make Deselect reachable" and "give the chips the width" pull on the same row.
 *
 * **The wash is `foreground/5`, not a primary tint** (D4). Selection is neutral on this page now,
 * so that `--primary` can mean one thing — you own this value — from the ownership rings down to
 * the row wash. A blue bar over blue-ringed cells was the two facts the grid most needs to keep
 * apart sharing one colour.
 *
 * **It is a component rather than JSX inside `renderToolbar`, and that is load-bearing.**
 * `renderToolbar` is a render prop invoked during `FixturesListContainer`'s render, so a hook in
 * its body is a hook of *that* component and `react-hooks/rules-of-hooks` rejects it outright.
 * The families the marquee named have to be memoised somewhere — they are derived once here and
 * handed to `TemplateStrip` — and this is the nearest place a hook may legally live. It returns
 * `null` itself rather than being mounted conditionally, so its own hooks run in a stable order.
 */
export function SelectionBar({
  projectId,
  selection,
  cells,
  cellEntryKey,
  cellClearKey,
  clearCells,
  templateTargets,
  targetFamilies,
  targetEmitters,
  marqueeDragging,
}: {
  projectId: number
  selection: React.ReactNode | null
  cells: readonly CellRef[]
  cellEntryKey: boolean
  cellClearKey: boolean
  /** Drops the marquee — the Deselect for a cells-only selection, which `selection` has none for. */
  clearCells: () => void
  templateTargets: readonly LocateTarget[]
  targetFamilies: readonly AttributeFamily[]
  targetEmitters: readonly string[]
  marqueeDragging: boolean
}) {
  // Derived once and shared with the strip below, so the badge and the chips beside it cannot
  // disagree about what is being offered — and so a marquee drag, which mints a fresh `cells`
  // array on every animation frame, pays for one pass rather than two.
  const askedFamilies = useMemo(
    () => (cells.length > 0 ? cellFamilies(cells) : null),
    [cells],
  )

  const shortViewport = useMediaQuery(SHORT_VIEWPORT)
  const hasSelection = !!selection || cells.length > 0
  // The presence from *before* the drag, which is the whole trick: the drag flag and the marquee's
  // first cells arrive in one commit, so a latch taken when `marqueeDragging` flips would already
  // read `true` and hold exactly the arrival it is meant to hold back. Writing a ref during render
  // is safe here — it is idempotent and touches nothing outside this component. The same idiom,
  // hand-rolled the same way, is `lastCueRef` in `components/cues/CueRowParts.tsx`; a third
  // occurrence is the point at which it is worth a hook of its own.
  //
  // It is latched on **every** arm and not only the short one, even though `selectionBandState`
  // reads `heldPresence` past its tall-viewport early return alone. A phone can be rotated between
  // one gesture and the next, and a latch that only ran while short would answer the first drag
  // after the fold with whatever was true whenever it last happened to be short.
  const idlePresenceRef = useRef(hasSelection)
  if (!marqueeDragging) idlePresenceRef.current = hasSelection
  const band = selectionBandState({
    shortViewport,
    heldPresence: marqueeDragging ? idlePresenceRef.current : null,
    hasSelection,
  })

  if (band === 'absent') return null

  // Holding the height with nothing to say. No `bg-foreground/5` wash: that wash *is* the selection
  // (D4), so wearing it over an empty bar would say there is one. The sentence is there because
  // 34px of otherwise blank strip above a grid reads as a rendering fault rather than as a rung.
  if (band === 'reserved') {
    return (
      <div className="flex h-[34px] min-w-0 items-center gap-2 border-b px-3 text-muted-foreground">
        <MousePointerSquareDashed className="size-3.5 shrink-0 opacity-60" />
        <span className="text-xs">Nothing selected</span>
      </div>
    )
  }

  return (
    <div className="flex h-[34px] min-w-0 items-center gap-2 border-b bg-foreground/5 px-3">
      <MousePointerSquareDashed className="size-3.5 shrink-0" />
      {/* Two selections, both live at once, so both are counted. FIXTURE selection is what Record
          scopes on; CELL selection is a transient edit scope that only says where the next value
          goes. Leaving either to be inferred from the buttons beside it is how an operator ends up
          recording a different set from the one they meant.

          The fixture count is `templateTargets` — the heads a press actually lands on, which is
          the cells' heads under a marquee and the selected rows' otherwise — and deliberately not
          the footer's `selectedCount`, which counts visible *rows* with a group as one. Two
          numbers, two questions: the footer says how much of the list you have picked, this says
          how many heads your next gesture reaches. It replaced the bare label "Selected fixtures",
          which named the fact without answering the only question anyone asks of it. */}
      {templateTargets.length > 0 && (
        <span
          className={cn(
            'whitespace-nowrap text-xs font-semibold tabular-nums',
            // The phone arm (`PD-SELECTION-BAR-DENSITY`): with cells in play the fixture count
            // and its separator fold into the cell count's hover, and the width goes to the chips.
            // With rows only it is the one count there is, so it stays. `@[600px]` is row B's
            // phone threshold, the one the key button appears at.
            cells.length > 0 && PHONE_FOLDED_CLASS,
          )}
        >
          {templateTargets.length} fixture{templateTargets.length === 1 ? '' : 's'}
        </span>
      )}
      {cells.length > 0 && (
        <>
          {templateTargets.length > 0 && (
            <span className={cn('text-muted-foreground/50', PHONE_FOLDED_CLASS)}>·</span>
          )}
          <span
            className="whitespace-nowrap text-xs font-semibold tabular-nums"
            // Session 1's rule: the sentence becomes the hover. `describeCellScope` is the same
            // string the drag chip shows, so the two agree by construction. The fixture count
            // rides it too, since on a phone the hover is the only place that count is said.
            title={`${templateTargets.length} fixture${templateTargets.length === 1 ? '' : 's'} · ${describeCellScope(cells, columnLabel)} — edit once, applies to all`}
          >
            {cells.length} cell{cells.length === 1 ? '' : 's'}
          </span>
          {/* The family the marquee named. The *asked* families, never the capability list a
              rows-only selection produces — badging that would read as the operator's statement
              when it is only the strip's filter. Folded on the phone arm: the chips beside it are
              already filtered *by* that family, so the badge restates what the chips show. */}
          {askedFamilies != null && (
            <Badge
              variant="outline"
              className={cn('shrink-0 whitespace-nowrap px-1.5 py-0 text-[10px]', PHONE_FOLDED_CLASS)}
            >
              {formatFamilyList(askedFamilies, ' · ')}
            </Badge>
          )}
          {/* The keyboard half: the two keys that reach the marquee's editor from the grid. The
              editor itself is a popover the container opens at the first selected cell. Both hints
              follow the container's own answer — each flag is false where its key is refused — so
              this cannot advertise a key that does nothing, and the rule
              (`cellKeyboardPermission`) is not restated here.

              `@[1100px]` is the artboard's threshold, kept literally the way session 1 kept the
              legend's: on a bar whose container is the grid column this is the first thing to go,
              and it is the right first thing — a hint, not a control. It does mean the hints are
              unreachable at today's rail width; session 3's 300px rail is what brings them back on
              a wide desk. */}
          {(cellEntryKey || cellClearKey) && (
            <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground @[1100px]:inline-flex">
              {cellEntryKey && (
                <>
                  <kbd className={KBD_CLASS}>⏎</kbd> type a value
                </>
              )}
              {cellClearKey && (
                <>
                  <kbd className={`${KBD_CLASS} ml-1`}>⌫</kbd> clear
                </>
              )}
            </span>
          )}
        </>
      )}
      {/* The templates, on this line since session 2: a hairline, the chips in a scroller, then
          New. It renders nothing when a press has nowhere to land, so the bar can still be here
          for the counts and Deselect alone. */}
      <TemplateStrip
        projectId={projectId}
        cells={cells}
        askedFamilies={askedFamilies}
        targets={templateTargets}
        targetFamilies={targetFamilies}
        targetEmitters={targetEmitters}
      />
      {/* `ml-auto`, not a `flex-1` spacer. The strip's chip scroller is itself `flex-1`, and two
          `flex: 1 1 0%` siblings *split* the row's free space rather than one of them taking it
          all — so a spacer here silently stole roughly half the scroller's width and opened a
          blank gap before these buttons. An auto margin is resolved after flex growth, so it
          takes the whole slack when the strip is absent and exactly nothing when it is there. */}
      {selection && <div className="ml-auto flex shrink-0 items-center">{selection}</div>}
      {/* A marquee with no row selected has no toolbar — `selection` is gated on selected rows —
          and so, until `PD-CLEAR-SELECTION-TOUCH`, no Deselect: the only ways out were Escape and
          a click off, neither of which a full-height phone list has. The same ghost X the toolbar
          draws, with the same `ml-auto` reason, dropping the first rung of the ladder only. */}
      {!selection && cells.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0"
          onClick={clearCells}
          title="Deselect cells"
          aria-label="Deselect cells"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

