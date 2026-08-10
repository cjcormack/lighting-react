import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Columns3, Lightbulb, Loader2, Search } from 'lucide-react'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { useFixtureListQuery } from '../store/fixtures'
import { useGroupListQuery } from '../store/groups'
import { usePersistentState } from '../hooks/usePersistentState'
import { COLUMN_DEFS, DEFAULT_COLUMN_VISIBILITY } from '../components/fixtures-list/columns'
import {
  buildRows,
  expandSelectionToFixtures,
  fixtureRowId,
  groupRowId,
  memberRowId,
  parseSelectParam,
  planBatchWrites,
} from '../components/fixtures-list/rowModel'
import { isEditableTarget } from '../lib/domUtils'
import {
  listSelectionIntentFor,
  useListSelection,
} from '../components/fixtures-list/useListSelection'
import { useCellWriters } from '../components/fixtures-list/useCellWriters'
import { useLitFixtureKeys } from '../components/fixtures-list/useLitFixtureKeys'
import { FixturesTable } from '../components/fixtures-list/FixturesTable'
import { SelectionToolbar } from '../components/fixtures-list/SelectionToolbar'
import type { ColumnKey } from '../components/fixtures-list/columns'
import type { CellCommit, Row, RowId } from '../components/fixtures-list/rowModel'
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
    <Card className="m-4 p-4">
      <div className="mb-4">
        <Breadcrumbs projectName={project.name} currentPage="Fixtures List" />
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <FixturesListContainer />
      </Suspense>
    </Card>
  )
}

const EMPTY_FIXTURES: Fixture[] = []
const EMPTY_GROUPS: GroupSummary[] = []

