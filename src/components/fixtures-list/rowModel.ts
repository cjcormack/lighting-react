import { resolveCell } from './columns'
import { filterTerms, fixtureMatchesTerms } from '../../lib/fixtureSearch'
import type { CellResolution, ColumnKey } from './columns'
import type { ElementDescriptor, Fixture, PropertyDescriptor } from '../../store/fixtures'
import type { GroupSummary } from '../../api/groupsApi'
import type { LocateTarget } from '../../store/locate'

/**
 * Stable row identity: `group:` and `fixture:` rows are top-level; `member:`
 * rows are a fixture rendered *inside* an expanded group, prefixed with the
 * group name so a fixture in two groups yields two distinct row ids.
 */
export type RowId = string

export function groupRowId(name: string): RowId {
  return `group:${name}`
}
export function fixtureRowId(key: string): RowId {
  return `fixture:${key}`
}
export function memberRowId(group: string, key: string): RowId {
  return `member:${group}:${key}`
}
/** Element sub-row id, scoped by the PARENT ROW id (not just the fixture key)
 *  so a fixture expanded under two groups yields distinct element row ids.
 *  Ids are only ever compared, never parsed, so the embedded colons are fine. */
export function elementRowId(parentRowId: RowId, elementKey: string): RowId {
  return `element:${parentRowId}:${elementKey}`
}

export type GroupRow = {
  kind: 'group'
  id: RowId
  name: string
  /** Member fixtures that survive the active filters, in fixture-list order.
   *  Deliberately NOT the full membership: everything driven from a group row
   *  (aggregate cells, batch edits, the count badge) must only touch fixtures
   *  the operator can see — editing a group row while a filter is active must
   *  not write DMX to hidden fixtures. */
  members: Fixture[]
  isExpanded: boolean
}

export type FixtureRow = {
  kind: 'fixture'
  id: RowId
  fixture: Fixture
  /** Set on member rows (rendered indented under their group). */
  parentGroup?: string
  /** True when this fixture's element sub-rows are rendered beneath it.
   *  Always false for fixtures without elements. */
  isExpanded: boolean
}

export type ElementRow = {
  kind: 'element'
  id: RowId
  /** The owning multi-head fixture — carried explicitly; element keys are
   *  NEVER parsed (`.pixel-N` vs `.element-N` formats vary by fixture type). */
  fixture: Fixture
  element: ElementDescriptor
  /** Copied from the parent fixture row (set when rendered inside a group). */
  parentGroup?: string
}

export type DividerRow = {
  kind: 'divider'
  id: RowId
  label: string
}

export type Row = GroupRow | FixtureRow | ElementRow | DividerRow

/** Rows that can open a detail sheet (everything except dividers). */
export type InfoRow = GroupRow | FixtureRow | ElementRow

export interface BuildRowsOptions {
  fixtures: Fixture[]
  groups: GroupSummary[]
  expandedGroups: ReadonlySet<string>
  /** Fixture KEYS whose element sub-rows are expanded. Keyed by key, not row
   *  id: expanding a fixture expands every instance across groups, matching
   *  the group-name keying of `expandedGroups`. Omitted = none expanded. */
  expandedFixtures?: ReadonlySet<string>
  textFilter: string
  /** Fixture keys currently lit (dimmer > 0). `undefined` = filter off. */
  litFixtureKeys?: ReadonlySet<string>
  /** When false, emit a flat fixture list in fixture-list order — no group or
   *  member rows, no Ungrouped divider. Multi-head element expansion still
   *  applies. Default true. */
  groupByGroups?: boolean
}

/**
 * Flatten fixtures + groups into the visible row list.
 *
 * Order: groups in backend list order (each followed by its member rows when
 * expanded), then an "Ungrouped" divider and every fixture that belongs to no
 * group. Membership comes from `fixture.groups` — no per-group properties
 * fetch. A group survives the filters if any member does; when expanded, only
 * surviving members are shown.
 */
