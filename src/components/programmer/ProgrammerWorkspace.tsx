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
 */
export function ProgrammerWorkspace({ grid, rail }: { grid: ReactNode; rail: ReactNode }) {
  return (
    <div className="@container flex min-h-0 flex-1 gap-3 p-4 @max-[900px]:flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{grid}</div>
      <div className={RAIL_CLASS}>{rail}</div>
    </div>
  )
}
