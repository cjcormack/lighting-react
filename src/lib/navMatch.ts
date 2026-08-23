/** The shape `mostSpecificActiveId` needs: everything else on a nav item is irrelevant here. */
export interface PathMatchable {
  id: string
  pathMatch: string
}

/**
 * Among all visible nav items whose `pathMatch` appears in the current pathname, return the id of
 * the most specific one — longest `pathMatch` wins. This keeps a parent like "Project Settings"
 * from staying active while the operator is on one of its child tabs (e.g. "Patch List").
 *
 * The match is `endsWith(m) || includes(m + '/')`, deliberately **not** `startsWith`: it has to see
 * a whole trailing *segment*, because a pathname is `/projects/7/looks` rather than `/looks`. That
 * is also what keeps sibling routes whose names prefix one another apart — `/programmer` does not
 * light up `/program`, because it neither ends with it nor contains `/program/`.
 *
 * Extracted from `ProjectSwitcher` so that guarantee can be pinned by a test rather than described
 * in a comment. It was load-bearing twice over: it is why a `programmer` nav entry is safe to add
 * beside the cue-authoring one, and the same reasoning done by hand with `startsWith` is what the
 * warning in `ProgrammerIndicator` is about.
 */
export function mostSpecificActiveId<T extends PathMatchable>(
  items: readonly T[],
  pathname: string,
): string | null {
  let winner: T | null = null
  for (const item of items) {
    const m = item.pathMatch
    if (!pathname.endsWith(m) && !pathname.includes(m + '/')) continue
    if (!winner || m.length > winner.pathMatch.length) winner = item
  }
  return winner?.id ?? null
}
