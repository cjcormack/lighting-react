import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Lightbulb, Loader2, Search } from 'lucide-react'
import { Breadcrumbs } from '../components/Breadcrumbs'
import {
  FIXTURES_VIEW_KEY,
  FixturesViewSwitcher,
  setStoredCardsListView,
} from '../components/ViewSwitcher'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { useFixtureListQuery } from '../store/fixtures'
import { useGroupListQuery } from '../store/groups'
import { usePersistentState } from '../hooks/usePersistentState'
import { useCellSelection } from '../components/fixtures-list/useCellSelection'
import type { CellRef } from '../components/fixtures-list/cellSelectionModel'
import {
  ColumnsMenu,
  useColumnVisibility,
  visibleColumnsFrom,
  type ColumnVisibility,
} from '../components/fixtures-list/ColumnsMenu'
import {
  buildRows,
  coveredFixtureKeys,
  expandSelectionToTargets,
  fixtureRowId,
  groupRowId,
  memberRowId,
  parseSelectParam,
  planBatchWrites,
  resolveTargetCells,
  rowLocateTarget,
  rowWriteTargets,
} from '../components/fixtures-list/rowModel'
import { isEditableTarget } from '../lib/domUtils'
import { useIncludeSelectionRequest } from '../store/includeSelection'
import {
  listSelectionIntentFor,
  useListSelection,
  usePublishSelectionTargets,
} from '../components/fixtures-list/useListSelection'
import type { SelectionScope } from '../store/selectionSlice'
import { applyPlannedWrite, useCellWriters } from '../components/fixtures-list/useCellWriters'
import { useLitFixtureKeys } from '../components/fixtures-list/useLitFixtureKeys'
import { FixturesTable } from '../components/fixtures-list/FixturesTable'
import { SelectionToolbar } from '../components/fixtures-list/SelectionToolbar'
import { FixtureDetailModal } from '../components/groups/FixtureDetailModal'
import { GroupDetailModal } from '../components/fixtures/GroupDetailModal'
import type { ColumnKey } from '../components/fixtures-list/columns'
import type {
  CellCommit,
  FixtureRow,
  GroupRow,
  InfoRow,
  Row,
  RowId,
} from '../components/fixtures-list/rowModel'
import type { LocateTarget } from '../store/locate'
import type { Fixture } from '../store/fixtures'
import type { GroupSummary } from '../api/groupsApi'

// Redirect component for the bare /fixtures/list route
export function FixturesListRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (!isLoading && currentProject) {
      const query = searchParams.toString()
      navigate(`/projects/${currentProject.id}/fixtures/list${query ? `?${query}` : ''}`, {
        replace: true,
      })
    }
  }, [currentProject, isLoading, navigate, searchParams])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return null
}

export function ProjectFixturesList() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { search } = useLocation()
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)

  // Record this as the last-used fixtures view even when arriving via a
  // deep link (Cmd+K ?select=) rather than the switcher, so the sidebar's
  // "Fixtures" entry keeps landing here.
  useEffect(() => {
    setStoredCardsListView(FIXTURES_VIEW_KEY, 'list')
  }, [])

  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    // Carry ?select= across, matching FixturesListRedirect — a shared link's
    // deep-link target shouldn't be dropped just because the project id in
    // the URL wasn't the active one.
    return <Navigate to={`/projects/${currentProject.id}/fixtures/list${search}`} replace />
  }

  if (projectLoading || currentLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!project) {
    return (
      <Card className="m-4 p-4">
        <p className="text-destructive">Project not found</p>
      </Card>
    )
  }

  return (
    <Card className={LIST_PAGE_CARD_CLASS}>
      {/* `@container` — see ViewSwitcher's LABEL_AT_* constants. */}
      <div className="@container mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs projectName={project.name} currentPage="Fixtures" />
        <FixturesViewSwitcher current="list" projectId={projectIdNum} />
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <FixturesListContainer grouped={false} selectionScope="fixtures" />
      </Suspense>
    </Card>
  )
}

/**
 * Page chrome for the spreadsheet routes. Tighter than the card views' `m-4 p-4` at phone
 * widths: margin + padding cost 64px of a 375px viewport before a single column renders,
 * and the table is the content — losing a sixth of the screen to a frame around it is the
 * wrong trade. Shared so the three list routes can't drift apart.
 */
