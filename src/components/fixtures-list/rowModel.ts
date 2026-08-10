import { resolveCell } from './columns'
import { filterTerms, fixtureMatchesTerms } from '../../lib/fixtureSearch'
import type { CellResolution, ColumnKey } from './columns'
import type { Fixture } from '../../store/fixtures'
import type { GroupSummary } from '../../api/groupsApi'

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
}

export type DividerRow = {
  kind: 'divider'
  id: RowId
  label: string
}

export type Row = GroupRow | FixtureRow | DividerRow

export interface BuildRowsOptions {
  fixtures: Fixture[]
  groups: GroupSummary[]
  expandedGroups: ReadonlySet<string>
  textFilter: string
  /** Fixture keys currently lit (dimmer > 0). `undefined` = filter off. */
  litFixtureKeys?: ReadonlySet<string>
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
  const { fixtures, groups, expandedGroups, textFilter, litFixtureKeys } = opts
  const terms = filterTerms(textFilter)

  const visible = (fixture: Fixture): boolean => {
    if (!fixtureMatchesTerms(fixture, terms)) return false
    if (litFixtureKeys && !litFixtureKeys.has(fixture.key)) return false
    return true
  }

  const membersByGroup = new Map<string, Fixture[]>()
  for (const fixture of fixtures) {
    for (const groupName of fixture.groups) {
      const list = membersByGroup.get(groupName)
      if (list) list.push(fixture)
      else membersByGroup.set(groupName, [fixture])
    }
  }

  const rows: Row[] = []

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
        rows.push({
          kind: 'fixture',
          id: memberRowId(group.name, member.key),
          fixture: member,
          parentGroup: group.name,
        })
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
      rows.push({ kind: 'fixture', id: fixtureRowId(fixture.key), fixture })
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
 * Expand a selection to the distinct fixtures it covers, in visible row order:
 * group rows contribute their members (fixture-list order), fixture/member
 * rows contribute their fixture. Deduped by fixture key, so a fixture selected
 * both directly and via its group is written once.
 */
export function expandSelectionToFixtures(
  rows: readonly Row[],
  selectedIds: ReadonlySet<RowId>,
): Fixture[] {
  const seen = new Set<string>()
  const out: Fixture[] = []
  const add = (fixture: Fixture) => {
    if (seen.has(fixture.key)) return
    seen.add(fixture.key)
    out.push(fixture)
  }
  for (const row of rows) {
    if (!selectedIds.has(row.id)) continue
    if (row.kind === 'group') row.members.forEach(add)
    else if (row.kind === 'fixture') add(row.fixture)
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
  fixture: Fixture
  resolution: NonNullable<CellResolution>
  /** The commit clamped to THIS fixture's descriptor ranges. */
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

/**
 * The single code path behind group-row edit, multi-select batch apply, and
 * single-row edit (n = 1): which fixtures actually take this commit on this
 * column, with their resolved descriptors and the commit clamped to each
 * fixture's own ranges. Fixtures without the property, or whose property
 * can't take the commit's shape, are skipped.
 */
export function planBatchWrites(
  fixtures: readonly Fixture[],
  col: ColumnKey,
  commit: CellCommit,
): PlannedWrite[] {
  const out: PlannedWrite[] = []
  for (const fixture of fixtures) {
    const resolution = resolveCell(fixture.properties, col)
    if (!commitMatchesResolution(commit, resolution)) continue
    out.push({
      fixture,
      resolution: resolution!,
      commit: clampCommitToResolution(commit, resolution!),
    })
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