export function buildRows(opts: BuildRowsOptions): Row[] {
  const { fixtures, groups, expandedGroups, expandedFixtures, textFilter, litFixtureKeys } = opts
  const terms = filterTerms(textFilter)

  const visible = (fixture: Fixture): boolean => {
    if (!fixtureMatchesTerms(fixture, terms)) return false
    if (litFixtureKeys && !litFixtureKeys.has(fixture.key)) return false
    return true
  }

  const rows: Row[] = []

  // Fixture rows and (when expanded) their element sub-rows share one shape
  // whether the fixture renders top-level or as a group member. Element rows
  // are not individually filtered — they render only under a visible,
  // expanded parent.
  const pushFixtureRows = (fixture: Fixture, id: RowId, parentGroup?: string) => {
    const elements = fixture.elements ?? []
    const isExpanded = elements.length > 0 && (expandedFixtures?.has(fixture.key) ?? false)
    rows.push({ kind: 'fixture', id, fixture, parentGroup, isExpanded })
    if (isExpanded) {
      for (const element of elements) {
        rows.push({
          kind: 'element',
          id: elementRowId(id, element.key),
          fixture,
          element,
          parentGroup,
        })
      }
    }
  }

  if (opts.groupByGroups === false) {
    for (const fixture of fixtures) {
      if (visible(fixture)) pushFixtureRows(fixture, fixtureRowId(fixture.key))
    }
    return rows
  }

  const membersByGroup = new Map<string, Fixture[]>()
  for (const fixture of fixtures) {
    for (const groupName of fixture.groups) {
      const list = membersByGroup.get(groupName)
      if (list) list.push(fixture)
      else membersByGroup.set(groupName, [fixture])
    }
  }

  for (const group of groups) {
    const members = membersByGroup.get(group.name) ?? []
    const visibleMembers = members.filter(visible)
    // A group is hidden only when filters excluded all its members; a group
    // that is genuinely empty still gets a row (it exists, and deep-links can
    // point at it).
    if (members.length > 0 && visibleMembers.length === 0) continue
    const isExpanded = expandedGroups.has(group.name)
    rows.push({
      kind: 'group',
      id: groupRowId(group.name),
      name: group.name,
      members: visibleMembers,
      isExpanded,
    })
    if (isExpanded) {
      for (const member of visibleMembers) {
        pushFixtureRows(member, memberRowId(group.name, member.key), group.name)
      }
    }
  }

  // "Ungrouped" means no *rendered* group claims the fixture — not
  // `fixture.groups.length === 0`. If the groups query fails (or membership
  // names a group missing from the list), the fixture must still appear here
  // rather than vanish from the table entirely.
  const knownGroups = new Set(groups.map((g) => g.name))
  const ungrouped = fixtures.filter(
    (f) => !f.groups.some((name) => knownGroups.has(name)) && visible(f),
  )
  if (ungrouped.length > 0) {
    if (rows.length > 0) {
      rows.push({ kind: 'divider', id: 'divider:ungrouped', label: 'Ungrouped' })
    }
    for (const fixture of ungrouped) {
      pushFixtureRows(fixture, fixtureRowId(fixture.key))
    }
  }

  return rows
}

// === Batch apply ===

export type CellCommit =
  | { kind: 'slider'; value: number }
  | { kind: 'colour'; r: number; g: number; b: number; w?: number; a?: number; uv?: number }
  /** Position commits are per-axis: an omitted axis is left untouched, so a
   *  pan nudge on a batch selection doesn't overwrite every target's tilt
   *  with one row's aggregate. */
  | { kind: 'position'; pan?: number; tilt?: number }
  | { kind: 'setting'; level: number }

/**
 * Anything a batch write can address: a whole fixture, or one element of a
 * multi-head fixture. `Fixture` and `ElementDescriptor` are both structurally
 * assignable — no adapters at call sites. `key` is what cue-mode writes use
 * as their `targetKey` (element keys are valid there).
 */
export interface WriteTarget {
  key: string
  properties: PropertyDescriptor[]
  /** Present on fixture targets. When a column resolves to nothing against
   *  `properties`, planBatchWrites falls through to one write per element. */
  elements?: ElementDescriptor[]
}

/** The write targets a single row stands for: a group row its members, a
 *  fixture row its fixture, an element row its element. The one place row
 *  kind is mapped to targets — single-row edits, selection expansion, and
 *  cell display all go through it. */
export function rowWriteTargets(row: Row): WriteTarget[] {
  switch (row.kind) {
    case 'group':
      return row.members
    case 'fixture':
      return [row.fixture]
    case 'element':
      return [row.element]
    case 'divider':
      return []
  }
}

/** The locate target a row stands for (element rows locate their own element
 *  key — the backend resolves those). Shared by the toolbar's locate list and
 *  the per-row hover button so the two can never disagree. */
export function rowLocateTarget(row: Row): LocateTarget | null {
  switch (row.kind) {
    case 'group':
      return { type: 'group', key: row.name }
    case 'fixture':
      return { type: 'fixture', key: row.fixture.key }
    case 'element':
      return { type: 'fixture', key: row.element.key }
    case 'divider':
      return null
  }
}

/**
 * Fixture keys already covered at whole-fixture level by the selection: a
 * selected fixture/member row, or membership of a selected group row.
 * Element rows under a covered parent must be dropped by every selection-wide
 * action (writes, locate) regardless of row order — ⌘A selects parent and
 * children together, and acting on both double-writes or double-toggles.
 */
export function coveredFixtureKeys(
  rows: readonly Row[],
  selectedIds: ReadonlySet<RowId>,
): Set<string> {
  const covered = new Set<string>()
  for (const row of rows) {
    if (!selectedIds.has(row.id)) continue
    if (row.kind === 'group') for (const member of row.members) covered.add(member.key)
    else if (row.kind === 'fixture') covered.add(row.fixture.key)
  }
  return covered
}

/**
 * Expand a selection to the distinct write targets it covers, in visible row
 * order: group rows contribute their members (fixture-list order),
 * fixture/member rows contribute their fixture, element rows contribute their
 * element. Deduped by key, and element rows whose parent fixture is already
 * covered are dropped (see coveredFixtureKeys).
 */