export const LIST_PAGE_CARD_CLASS = 'm-2 p-2 sm:m-4 sm:p-4'

const EMPTY_FIXTURES: Fixture[] = []
const EMPTY_GROUPS: GroupSummary[] = []

export interface FixturesListContainerProps {
  /** Group rows + members + "Ungrouped" (true), or a flat fixture list (false). */
  grouped: boolean
  /**
   * Which list's selection this is, in `store/selectionSlice`.
   *
   * Required rather than defaulted: the three lists must not share a selection (their row ids
   * collide without meaning the same rows), and a wrong default would be invisible until two of
   * them were mounted at once.
   */
  selectionScope: SelectionScope
  /** Colour cells by owning layer and show blind-staged values — the programmer sheet. */
  showOwnership?: boolean
  /**
   * Consume the `?select=` deep-link param. Off for the programmer sheet: those links are
   * minted by Cmd+K for the fixtures/groups pair, and the forwarding branch here would bounce
   * a group select out of the programmer and onto /groups/list.
   */
  enableDeepLinkSelect?: boolean
  /**
   * React to Include by selecting the fixtures it pulled in ("Select Heads on Include").
   * Opt-in so the plain Fixtures and Groups lists don't have their selection yanked by a
   * programmer action happening elsewhere.
   */
  respondToIncludeSelection?: boolean
  /**
   * Replace the built-in toolbar row, receiving the controls this container owns as ready-made
   * nodes so a caller can re-arrange them without re-implementing their state.
   *
   * Exists because the programmer view scatters them: Columns joins the action bar's Sheet zone,
   * the filter sits above the grid, and the selection actions get a bar of their own. Absent — the
   * two plain list routes — keeps today's single row exactly.
   */
  /** Take ownership of the column menu's state — see `useColumnVisibility`. Pass both or neither. */
  columnVisibility?: ColumnVisibility
  onColumnVisibilityChange?: (next: ColumnVisibility) => void
  renderToolbar?: (parts: {
    filter: React.ReactNode
    lit: React.ReactNode
    columns: React.ReactNode
    /** Null when nothing *visible* is selected; the caller should render nothing rather than a shell. */
    selection: React.ReactNode | null
    /** The marquee's cells, for a scope label beside the fixture count. Empty when none. */
    cells: readonly CellRef[]
  }) => React.ReactNode
  /**
   * Let the table fill its flex parent instead of capping at `calc(100vh - 14rem)`.
   *
   * That cap is tuned for a list embedded in a scrolling page. The programmer is a full-height
   * view whose grid owns the remaining space, and the cap there leaves dead air below the rows.
   */
  fill?: boolean
}

/**
 * The spreadsheet view shared by Fixtures → List (flat, `grouped: false`),
 * Groups → List (group rows + members + Ungrouped, `grouped: true`), and the
 * programmer sheet (`showOwnership`, either grouping).
 */
