import type { AttributeFamily } from '@/lib/attributeFamily'
import type { LookFamilyFilter } from '@/components/ViewSwitcher'
import type {
  TemplateGroup,
  TemplateLayoutEntryInput,
  TemplateSummary,
} from '@/api/templatesApi'

/**
 * The template library's shape, composed client-side from the two flat lists the server serves.
 *
 * Why the client composes it: the server keeps `templates` and `template_groups` as two tables
 * with two `sortOrder`s, because membership belongs on the member (a template joining a group must
 * not rewrite the group's record) and two tables cannot share an `ORDER BY`. So `GET /templates`
 * and `GET /template-groups` stay flat, and this module is the **one** place the tree is built —
 * the busk view and `/templates` both read it, which is what keeps a pad grid and a drag list
 * drawing the same order from the same numbers.
 *
 * The tie-break mirrors the server's `currentTemplateLayout`: `(sortOrder, template before group,
 * name)`. Ties are transient (a create appends), but the two sides must still agree on them.
 */
export type LayoutEntry =
  | { kind: 'template'; template: TemplateSummary }
  | { kind: 'group'; group: TemplateGroup; templates: TemplateSummary[] }

/**
 * Stable DnD / React key for an entry: `t:{id}` for a template, `g:{id}` for a group's header.
 *
 * A group exposes a **second** droppable, `gbody:{id}` ([groupBodyDragId]), for the area its
 * members sit in. The two answer different questions: over the header means "put me at this
 * top-level position", over the body means "put me *in* this group" — and an empty group has a
 * body and no members, so without it there would be nothing to drop into.
 */
export function layoutEntryId(entry: LayoutEntry): string {
  return entry.kind === 'template' ? templateDragId(entry.template.id) : groupDragId(entry.group.id)
}

export function templateDragId(templateId: number): string {
  return `t:${templateId}`
}

export function groupDragId(groupId: number): string {
  return `g:${groupId}`
}

export function groupBodyDragId(groupId: number): string {
  return `gbody:${groupId}`
}

export type DragIdKind = 'template' | 'group' | 'groupBody'

/** Parse a drag id back to what it names, or null for a foreign id. */
export function parseDragId(id: string): { kind: DragIdKind; id: number } | null {
  const match = /^(t|g|gbody):(\d+)$/.exec(id)
  if (!match) return null
  const kind: DragIdKind = match[1] === 't' ? 'template' : match[1] === 'g' ? 'group' : 'groupBody'
  return { kind, id: Number(match[2]) }
}

/**
 * Code-unit order, **not** `localeCompare`: the server's half of this tie-break is Kotlin's
 * `String.compareTo`, which compares UTF-16 code units, so a locale collation would order
 * `apple` before `Banana` where the server orders `Banana` first. Ties are transient, but the two
 * sides must still agree on them.
 */
