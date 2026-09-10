/**
 * The fixture filter's two forms of one sentence — **short on the field, whole on hover**.
 *
 * `Filter fixtures by name, manufacturer, or type…` is ~300px of 14px text behind a 36px search
 * icon, and every field that carries it is allowed to shrink: the programmer's row B unpicks the
 * field's own `min-w-48` because that row cannot wrap (`ProgrammerGrid`'s note), and below
 * `@[600px]` the field becomes an icon over a popover. So the placeholder was clipped mid-word at
 * every width — `PD-FILTER-PLACEHOLDER-CLIP`. The fix the finding names is a shorter placeholder,
 * not a wider field: the field gives on purpose.
 *
 * Nothing the long form said is deleted — it rides the input's `title`, which is where the space
 * plan puts every sentence it moves. That is the same trade `LEGEND_SHORT` makes for the legend's
 * glosses, and `ProgrammerSourceStrip`'s `Busking` label for its sentence.
 *
 * One module rather than a `const` per field because there are three fields — the shared toolbar
 * control in `FixturesListContainer`, `/fixtures`' own search row and the programmer's `FxSheet` —
 * and three hand-typed copies of one placeholder is how two of them end up saying different things.
 */
export const FIXTURE_FILTER_PLACEHOLDER = 'Filter fixtures…'

/** The whole sentence, for the `title` and for any control that stands in for the field. */
export const FIXTURE_FILTER_HINT = 'Filter fixtures by name, manufacturer, or type'