export function FixturesListContainer({
  grouped,
  selectionScope,
  showOwnership = false,
  enableDeepLinkSelect = true,
  respondToIncludeSelection = false,
  columnVisibility: controlledColumnVisibility,
  onColumnVisibilityChange,
  renderToolbar,
  fill = false,
}: FixturesListContainerProps) {
  const { data: maybeFixtures, isLoading: fixturesLoading } = useFixtureListQuery()
  const { data: maybeGroups, isLoading: groupsLoading } = useGroupListQuery()
  const [searchParams, setSearchParams] = useSearchParams()
  const { projectId } = useParams()
  const navigate = useNavigate()

  // Module-level constants keep the fallback identity stable across renders.
  const fixtures = maybeFixtures ?? EMPTY_FIXTURES
  const groups = maybeGroups ?? EMPTY_GROUPS

  const [filter, setFilter] = useState('')
  const [onlyLit, setOnlyLit] = usePersistentState('fixturesList.onlyLit', false)
  // Controlled when the caller owns the menu (the programmer renders it in a band above this
  // component); otherwise this owns both, and the two paths share one persisted key either way.
  const ownColumns = useColumnVisibility()
  const columnVisibility = controlledColumnVisibility ?? ownColumns[0]
  const setColumnVisibility = onColumnVisibilityChange ?? ownColumns[1]
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set<string>())
  const [expandedFixtures, setExpandedFixtures] = useState<ReadonlySet<string>>(new Set<string>())
  const [scrollToRowId, setScrollToRowId] = useState<RowId | null>(null)
  const [infoFixtureKey, setInfoFixtureKey] = useState<string | null>(null)
  const [infoGroupName, setInfoGroupName] = useState<string | null>(null)

  const visibleColumns = useMemo(
    () => visibleColumnsFrom(columnVisibility),
    [columnVisibility],
  )

  const litFixtureKeys = useLitFixtureKeys(onlyLit ? fixtures : EMPTY_FIXTURES)

  const rows = useMemo(
    () =>
      buildRows({
        fixtures,
        groups,
        expandedGroups,
        expandedFixtures,
        textFilter: filter,
        litFixtureKeys: onlyLit ? litFixtureKeys : undefined,
        groupByGroups: grouped,
      }),
    [fixtures, groups, expandedGroups, expandedFixtures, filter, onlyLit, litFixtureKeys, grouped],
  )

  // Dividers aren't selectable — they're excluded from the selection order so
  // shift-ranges and select-all never touch them.
  const selectableOrder = useMemo(
    () => rows.filter((row) => row.kind !== 'divider').map((row) => row.id),
    [rows],
  )
  const selection = useListSelection(selectableOrder, selectionScope)
  // Cell selection is a transient EDIT SCOPE and is orthogonal to fixture selection, which keeps
  // its checkboxes and keeps driving Record. Enabled only where a scope narrower than a row means
  // something — the programmer.
  const visibleRowIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows])
  const cellSelection = useCellSelection(visibleRowIds)
  const { count: cellCount, clear: clearCells } = cellSelection

  // Selected ids whose rows are hidden (collapsed group, active filter) are
  // inert everywhere below — every consumer intersects with `rows` — so no
  // aggressive reconcile is needed when visibility changes.
  const selectedTargets = useMemo(
    () => expandSelectionToTargets(rows, selection.selectedIds),
    [rows, selection.selectedIds],
  )

  // Publish the expansion for consumers outside this container — RecordSheet's "selected
  // fixtures only". They can't derive it themselves: it needs `rows`, which needs this
  // component's filter, group-expansion and rollup state.
  const selectedTargetKeys = useMemo(
    () => selectedTargets.map((target) => target.key),
    [selectedTargets],
  )
  usePublishSelectionTargets(selectionScope, selectedTargetKeys)

  const locateTargets = useMemo<LocateTarget[]>(() => {
    // Deduped by (type, key): a fixture selected via two group memberships
    // must toggle locate once, not twice (two toggles cancel out). Element
    // rows under a covered parent are dropped for the same reason — locating
    // a parent resolves every element, so both together would double-toggle.
    const covered = coveredFixtureKeys(rows, selection.selectedIds)
    const seen = new Set<string>()
    const targets: LocateTarget[] = []
    for (const row of rows) {
      if (!selection.selectedIds.has(row.id)) continue
      if (row.kind === 'element' && covered.has(row.fixture.key)) continue
      const target = rowLocateTarget(row)
      if (!target) continue
      const dedupeKey = `${target.type}:${target.key}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      targets.push(target)
    }
    return targets
  }, [rows, selection.selectedIds])

  const writers = useCellWriters()

  const handleRowClick = useCallback(
    (id: RowId, e: React.MouseEvent, viaCheckbox = false) => {
      const intent = listSelectionIntentFor(e)
      // A plain checkbox click means toggle — checkboxes accumulate, they
      // don't replace. Modifier clicks keep their usual meaning.
      selection.select(id, viaCheckbox && intent === 'replace' ? 'toggle' : intent)
    },
    [selection],
  )

  // Element rows open the PARENT fixture's sheet — FixtureDetailModal resolves
  // by fixture-list key, and element keys aren't in that list.
  const handleShowInfo = useCallback((row: InfoRow) => {
    if (row.kind === 'group') setInfoGroupName(row.name)
    else setInfoFixtureKey(row.fixture.key)
  }, [])

  const handleToggleExpand = useCallback((row: GroupRow | FixtureRow) => {
    const toggled = (prev: ReadonlySet<string>, key: string): ReadonlySet<string> => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    }
    if (row.kind === 'group') setExpandedGroups((prev) => toggled(prev, row.name))
    else setExpandedFixtures((prev) => toggled(prev, row.fixture.key))
  }, [])

  // Opening an editor on an unselected row targets just that row (and the selection follows,
  // standard spreadsheet feel); on a selected row the whole selection is the target.
  const handleBeginCellEdit = useCallback(
    (row: Row, col: ColumnKey) => {
      // A cell inside the marquee is the WHOLE marquee's editor, so neither selection moves.
      // Without this, clicking one of your own selected cells would collapse the row selection to
      // that single row and the commit would write only it — silently discarding the marquee.
      if (cellSelection.isSelected(row.id, col)) return
      // A click outside it abandons the marquee, the way a click outside a spreadsheet range does,
      // and the row rule then applies unchanged.
      cellSelection.clear()
      if (row.kind !== 'divider' && !selection.isSelected(row.id)) {
        selection.select(row.id, 'replace')
      }
    },
    [cellSelection, selection],
  )

  const commitNow = useCallback(
    (row: Row, col: ColumnKey, commit: CellCommit) => {
      // Three scopes, most specific first. The marquee wins over the row selection because it is
      // the narrower, more deliberate statement of what this edit is for.
      if (cellSelection.isSelected(row.id, col)) {
        // Grouped BY COLUMN so each column is exactly one `planBatchWrites` call, keeping
        // `resolveTargetCells`' parent-first precedence and per-target clamping intact. A commit
        // whose shape doesn't fit a column (a colour dragged across Colour and Position) is
        // filtered out inside `planBatchWrites` — so the chip's cell count is an upper bound on
        // what any ONE commit writes, which the design's wording already allows for.
        for (const { col: c, rowIds } of cellSelection.byColumn()) {
          const targets = expandSelectionToTargets(rows, new Set(rowIds))
          for (const planned of planBatchWrites(targets, c, commit)) {
            applyPlannedWrite(writers, planned)
          }
        }
        return
      }
      const targets =
        row.kind !== 'divider' && selection.isSelected(row.id)
          ? selectedTargets
          : rowWriteTargets(row)
      // planBatchWrites clamps the commit to each target's own ranges.
      for (const planned of planBatchWrites(targets, col, commit)) {
        applyPlannedWrite(writers, planned)
      }
    },
    [cellSelection, rows, selectedTargets, selection, writers],
  )

  // Continuous drag commits (slider/colour/position editors fire per pointer
  // move) are throttled to ~30Hz with a trailing call, because each commit
  // fans out to one WebSocket frame per channel per selected fixture — a
  // select-all colour drag would otherwise emit thousands of frames a second.
  // A commit for a different cell flushes the pending one first so nothing is
  // ever dropped, and the timer flushes on unmount.
  const commitNowRef = useRef(commitNow)
  commitNowRef.current = commitNow
  const pendingCommitRef = useRef<{ row: Row; col: ColumnKey; commit: CellCommit } | null>(null)
  const commitTimerRef = useRef<number | null>(null)

  const flushPendingCommit = useCallback(function flushPendingCommit() {
    const pending = pendingCommitRef.current
    pendingCommitRef.current = null
    if (pending) {
      commitNowRef.current(pending.row, pending.col, pending.commit)
      commitTimerRef.current = window.setTimeout(flushPendingCommit, 33)
    } else {
      commitTimerRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      if (commitTimerRef.current != null) {
        window.clearTimeout(commitTimerRef.current)
        commitTimerRef.current = null
      }
      const pending = pendingCommitRef.current
      pendingCommitRef.current = null
      if (pending) commitNowRef.current(pending.row, pending.col, pending.commit)
    },
    [],
  )

  const handleCellCommit = useCallback(
    (row: Row, col: ColumnKey, commit: CellCommit) => {
      const pending = pendingCommitRef.current
      if (pending && (pending.row.id !== row.id || pending.col !== col)) {
        pendingCommitRef.current = null
        commitNowRef.current(pending.row, pending.col, pending.commit)
      }
      if (commitTimerRef.current == null) {
        commitNowRef.current(row, col, commit)
        commitTimerRef.current = window.setTimeout(flushPendingCommit, 33)
      } else {
        // Position commits are per-axis; merge so a pan tick doesn't discard
        // a pending tilt tick (or vice versa) within the same window.
        const prev = pendingCommitRef.current
        if (prev && prev.commit.kind === 'position' && commit.kind === 'position') {
          commit = {
            kind: 'position',
            pan: commit.pan ?? prev.commit.pan,
            tilt: commit.tilt ?? prev.commit.tilt,
          }
        }
        pendingCommitRef.current = { row, col, commit }
      }
    },
    [flushPendingCommit],
  )

  // Counts write RESOLUTIONS for the column, not rows — a collapsed 12-head
  // bar's colour cell must warn "Applying to 12", matching what
  // planBatchWrites will actually expand the commit into.
  const batchCountFor = useCallback(
    (row: Row, col: ColumnKey): number => {
      if (row.kind === 'divider') return 0
      // The marquee has to be counted, or the popover says "Applying to 1" while the commit writes
      // six hundred. An upper bound: cross-column commits are shape-filtered at write time, so a
      // colour edit over a Colour+Position marquee reaches fewer than this says.
      if (cellSelection.isSelected(row.id, col)) {
        return cellSelection.byColumn().reduce((n, group) => {
          const targets = expandSelectionToTargets(rows, new Set(group.rowIds))
          return n + targets.reduce((m, t) => m + resolveTargetCells(t, group.col).length, 0)
        }, 0)
      }
      const targets =
        selection.isSelected(row.id) ? selectedTargets : rowWriteTargets(row)
      return targets.reduce((n, target) => n + resolveTargetCells(target, col).length, 0)
    },
    [cellSelection, rows, selection, selectedTargets],
  )

  // ?select=fixture:<key> / ?select=group:<name> deep-link (Cmd+K lands here):
  // select the row, expand its group if needed, scroll it into view, then
  // consume the param so a refresh doesn't re-pin. Waits for BOTH queries (a
  // group link must not be judged against a groups list that hasn't loaded),
  // and clears the filters — including the persisted Lit toggle — because
  // "navigate to this fixture" must show the fixture, not silently lose it to
  // a filter left on last session.
  const selectParam = searchParams.get('select')
  useEffect(() => {
    if (!enableDeepLinkSelect) return
    if (!selectParam || fixturesLoading || groupsLoading) return
    const parsed = parseSelectParam(selectParam)
    // Group rows only exist on the grouped list. Links minted before the
    // fixtures/groups list split pointed group selects at /fixtures/list, so
    // forward them to /groups/list instead of silently consuming the param.
    if (parsed?.kind === 'group' && !grouped) {
      navigate(`/projects/${projectId}/groups/list?select=${encodeURIComponent(selectParam)}`, {
        replace: true,
      })
      return
    }
    let rowId: RowId | null = null
    if (parsed?.kind === 'group' && groups.some((g) => g.name === parsed.key)) {
      rowId = groupRowId(parsed.key)
    } else if (parsed?.kind === 'fixture') {
      const fixture = fixtures.find((f) => f.key === parsed.key)
      if (fixture) {
        // Flat mode has no member rows — the fixture's own row is the target.
        const parentGroup = grouped
          ? fixture.groups.find((name) => groups.some((g) => g.name === name))
          : undefined
        if (parentGroup) {
          setExpandedGroups((prev) => new Set(prev).add(parentGroup))
          rowId = memberRowId(parentGroup, parsed.key)
        } else {
          rowId = fixtureRowId(parsed.key)
        }
      }
    }
    if (rowId) {
      setFilter('')
      setOnlyLit(false)
      selection.select(rowId, 'replace')
      setScrollToRowId(rowId)
    }
    setSearchParams(
      (prev) => {
        prev.delete('select')
        return prev
      },
      { replace: true },
    )
    // selection.select is referentially stable (a useCallback over dispatch and the scope,
    // both fixed for the mount); setOnlyLit/setSearchParams are stable setters;
    // navigate/projectId only feed the group-forwarding branch, which leaves
    // this route anyway; groups/fixtures/loading flags/grouped cover
    // everything else read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectParam,
    fixtures,
    groups,
    fixturesLoading,
    groupsLoading,
    grouped,
    enableDeepLinkSelect,
    setSearchParams,
  ])

  // "Select Heads on Include": pick up the fixtures the last Include pulled in. Keyed on the
  // request's nonce, not its contents — including the same cue twice must re-select, since the
  // operator may have changed the selection in between.
  const includeSelection = useIncludeSelectionRequest()
  const includeNonce = respondToIncludeSelection ? includeSelection.nonce : 0
  // Each nonce is applied at most once. The effect also depends on `fixtures`/`groups`/
  // `grouped` — it has to, to map keys onto row ids — and any of those can change long after
  // the Include: a background fixture-list refetch, or the operator hitting the Groups toggle.
  // Without this guard that would silently re-apply the old Include's selection over whatever
  // they had since selected, and reset their filter and scroll position with it.
  const appliedIncludeNonceRef = useRef(0)
  useEffect(() => {
    if (includeNonce === 0 || appliedIncludeNonceRef.current === includeNonce) return
    const { fixtureKeys, groupKeys } = includeSelection
    // Prefer the group row when the sheet is in rollup mode and the whole group came in —
    // that is the shape the operator was working in, and it keeps the row count readable.
    const wanted: RowId[] = []
    if (grouped) {
      const groupSet = new Set(groupKeys)
      for (const name of groupKeys) {
        if (groups.some((g) => g.name === name)) wanted.push(groupRowId(name))
      }
      for (const key of fixtureKeys) {
        const fixture = fixtures.find((f) => f.key === key)
        if (!fixture) continue
        const parent = fixture.groups.find((name) => groups.some((g) => g.name === name))
        // Skip members already covered by a selected group row.
        if (parent && groupSet.has(parent)) continue
        if (parent) {
          setExpandedGroups((prev) => (prev.has(parent) ? prev : new Set(prev).add(parent)))
          wanted.push(memberRowId(parent, key))
        } else {
          wanted.push(fixtureRowId(key))
        }
      }
    } else {
      for (const key of fixtureKeys) {
        if (fixtures.some((f) => f.key === key)) wanted.push(fixtureRowId(key))
      }
    }
    // Nothing resolved — the fixtures may still be loading, so leave the nonce unapplied and
    // let the next run (when they arrive) do it.
    if (wanted.length === 0) return
    appliedIncludeNonceRef.current = includeNonce
    // A filter would hide most of what we just selected, and the operator did not ask for it.
    setFilter('')
    setOnlyLit(false)
    selection.setSelection(wanted)
    setScrollToRowId(wanted[0])
    // `includeSelection` is read fresh rather than depended on: its identity changes with every
    // publish, and the arrays inside it are the same data the nonce already tracks.
    // `selection.setSelection` and `setOnlyLit` are referentially stable (the former is a
    // useCallback over dispatch and the scope, both fixed for the mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeNonce, fixtures, groups, grouped])

  // View-level shortcuts: Escape clears, ⌘/Ctrl+A selects all visible rows,
  // ↑/↓ move the selection (Shift extends the range from the anchor). Guarded
  // so typing in inputs or interacting inside popovers/dialogs never triggers.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target instanceof Element ? e.target : null)) return
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]')) return

      if (e.key === 'Escape') {
        // Cells first, rows second. Spreadsheet convention, and it stops one keystroke destroying
        // two independent states — an operator dismissing a marquee rarely means "and deselect
        // every fixture too".
        if (cellCount > 0) clearCells()
        else selection.clear()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        selection.selectAll()
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (selectableOrder.length === 0) return
        e.preventDefault()
        const anchorIdx = selection.anchor ? selectableOrder.indexOf(selection.anchor) : -1
        // Shift extends from the range's MOVING edge — the end that isn't the
        // anchor. Hardcoding the bottom of the selection here would cap
        // upward ranges at two rows (the bottom edge is the anchor when
        // extending up).
        let fromIdx = anchorIdx
        if (e.shiftKey && selection.orderedSelected.length > 0) {
          const firstIdx = selectableOrder.indexOf(selection.orderedSelected[0])
          const lastIdx = selectableOrder.indexOf(
            selection.orderedSelected[selection.orderedSelected.length - 1],
          )
          fromIdx = firstIdx < anchorIdx ? firstIdx : lastIdx
        }
        const delta = e.key === 'ArrowDown' ? 1 : -1
        const nextIdx =
          fromIdx === -1
            ? e.key === 'ArrowDown'
              ? 0
              : selectableOrder.length - 1
            : Math.max(0, Math.min(selectableOrder.length - 1, fromIdx + delta))
        selection.select(selectableOrder[nextIdx], e.shiftKey ? 'range' : 'replace')
        setScrollToRowId(selectableOrder[nextIdx])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // Narrowed to the two fields this reads rather than the whole `cellSelection`: its identity
    // changes with the selection, and re-binding a window listener on every marquee tick is a cost
    // with no payoff. `clearCells` is stable; `cellCount` is the only value that has to be fresh.
  }, [selection, selectableOrder, cellCount, clearCells])

  if (fixturesLoading || groupsLoading) {
    return <div>Loading...</div>
  }

  // The container owns these controls' state, so a caller re-arranging the toolbar gets them as
  // ready-made nodes rather than re-implementing them. See `renderToolbar`.
  const filterControl = (
    <div className="relative w-full min-w-48 sm:w-auto sm:flex-1">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Filter fixtures by name, manufacturer, or type..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-8 pl-9"
      />
    </div>
  )

  const litControl = (
    <Button
      variant={onlyLit ? 'default' : 'outline'}
      size="sm"
      onClick={() => setOnlyLit(!onlyLit)}
      title="Show only fixtures with intensity above zero"
    >
      <Lightbulb className="size-3.5" />
      {/* Icon-only on phones: the toolbar is already several rows deep there, and both of these
          carry a title/tooltip. */}
      <span className="hidden sm:inline">Lit</span>
    </Button>
  )

  const columnsControl = (
    <ColumnsMenu visibility={columnVisibility} onChange={setColumnVisibility} />
  )

  // Gate on VISIBLE selected rows, not the raw selection count — filtering away every selected row
  // must not leave a live toolbar acting on an empty set.
  const selectionControl =
    locateTargets.length > 0 ? (
      <SelectionToolbar
        locateTargets={locateTargets}
        targets={selectedTargets}
        onClear={selection.clear}
      />
    ) : null

  return (
    <div className={cn('space-y-3', fill && 'flex min-h-0 flex-1 flex-col')}>
      {renderToolbar ? (
        renderToolbar({
          filter: filterControl,
          lit: litControl,
          columns: columnsControl,
          selection: selectionControl,
          cells: cellSelection.cells,
        })
      ) : (
        /* Default toolbar. At phone widths the filter takes a full row of its own — sharing one
           with the buttons squeezes it to a few characters, and it is the control most likely to
           be reached for on a small screen. */
        <div className="flex flex-wrap items-center gap-2">
          {filterControl}
          {litControl}
          {columnsControl}
          {selectionControl}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {fixtures.length === 0
            ? 'No fixtures available'
            : onlyLit && !filter.trim()
              ? 'No fixtures are currently lit'
              : 'No fixtures match your filter'}
        </p>
      ) : (
        <FixturesTable
          rows={rows}
          visibleColumns={visibleColumns}
          isSelected={selection.isSelected}
          onRowClick={handleRowClick}
          onToggleExpand={handleToggleExpand}
          onBeginCellEdit={handleBeginCellEdit}
          onCellCommit={handleCellCommit}
          batchCountFor={batchCountFor}
          onShowInfo={handleShowInfo}
          scrollToRowId={scrollToRowId}
          onScrolledToRow={() => setScrollToRowId(null)}
          showOwnership={showOwnership}
          fill={fill}
          cellSelection={showOwnership ? cellSelection : undefined}
        />
      )}

      <FixtureDetailModal fixtureKey={infoFixtureKey} onClose={() => setInfoFixtureKey(null)} />
      <GroupDetailModal groupName={infoGroupName} onClose={() => setInfoGroupName(null)} />
    </div>
  )
}