function FixturesListContainer() {
  const { data: maybeFixtures, isLoading: fixturesLoading } = useFixtureListQuery()
  const { data: maybeGroups, isLoading: groupsLoading } = useGroupListQuery()
  const [searchParams, setSearchParams] = useSearchParams()

  // Module-level constants keep the fallback identity stable across renders.
  const fixtures = maybeFixtures ?? EMPTY_FIXTURES
  const groups = maybeGroups ?? EMPTY_GROUPS

  const [filter, setFilter] = useState('')
  const [onlyLit, setOnlyLit] = usePersistentState('fixturesList.onlyLit', false)
  const [columnVisibility, setColumnVisibility] = usePersistentState<Record<ColumnKey, boolean>>(
    'fixturesList.columns',
    DEFAULT_COLUMN_VISIBILITY,
    { merge: true },
  )
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set<string>())
  const [scrollToRowId, setScrollToRowId] = useState<RowId | null>(null)

  const visibleColumns = useMemo(
    () => COLUMN_DEFS.filter((d) => columnVisibility[d.key]).map((d) => d.key),
    [columnVisibility],
  )

  const litFixtureKeys = useLitFixtureKeys(onlyLit ? fixtures : EMPTY_FIXTURES)

  const rows = useMemo(
    () =>
      buildRows({
        fixtures,
        groups,
        expandedGroups,
        textFilter: filter,
        litFixtureKeys: onlyLit ? litFixtureKeys : undefined,
      }),
    [fixtures, groups, expandedGroups, filter, onlyLit, litFixtureKeys],
  )

  // Dividers aren't selectable — they're excluded from the selection order so
  // shift-ranges and select-all never touch them.
  const selectableOrder = useMemo(
    () => rows.filter((row) => row.kind !== 'divider').map((row) => row.id),
    [rows],
  )
  const selection = useListSelection(selectableOrder)

  // Selected ids whose rows are hidden (collapsed group, active filter) are
  // inert everywhere below — every consumer intersects with `rows` — so no
  // aggressive reconcile is needed when visibility changes.
  const selectedFixtures = useMemo(
    () => expandSelectionToFixtures(rows, selection.selectedIds),
    [rows, selection.selectedIds],
  )

  const locateTargets = useMemo<LocateTarget[]>(() => {
    // Deduped by (type, key): a fixture selected via two group memberships
    // must toggle locate once, not twice (two toggles cancel out).
    const seen = new Set<string>()
    const targets: LocateTarget[] = []
    for (const row of rows) {
      if (row.kind === 'divider' || !selection.selectedIds.has(row.id)) continue
      const target: LocateTarget =
        row.kind === 'group'
          ? { type: 'group', key: row.name }
          : { type: 'fixture', key: row.fixture.key }
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

  const handleToggleExpand = useCallback((groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) next.delete(groupName)
      else next.add(groupName)
      return next
    })
  }, [])

  // Opening an editor on an unselected row targets just that row (and the
  // selection follows, standard spreadsheet feel); on a selected row the whole
  // selection is the target.
  const handleBeginCellEdit = useCallback(
    (row: Row) => {
      if (row.kind !== 'divider' && !selection.isSelected(row.id)) {
        selection.select(row.id, 'replace')
      }
    },
    [selection],
  )

  const rowOwnFixtures = useCallback((row: Row): Fixture[] => {
    if (row.kind === 'group') return row.members
    if (row.kind === 'fixture') return [row.fixture]
    return []
  }, [])

  const commitNow = useCallback(
    (row: Row, col: ColumnKey, commit: CellCommit) => {
      const targets =
        row.kind !== 'divider' && selection.isSelected(row.id)
          ? selectedFixtures
          : rowOwnFixtures(row)
      // planBatchWrites clamps the commit to each fixture's own ranges.
      for (const planned of planBatchWrites(targets, col, commit)) {
        const { fixture, resolution } = planned
        const clamped = planned.commit
        switch (clamped.kind) {
          case 'slider':
            if (resolution.kind === 'slider') {
              writers.writeSlider(resolution.property.channel, clamped.value)
            }
            break
          case 'colour':
            if (resolution.kind === 'colour') {
              writers.writeColour(
                fixture.key,
                resolution.property,
                clamped.r,
                clamped.g,
                clamped.b,
                clamped.w,
                clamped.a,
                clamped.uv,
              )
            }
            break
          case 'position':
            if (resolution.kind === 'position') {
              writers.writePosition(fixture.key, resolution.pan, resolution.tilt, clamped.pan, clamped.tilt)
            }
            break
          case 'setting':
            if (resolution.kind === 'setting' || resolution.kind === 'colour-setting') {
              writers.writeSetting(resolution.property.channel, clamped.level)
            }
            break
        }
      }
    },
    [selectedFixtures, selection, rowOwnFixtures, writers],
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

  const batchCountFor = useCallback(
    (row: Row): number => {
      if (row.kind === 'divider') return 0
      if (selection.isSelected(row.id)) return selectedFixtures.length
      return row.kind === 'group' ? row.members.length : 1
    },
    [selection, selectedFixtures],
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
    if (!selectParam || fixturesLoading || groupsLoading) return
    const parsed = parseSelectParam(selectParam)
    let rowId: RowId | null = null
    if (parsed?.kind === 'group' && groups.some((g) => g.name === parsed.key)) {
      rowId = groupRowId(parsed.key)
    } else if (parsed?.kind === 'fixture') {
      const fixture = fixtures.find((f) => f.key === parsed.key)
      if (fixture) {
        const parentGroup = fixture.groups.find((name) => groups.some((g) => g.name === name))
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
    // selection.select is referentially stable (useCallback with no deps in
    // useListSelection); setOnlyLit/setSearchParams are stable setters;
    // groups/fixtures/loading flags cover everything else read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectParam, fixtures, groups, fixturesLoading, groupsLoading, setSearchParams])

  // View-level shortcuts: Escape clears, ⌘/Ctrl+A selects all visible rows,
  // ↑/↓ move the selection (Shift extends the range from the anchor). Guarded
  // so typing in inputs or interacting inside popovers/dialogs never triggers.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target instanceof Element ? e.target : null)) return
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]')) return

      if (e.key === 'Escape') {
        selection.clear()
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
  }, [selection, selectableOrder])

  if (fixturesLoading || groupsLoading) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter fixtures by name, manufacturer, or type..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 pl-9"
          />
        </div>
        <Button
          variant={onlyLit ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOnlyLit(!onlyLit)}
          title="Show only fixtures with intensity above zero"
        >
          <Lightbulb className="size-3.5" />
          Lit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="size-3.5" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {COLUMN_DEFS.map((def) => (
              <DropdownMenuCheckboxItem
                key={def.key}
                checked={columnVisibility[def.key]}
                onCheckedChange={(checked) =>
                  setColumnVisibility((prev) => ({ ...prev, [def.key]: checked === true }))
                }
                // Keep the menu open while toggling several columns.
                onSelect={(e) => e.preventDefault()}
              >
                {def.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Gate on VISIBLE selected rows, not raw selection count — filtering
            away every selected row must not leave a live toolbar acting on an
            empty set. */}
        {locateTargets.length > 0 && (
          <SelectionToolbar
            locateTargets={locateTargets}
            fixtures={selectedFixtures}
            onClear={selection.clear}
          />
        )}
      </div>

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
          scrollToRowId={scrollToRowId}
          onScrolledToRow={() => setScrollToRowId(null)}
        />
      )}
    </div>
  )
}