export function expandSelectionToTargets(
  rows: readonly Row[],
  selectedIds: ReadonlySet<RowId>,
): WriteTarget[] {
  const covered = coveredFixtureKeys(rows, selectedIds)
  const seen = new Set<string>()
  const out: WriteTarget[] = []
  for (const row of rows) {
    if (!selectedIds.has(row.id)) continue
    if (row.kind === 'element' && covered.has(row.fixture.key)) continue
    for (const target of rowWriteTargets(row)) {
      if (seen.has(target.key)) continue
      seen.add(target.key)
      out.push(target)
    }
  }
  return out
}

/** Does this commit make sense against this resolution? A colour commit can't
 *  drive a colour *wheel* (option levels, not RGB), and vice versa. */
export function commitMatchesResolution(
  commit: CellCommit,
  res: CellResolution,
): boolean {
  if (!res) return false
  switch (commit.kind) {
    case 'slider':
      return res.kind === 'slider'
    case 'colour':
      return res.kind === 'colour'
    case 'position':
      return res.kind === 'position'
    case 'setting':
      return res.kind === 'setting' || res.kind === 'colour-setting'
  }
}

export interface PlannedWrite {
  target: WriteTarget
  resolution: NonNullable<CellResolution>
  /** The commit clamped to THIS target's descriptor ranges. */
  commit: CellCommit
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

/**
 * Clamp a commit's values to one fixture's descriptor ranges. A batch commit
 * carries a single value picked against the edited row's ranges; each target
 * fixture may have a narrower (or wider) channel range — e.g. a 540° pan next
 * to a 255-step one — so the clamp has to happen per resolution, at the one
 * place that has the target descriptor in hand.
 */
export function clampCommitToResolution(
  commit: CellCommit,
  resolution: NonNullable<CellResolution>,
): CellCommit {
  if (commit.kind === 'slider' && resolution.kind === 'slider') {
    const { min, max } = resolution.property
    return { kind: 'slider', value: clamp(commit.value, min, max) }
  }
  if (commit.kind === 'position' && resolution.kind === 'position') {
    return {
      kind: 'position',
      pan: commit.pan === undefined ? undefined : clamp(commit.pan, resolution.panMin, resolution.panMax),
      tilt:
        commit.tilt === undefined ? undefined : clamp(commit.tilt, resolution.tiltMin, resolution.tiltMax),
    }
  }
  return commit
}

export interface TargetResolution {
  target: WriteTarget
  resolution: NonNullable<CellResolution>
}

/**
 * THE parent-first precedence rule, in one place: a target's own properties
 * claim the column outright when they resolve it (the backend's canonical
 * multi-head shape is a master dimmer/strobe on the parent with
 * colour/position on the heads); only when they resolve nothing do elements
 * contribute one resolution each, in element order. Cell display
 * (buildRowCells), batch writes (planBatchWrites), and Highlight's dimmer
 * lookup all go through this, so what a row shows is always what an edit
 * writes. Precedence keys on resolution nullness, never on commit shape — a
 * parent colour wheel claims the colour column even though a colour commit
 * against it is later skipped.
 */
export function resolveTargetCells(target: WriteTarget, col: ColumnKey): TargetResolution[] {
  const own = resolveCell(target.properties, col)
  if (own) return [{ target, resolution: own }]
  const out: TargetResolution[] = []
  for (const element of target.elements ?? []) {
    const resolution = resolveCell(element.properties, col)
    if (resolution) out.push({ target: element, resolution })
  }
  return out
}

/**
 * The single code path behind group-row edit, multi-select batch apply, and
 * single-row edit (n = 1): which targets actually take this commit on this
 * column, with their resolved descriptors and the commit clamped to each
 * target's own ranges. Targets without the property, or whose property can't
 * take the commit's shape, are skipped. Multi-head expansion and parent
 * precedence come from resolveTargetCells; element writes land inline at the
 * parent's position (the ordering Fan depends on).
 */
export function planBatchWrites(
  targets: readonly WriteTarget[],
  col: ColumnKey,
  commit: CellCommit,
): PlannedWrite[] {
  const out: PlannedWrite[] = []
  for (const outer of targets) {
    for (const { target, resolution } of resolveTargetCells(outer, col)) {
      if (!commitMatchesResolution(commit, resolution)) continue
      out.push({
        target,
        resolution,
        commit: clampCommitToResolution(commit, resolution),
      })
    }
  }
  return out
}

// === Deep-link select params ===
//
// The `?select=` search-param vocabulary is authored by the command palette
// and parsed by the Fixtures List route; both sides go through these helpers
// so the format lives in exactly one place.

export type SelectParam = { kind: 'fixture' | 'group'; key: string }

export function fixtureSelectParam(key: string): string {
  return `fixture:${key}`
}

export function groupSelectParam(name: string): string {
  return `group:${name}`
}

export function parseSelectParam(raw: string): SelectParam | null {
  const separator = raw.indexOf(':')
  if (separator === -1) return null
  const kind = raw.slice(0, separator)
  const key = raw.slice(separator + 1)
  if ((kind !== 'fixture' && kind !== 'group') || key === '') return null
  return { kind, key }
}