function byName(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

function byPosition(a: { sortOrder: number; name: string }, b: { sortOrder: number; name: string }) {
  return a.sortOrder - b.sortOrder || byName(a.name, b.name)
}

/**
 * Compose the tree. A template whose `groupId` names no group in `groups` is treated as ungrouped:
 * the two lists can arrive from two fetches, and a group deleted between them must not make its
 * members vanish from the page.
 */
export function buildTemplateLayout(
  templates: readonly TemplateSummary[],
  groups: readonly TemplateGroup[],
): LayoutEntry[] {
  const groupIds = new Set(groups.map((g) => g.id))
  const members = new Map<number, TemplateSummary[]>()
  const topLevelTemplates: TemplateSummary[] = []
  for (const template of templates) {
    if (template.groupId != null && groupIds.has(template.groupId)) {
      const list = members.get(template.groupId) ?? []
      list.push(template)
      members.set(template.groupId, list)
    } else {
      topLevelTemplates.push(template)
    }
  }

  const entries: { sortOrder: number; isGroup: 0 | 1; name: string; entry: LayoutEntry }[] = [
    ...topLevelTemplates.map((template) => ({
      sortOrder: template.sortOrder,
      isGroup: 0 as const,
      name: template.name,
      entry: { kind: 'template' as const, template },
    })),
    ...groups.map((group) => ({
      sortOrder: group.sortOrder,
      isGroup: 1 as const,
      name: group.name,
      entry: {
        kind: 'group' as const,
        group,
        templates: [...(members.get(group.id) ?? [])].sort(byPosition),
      },
    })),
  ]
  entries.sort((a, b) => a.sortOrder - b.sortOrder || a.isGroup - b.isGroup || byName(a.name, b.name))
  return entries.map((e) => e.entry)
}

/** The wire shape `reorderTemplates` takes — every entry, in order. */
export function layoutToRequest(layout: readonly LayoutEntry[]): TemplateLayoutEntryInput[] {
  return layout.map((entry) =>
    entry.kind === 'template'
      ? { templateId: entry.template.id }
      : { groupId: entry.group.id, templateIds: entry.templates.map((t) => t.id) },
  )
}

/**
 * A group's family, derived from its members the way the server derives it — and from the
 * *members in the layout* rather than `group.family`, so a draft mid-drag answers for what it would
 * hold rather than what the server last said.
 */
export function groupFamilyOf(entry: Extract<LayoutEntry, { kind: 'group' }>): AttributeFamily | null {
  for (const template of entry.templates) {
    if (template.family != null) return template.family
  }
  return null
}

/**
 * The family filter, applied to the tree — a **view** of the layout, and never a re-ordering of it.
 * `Array.filter` preserves relative order, which is the property [moveInLayout] leans on to run a
 * drag against the whole layout while the operator is looking at one bank. Don't sort here.
 *
 * A group with **no derivable family** is kept under every family rather than under `ALL` alone.
 * The predicate is `groupFamilyOf(entry) === null` and not "has no members" on purpose: that is
 * exactly the condition under which [moveInLayout] accepts a template of *any* family, so the UI
 * offers a target precisely where the reducer has one. It covers three cases in one — a group just
 * created (which has to be fillable in the bank it was created in, or it never can be), a group
 * whose members all have a null family, and a group drained of its last family-bearing member
 * *mid-drag*, which a "no members" predicate would unmount under the operator's cursor.
 *
 * A group's **members are never filtered**: the family is uniform by the one-family rule, so
 * whenever a group is shown its member list is shown whole. That is what makes a within-group
 * reorder mean the same thing filtered or not.
 *
 * `/templates` is the only caller — the busk view buckets pads by each **template's** own family,
 * so no group of any kind reaches a pad column. Both the route (for the count and the empty state)
 * and `TemplateLayoutList` (to render) call this, and they must agree, which is why the predicate
 * lives here rather than in either. `components/fixtures-list/rowModel.ts` makes the same call for
 * fixture groups: a genuinely empty group survives a filter, one whose members were all filtered
 * out does not.
 */
export function filterLayoutByFamily(
  layout: readonly LayoutEntry[],
  family: LookFamilyFilter,
): LayoutEntry[] {
  if (family === 'ALL') return [...layout]
  return layout.filter((entry) => {
    if (entry.kind === 'template') return entry.template.family === family
    const groupFamily = groupFamilyOf(entry)
    return groupFamily === null || groupFamily === family
  })
}

export type MoveResult =
  | { layout: LayoutEntry[]; refused?: undefined }
  /** The drop would put two families in one group; `layout` is unchanged. */
  | { layout: LayoutEntry[]; refused: 'family' }

/**
 * The drag reducer: where does `activeId` go when it is over `overId`?
 *
 * Pure, so the page's `onDragOver` is a state update and nothing else, and so every arm is a unit
 * test rather than a jsdom pointer sequence. Ids are [templateDragId], [groupDragId] (a group's
 * header — its top-level position) and [groupBodyDragId] (the area its members sit in).
 *
 * The arms:
 *  - template over a top-level template or a group **header** → reorder at top level, leaving its
 *    group if it had one;
 *  - template over a group's member → into that group, at the member's index;
 *  - template over a group's **body** → into that group, at the end (the empty-group case);
 *  - group over anything → reorder at top level relative to what that thing sits in; a group never
 *    nests, so over a member or a body means over that member's group;
 *  - a family mismatch on any "into a group" arm → `refused: 'family'`, layout unchanged.
 *
 * Two phases, the standard dnd-kit multi-container split, and the reason is stability:
 *
 *  - **`'over'`** (from `onDragOver`, fired continuously) moves the item *between* containers only
 *    — into a group before the hovered member, or out to the top level — and answers null when the
 *    hover is inside the container it is already in. Within a container the `SortableContext`
 *    previews the reorder with transforms, and a reducer that also moved the item there would fight
 *    it: each hover would lift and re-insert on the other side of the target, and the row would
 *    oscillate.
 *  - **`'end'`** (from `onDragEnd`, once) commits the within-container reorder with the `arrayMove`
 *    convention every other list in the app has — moving *down* lands after the target, moving
 *    *up* lands before it. A cross-container drop at this phase behaves as `'over'` would.
 *
 * Returns null when nothing would change, so a caller can skip a state write.
 *
 * **Filter-blind, and load-bearingly so.** `/templates` runs this on the **whole** layout while the
 * operator may be seeing one family's bank, and that is what lets a filtered drag still post the
 * complete body `reorderTemplates` requires. Four things make it hold, and a change to any of them
 * breaks a filtered drag while leaving an unfiltered one working:
 *
 *  - every id dnd-kit reports names a **mounted** thing, so [findIn] can never resolve to an entry
 *    the filter hid;
 *  - the container test is **membership** (`top` / `g:{id}`), not position;
 *  - insertion is **adjacent to the target** rather than at a computed index, so it means the same
 *    thing in both views;
 *  - [filterLayoutByFamily] preserves relative order, so the one place an array position decides
 *    anything — the `fromIndex < toIndex` sign below — answers the same in both.
 *
 * What the operator sees as a result: entries the filter hides keep their own order, but can end up
 * on the other side of the row that moved. There is no droppable for "the slot between two hidden
 * entries", so the two placements are the same input; this is the minimal disturbance, not a bug.
 */
export function moveInLayout(
  layout: readonly LayoutEntry[],
  activeId: string,
  overId: string,
  phase: 'over' | 'end' = 'end',
): MoveResult | null {
  if (activeId === overId) return null
  const active = parseDragId(activeId)
  const over = parseDragId(overId)
  if (!active || !over || active.kind === 'groupBody') return null

  const from = findIn(layout, active.kind, active.id)
  const to = findIn(layout, over.kind === 'groupBody' ? 'group' : over.kind, over.id)
  if (!from || !to) return null

  // The container each side sits in, for the down-lands-after rule. A group header and a group
  // body are both "the top level" for a group being dragged, and "top level" / "that group" for a
  // template respectively.
  const containerOf = (pos: { top: number; member: number }) =>
    pos.member === -1 ? 'top' : `g:${(layout[pos.top] as Extract<LayoutEntry, { kind: 'group' }>).group.id}`
  const fromContainer = containerOf(from)
  const toContainer =
    active.kind === 'group' ? 'top' : over.kind === 'groupBody' ? `g:${over.id}` : containerOf(to)
  const sameContainer = fromContainer === toContainer
  if (phase === 'over' && sameContainer) return null
  const fromIndex = from.member === -1 ? from.top : from.member
  // A **group** is only ever moving at the top level, so its target's *top-level* slot is what the
  // down-lands-after rule compares against — a hovered member's index within its group is a
  // different number space entirely, and reading it there made a group dropped on a lower group's
  // first member land above that group instead of below it.
  const toIndex = active.kind === 'group' ? to.top : to.member === -1 ? to.top : to.member
  // A template dropped on a group's **body** appends and never reads `after`, so the comparison is
  // dead for that case — but it would be *filter-sensitive* dead math if it ever woke up, because
  // `toIndex` is then a top-level index while `fromIndex` is a member index, and the filter moves
  // the former. Disarm it here rather than leave the trap for whoever teaches the body arm to
  // honour a position. (A dragged **group** over a body is not this case: it moves at the top
  // level, so `to.top` is the right number space and `after` genuinely applies.)
  const intoBody = active.kind === 'template' && over.kind === 'groupBody'
  const movingDown = sameContainer && !intoBody && fromIndex < toIndex

  // Lift the active thing out, remembering what it was.
  const next: LayoutEntry[] = layout.map((entry) =>
    entry.kind === 'group' ? { ...entry, templates: [...entry.templates] } : entry,
  )
  let moving: LayoutEntry
  if (from.member === -1) {
    ;[moving] = next.splice(from.top, 1)
  } else {
    const host = next[from.top] as Extract<LayoutEntry, { kind: 'group' }>
    const [template] = host.templates.splice(from.member, 1)
    moving = { kind: 'template', template }
  }

  // Re-locate the target after the lift: indices may have shifted by one.
  const relocated = findIn(next, over.kind === 'groupBody' ? 'group' : over.kind, over.id)
  if (!relocated) return null
  const after = movingDown ? 1 : 0

  const intoGroup = (groupIndex: number, memberIndex: number | null): MoveResult => {
    const host = next[groupIndex] as Extract<LayoutEntry, { kind: 'group' }>
    const template = (moving as Extract<LayoutEntry, { kind: 'template' }>).template
    const hostFamily = groupFamilyOf(host)
    if (hostFamily != null && template.family != null && hostFamily !== template.family) {
      return { layout: [...layout], refused: 'family' }
    }
    host.templates.splice(memberIndex == null ? host.templates.length : memberIndex + after, 0, template)
    return { layout: next }
  }

  if (active.kind === 'group') {
    // A group never nests: over a member or a body means over that group's top-level slot.
    next.splice(relocated.top + after, 0, moving)
    return { layout: next }
  }

  // A template.
  if (over.kind === 'groupBody') return intoGroup(relocated.top, null)
  if (relocated.member !== -1) return intoGroup(relocated.top, relocated.member)
  next.splice(relocated.top + after, 0, moving)
  return { layout: next }
}

function findIn(
  layout: readonly LayoutEntry[],
  kind: 'template' | 'group',
  id: number,
): { top: number; member: number } | null {
  for (let top = 0; top < layout.length; top++) {
    const entry = layout[top]
    if (kind === 'group') {
      if (entry.kind === 'group' && entry.group.id === id) return { top, member: -1 }
      continue
    }
    if (entry.kind === 'template' && entry.template.id === id) return { top, member: -1 }
    if (entry.kind === 'group') {
      const member = entry.templates.findIndex((t) => t.id === id)
      if (member !== -1) return { top, member }
    }
  }
  return null
}
