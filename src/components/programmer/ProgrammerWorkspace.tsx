import { type ReactNode } from 'react'

/**
 * Where the rail sits relative to the grid.
 *
 * **Session 2 replaces this.** The right-hand Layers + FX rail becomes a ~322px LEFT-hand stack
 * rail merging both bands into one list under a shared `+ Look / + Template / + Effect` footer.
 * Both facts — the side and the width — live here and in the JSX order below, on purpose: nothing
 * downstream may assume either.
 *
 * `flex min-h-0 flex-col` is not decoration: the rail inside scrolls itself, and a block wrapper
 * gives its child an AUTO height, under which `overflow-y-auto` never engages — a long layer stack
 * would simply run off the bottom of the page with no scrollbar anywhere.
 */
const RAIL_CLASS = 'flex min-h-0 w-[404px] shrink-0 flex-col @max-[900px]:w-full'

/**
 * The grid and the rail, on one screen.
 *
 * The point of the whole view: values, layers and effects were three tabs of a collapsed pane, so
 * the three readings of one live object could never be seen together, and editing values while
 * watching the layer stack that produced them was impossible by construction.
 *
 * Below 900px the rail drops beneath the grid rather than hiding — same rule as the show bar. The
 * page keeps the region above the grid extensible for the same reason the rail is a slot: Session 2
 * inserts a scope band and a template strip between the action bar and the grid.
 *
 * **The `@container` is a wrapper, and the queried classes are on its child.** A container query
 * matches an element's *ancestor* containers, never the element that declares the container, so
 * `@max-[900px]:flex-col` on the same element as `@container` never fired — while the rail's
 * `@max-[900px]:w-full`, one level down, did. Below 900px that left the row direction with a
 * full-width rail in it: the grid was flexed to zero width, its toolbar and legend rendered at
 * min-content in a sliver at the left, and the rail painted over them. Found on a desk at a
 * narrow window, three sessions after it shipped.
 *
 * **Stacked, the workspace scrolls as a page; side by side, each column scrolls itself.** Side by
 * side, the grid and the rail each own the full height and scroll inside it, which is what makes a
 * 200-row sheet usable beside a long layer stack. Stacked, that same rule split one short window's
 * height between the two, and the grid's share went entirely on its own chrome — filter, template
 * strip, legend — so the *table* flexed to zero and the fixtures simply disappeared below the
 * rail. So below 900px the inner column is the scroller instead: the grid keeps a floor
 * (`min-h-[26rem]`, room for the chrome and a handful of rows) and the rail takes its natural
 * height beneath it, and the operator scrolls the page the way any stacked layout is scrolled.
 * The table still scrolls inside its floor (its virtualiser needs a bounded scroller); the rail
 * does not, so there is one nested scroller on the page rather than two, and it is the one that
 * holds the long list.
 */
export function ProgrammerWorkspace({ grid, rail }: { grid: ReactNode; rail: ReactNode }) {
  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 gap-3 p-4 @max-[900px]:flex-col @max-[900px]:overflow-y-auto">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col @max-[900px]:min-h-[26rem] @max-[900px]:shrink-0">
          {grid}
        </div>
        <div className={RAIL_CLASS}>{rail}</div>
      </div>
    </div>
  )
}
