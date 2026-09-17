import { pathHasSegment } from './navMatch'
import { BUSK_FOCUSES, LIVE_SHEET_TABS } from './buskWindow'

/**
 * The views one window can put on another (multi-screen plan §4, `Screens.dc.html` §2): the four
 * live views and the two libraries. A `windows.show` carries a **route path**, so this is the
 * vocabulary that turns a picker's choice into one and a row's `view` back into a label.
 *
 * Six literals rather than a read of `navigation.ts`, for `lib/liveViews.ts`'s reason: a nav
 * entry's `pathMatch` answers "which sidebar row is lit" and has already diverged from "what is
 * this view called" once (`/templates` carries four ⌘K entries on one `pathMatch`). The order is
 * `ViewSwitcher`'s for the four, then the two libraries.
 *
 * Matching is [pathHasSegment], never `startsWith`: `/programmer` must not answer for `/program`
 * (the legacy redirect) and `/fx-library` must not answer for `/busk`'s old `/fx`.
 */
export interface WindowView {
  id: string
  label: string
  /** The trailing route segment, `/busk`. */
  segment: string
  /**
   * The per-view options a window on this view announces and the Screens sheet can set
   * (busk-further plan D13). Absent for a view that contributes none — which is every view but
   * Busk today — so the sheet renders whatever a row's *current* view contributes and never learns
   * the word busk. The write is one generic command, `windows.viewOptions {targetId, view,
   * options}`, and the values ride the announce as a free string map.
   */
  options?: readonly WindowViewOption[]
}

/**
 * One row control. An `enum` draws a segmented control over `values`; a `page` draws a picker over
 * the target project's busk pages, resolved against the fetched list. Both are things a remote set
 * cannot lose anything by (D13's test): what the operator at that window *built* is never on the
 * row, only how the window shows it.
 */
export type WindowViewOption =
  | { key: string; label: string; kind: 'enum'; values: readonly string[] }
  | { key: string; label: string; kind: 'page' }

/** Sheet as one enum with `none` (D7), offering only the tabs that have landed. */
const BUSK_SHEET_VALUES: readonly string[] = ['none', ...LIVE_SHEET_TABS]

export const WINDOW_VIEWS: readonly WindowView[] = [
  { id: 'programmer', label: 'Programmer', segment: '/programmer' },
  { id: 'show', label: 'Show', segment: '/show' },
  { id: 'prompt-book', label: 'Prompt Book', segment: '/prompt-book' },
  {
    id: 'busk',
    label: 'Busk',
    segment: '/busk',
    options: [
      { key: 'focus', label: 'Focus', kind: 'enum', values: BUSK_FOCUSES },
      { key: 'sheet', label: 'Sheet', kind: 'enum', values: BUSK_SHEET_VALUES },
      { key: 'page', label: 'Page', kind: 'page' },
    ],
  },
  { id: 'looks', label: 'Looks', segment: '/looks' },
  { id: 'templates', label: 'Templates', segment: '/templates' },
]

/** The route for [view] in [projectId]. */
export function windowViewPath(view: WindowView, projectId: number): string {
  return `/projects/${projectId}${view.segment}`
}

/**
 * Which of the six a route path is showing, or null for any other page. Longest segment wins so
 * a future `/show/…` sibling still reads as Show, not as whatever shorter segment it also ends in.
 */
export function windowViewOf(pathname: string): WindowView | null {
  let best: WindowView | null = null
  for (const view of WINDOW_VIEWS) {
    if (!pathHasSegment(pathname, view.segment)) continue
    if (best == null || view.segment.length > best.segment.length) best = view
  }
  return best
}

/** A label for any route: one of the six by name, else the path itself. */
export function windowViewLabel(pathname: string): string {
  return windowViewOf(pathname)?.label ?? pathname
}

/** The project a route path names, or null for an install-scope page. */
export function projectIdOfPath(pathname: string): number | null {
  const match = /^\/projects\/(\d+)(?:\/|$)/.exec(pathname)
  if (match == null) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) ? id : null
}
