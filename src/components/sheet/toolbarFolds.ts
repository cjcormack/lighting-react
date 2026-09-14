/**
 * Where the selection bar's controls fold, as three container-query classes every sheet shares.
 *
 * They were `SelectionToolbar`'s own until the sheet kit (CLAUDE.md §Sheet kit): the patch list,
 * the DMX sheet and the cue sheet draw the same verbs on the same 40px bar, and one control folding
 * at a different width from the one beside it is the bug these exist to prevent. The fixtures
 * list's toolbar re-exports them, so its tests and its callers keep one import.
 */

/**
 * When the two verbs keep their words.
 *
 * `hidden sm:inline` is the viewport rule this bar has always had: on a phone the icons and their
 * tooltips carry it. `@max-[1100px]:hidden` is the *container* rule the programmer's selection bar
 * adds on top — that bar is one 40px line that must not wrap, and these two words are the widest
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

/**
 * Where **Locate and Highlight** go, which is earlier than everything else on the row.
 *
 * The template row needs the width. `All · n` and `New` are fixed, the chips are what an operator
 * presses, and an iPad portrait's row C is ~800px — enough for two recent chips once these two
 * buttons and the fixture count have gone, and enough for none while they are there.
 *
 * They are the right two to lose first because neither is lost: both are on the busk view's target
 * band, and both are momentary aids rather than gestures the grid depends on — unlike Set, Clear
 * and Deselect, which stay at every width because Enter, Backspace and Escape are keys a phone has
 * not got. Fan keeps the 600 fold: it is a cell verb like the two beside it, and folding it earlier
 * would break up a group of three.
 *
 * Same container dependency as [WORD_CLASS] and [PHONE_FOLDED_CLASS]: `/fixtures/list` and
 * `/groups/list` have no ancestor `@container`, so the query is never true there and those two
 * routes keep every button at every width.
 */
export const MID_FOLDED_CLASS = '@max-[800px]:hidden'
