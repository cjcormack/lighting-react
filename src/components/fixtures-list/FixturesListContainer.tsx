import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, labelUnlessCompact } from '@/lib/utils'
import { FIXTURE_FILTER_HINT, FIXTURE_FILTER_PLACEHOLDER } from '@/lib/fixtureFilterCopy'
import { Lightbulb, Search } from 'lucide-react'
import { useFixtureListQuery } from '../../store/fixtures'
import { useGroupListQuery } from '../../store/groups'
import { usePersistentState } from '../../hooks/usePersistentState'
import { useCellSelection } from './useCellSelection'
import { useProgrammerScope } from '../programmer/ProgrammerScope'
import { useFocusedTemplateLayer } from '../programmer/FocusedTemplateLayer'
import { CellEntryPopover } from './CellEntryPopover'
import { cellEntryHint, cellKeyboardPermission, parseCellEntry } from './cellEntry'
import { resolutionPropertyNames } from './columns'
import type { CellRef } from './cellSelectionModel'
import type { AttributeFamily } from '../../lib/attributeFamily'
import {
  ColumnsMenu,
  useColumnVisibility,
  visibleColumnsFrom,
  type ColumnVisibility,
} from './ColumnsMenu'
import {
  buildRows,
  countFixtureRows,
  expandSelectionToTargets,
  fixtureRowId,
  groupRowId,
  memberRowId,
  parseSelectParam,
  planBatchWrites,
  resolveTargetCells,
  selectedRowTargets,
  rowWriteTargets,
  targetFamilies,
  targetEmitters,
  templateTargetsFor,
} from './rowModel'
import { isEditableTarget } from '../../lib/domUtils'
import { useIncludeSelectionRequest } from '../../store/includeSelection'
import {
  listSelectionIntentFor,
  useListSelection,
  usePublishSelectionTargets,
} from './useListSelection'
import type { SelectionScope } from '../../store/selectionSlice'
import { applyPlannedWrite, useCellWriters } from './useCellWriters'
import { useLitFixtureKeys } from './useLitFixtureKeys'
import { FixturesTable } from './FixturesTable'
import { SelectionToolbar } from './SelectionToolbar'
import { FixtureDetailModal } from '../groups/FixtureDetailModal'
import { GroupDetailModal } from '../fixtures/GroupDetailModal'
import type { ColumnKey } from './columns'
import { useDeskSelectionBridge } from './useDeskSelectionBridge'
import type {
  CellCommit,
  FixtureRow,
  GroupRow,
  InfoRow,
  Row,
  RowId,
} from './rowModel'
import type { LocateTarget } from '../../store/locate'
import type { Fixture } from '../../store/fixtures'
import type { GroupSummary } from '../../api/groupsApi'

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
  /** Take ownership of the column menu's state — see `useColumnVisibility`. Pass both or neither. */
  columnVisibility?: ColumnVisibility
  onColumnVisibilityChange?: (next: ColumnVisibility) => void
  /**
   * Replace the built-in toolbar row, receiving the controls this container owns as ready-made
   * nodes so a caller can re-arrange them without re-implementing their state.
   *
   * Exists because the programmer view scatters them: Columns joins the action bar's Sheet zone,
   * the filter sits above the grid, and the selection actions get a bar of their own. Absent — the
   * two plain list routes — keeps today's single row exactly.
   */
  renderToolbar?: (parts: {
    filter: React.ReactNode
    lit: React.ReactNode
    columns: React.ReactNode
    /** Null when nothing *visible* is selected; the caller should render nothing rather than a shell. */
    selection: React.ReactNode | null
    /** The marquee's cells, for a scope label beside the fixture count. Empty when none. */
    cells: readonly CellRef[]
    /**
     * True when Enter (or a digit) opens the marquee's typed-value editor: cells are selected and
     * the scope can take a typed value (`cellKeyboardPermission`). The editor itself is a popover
     * the container renders at the first selected cell; the caller only draws the hint, from this
     * flag, so the hint and the key agree by construction.
     */
    cellEntryKey: boolean
    /** True when Backspace / Delete would take the selected cells out of Local — same rule. */
    cellClearKey: boolean
    /**
     * Where a template press lands: the cells' fixtures when there is a marquee, otherwise the
     * selected rows'. Already `{type: 'fixture', key}`, so the strip sends it as it is.
     */
    templateTargets: readonly LocateTarget[]
    /** The families those targets can take at all — the capability half of the strip's filter. */
    targetFamilies: readonly AttributeFamily[]
    /**
     * The bundled colour emitters those targets have — `white` / `amber` / `uv`.
     *
     * The rest of that filter. A template naming an emitter refuses on a head without it *whole*,
     * and the family cannot say which: every emitter is COLOUR.
     */
    targetEmitters: readonly string[]
  }) => React.ReactNode
  /**
   * Replace nothing — *add* a footer strip under the table, receiving the two counts only this
   * component can compute.
   *
   * Exists for the programmer's ownership legend, which the space plan turns into a 22px footer
   * reading `24 fixtures · 4 selected` beside its swatches. The legend used to be a sibling of
   * this container, which is why it could not say either number; both come from `rows` and the
   * selection, and lifting them out would mean a second row build or a second selection read.
   *
   * `fixtureCount` counts **fixture rows after filtering** — not groups, elements or dividers, and
   * not the whole patch: the number answers "how much is in front of me", which is what a filtered
   * list changes. `selectedCount` is the *visible* selection, the same set the selection toolbar
   * gates on, so a filter that hides every selected row reads 0 rather than lying.
   */
  renderFooter?: (parts: { fixtureCount: number; selectedCount: number }) => React.ReactNode
  /**
   * Let the table fill its flex parent instead of capping at `calc(100vh - 14rem)`.
   *
   * That cap is tuned for a list embedded in a scrolling page. The programmer is a full-height
   * view whose grid owns the remaining space, and the cap there leaves dead air below the rows.
   */
  fill?: boolean
  /**
   * Draw `Lit` and `Columns` as icons alone, whatever the viewport says.
   *
   * The two carry `sm:inline` words, which asks the viewport whether there is room — and a caller
   * can know better. The programmer's short-height arm does (space plan D8): rows A and B are one
   * 36px line under `max-height: 500px`, so on an 852×393 landscape phone the viewport is wide
   * and the *row* is not, and those two words plus the scope pills' were 130px of the room the
   * source box needs to name the cue you are about to overwrite. Both keep their `title`.
   */
  compactControls?: boolean
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
  renderFooter,
  fill = false,
  compactControls = false,
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

  // Null outside the programmer, so the plain fixtures and groups lists are unaffected.
  const scope = useProgrammerScope()
  // A marquee is a scope-local edit target: "these eight cells" means eight of *your* values in
  // Local and eight of a Look's rows in a layer, so carrying one across a switch would aim the
  // next edit at cells the operator picked while looking at something else. The row selection is
  // deliberately *not* cleared — that is what Record scopes on, and it survives everything.
  useEffect(() => {
    clearCells()
  }, [scope, clearCells])

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

  // The dedupe and the element-row drop live in `selectedRowTargets`, which the desk-selection
  // bridge below is the third caller of: locate and the desk must never disagree about what a
  // selected group row *is*.
  // Memoized on `rows` alongside every other derivation of it: this component re-renders on each
  // pointermove of a marquee drag, and an inline reduce in the return would rescan the whole row
  // list per frame to feed one footer string.
  const fixtureCount = useMemo(() => countFixtureRows(rows), [rows])

  const locateTargets = useMemo<LocateTarget[]>(
    () => selectedRowTargets(rows, selection.selectedIds),
    [rows, selection.selectedIds],
  )

  // Where a template press lands, and what those heads can take. The marquee is the narrower
  // statement when there is one — three colour cells means those three heads, not the eight rows
  // the checkboxes happen to name — and the row selection otherwise. Published through
  // `renderToolbar` rather than read from Redux by the strip: `selectTargetKeys` is already
  // flattened to member keys and knows nothing about cells.
  const cellRowIds = useMemo(
    () => new Set(cellSelection.cells.map((cell) => cell.rowId)),
    [cellSelection.cells],
  )
  const templateTargets = useMemo(
    () =>
      cellRowIds.size > 0
        ? templateTargetsFor(rows, cellRowIds)
        : templateTargetsFor(rows, selection.selectedIds),
    [rows, cellRowIds, selection.selectedIds],
  )
  // From the **same list** the press is sent to, resolved back to whole fixtures, so the two
  // cannot disagree: a lone element row lands on its fixture above, and its families are the
  // fixture's — parent properties and every element's — not the one element's. Deriving them from
  // `selectedTargets` instead (which holds the element) under-reported a bar whose dimmer sits on
  // the parent, and offered no intensity template for a press that would have set it.
  const fixtureByKey = useMemo(() => new Map(fixtures.map((f) => [f.key, f])), [fixtures])
  const templateWriteTargets = useMemo(
    () =>
      templateTargets.flatMap((target) => {
        const fixture = fixtureByKey.get(target.key)
        return fixture ? [fixture] : []
      }),
    [templateTargets, fixtureByKey],
  )
  const templateFamilies = useMemo(() => targetFamilies(templateWriteTargets), [templateWriteTargets])
  // The family alone cannot filter a template that names an emitter: white, amber, UV and the hex
  // are all COLOUR. Derived from the same list for the same reason the families are.
  const templateEmitters = useMemo(() => targetEmitters(templateWriteTargets), [templateWriteTargets])

  // One desk, one selection (plan D2) — the programmer scope only; see the hook.
  useDeskSelectionBridge(
    selectionScope === 'programmer',
    rows,
    selection.selectedIds,
    selection.setSelection,
  )

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

  /**
   * One commit, every selected cell. Grouped BY COLUMN so each column is exactly one
   * `planBatchWrites` call, keeping `resolveTargetCells`' parent-first precedence and per-target
   * clamping intact. A commit whose shape doesn't fit a column (a colour dragged across Colour and
   * Position, or `127` typed at a marquee that includes Colour) is filtered out inside
   * `planBatchWrites` — so the chip's cell count is an upper bound on what any ONE commit writes,
   * which the design's wording already allows for.
   *
   * Two callers: a popover opened on a cell inside the marquee, and the typed-value field. Both
   * are the same write, and that is the point of the field — it adds a keyboard to the marquee,
   * not a second path to the rig.
   */
  const commitToCells = useCallback(
    (commit: CellCommit): number => {
      let written = 0
      for (const { col: c, rowIds } of cellSelection.byColumn()) {
        const targets = expandSelectionToTargets(rows, new Set(rowIds))
        for (const planned of planBatchWrites(targets, c, commit)) {
          applyPlannedWrite(writers, planned)
          written += 1
        }
      }
      // How many writes were planned. A popover's caller has no use for it; the typed field does,
      // because a value that fitted no selected column looks exactly like one that landed.
      return written
    },
    [cellSelection, rows, writers],
  )

  const commitNow = useCallback(
    (row: Row, col: ColumnKey, commit: CellCommit) => {
      // Three scopes, most specific first. The marquee wins over the row selection because it is
      // the narrower, more deliberate statement of what this edit is for.
      if (cellSelection.isSelected(row.id, col)) {
        commitToCells(commit)
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
    [cellSelection, commitToCells, selectedTargets, selection, writers],
  )

  // ── The keyboard half of the marquee ──────────────────────────────────────────────────────
  //
  // Select cells, press Enter (or a digit), type, press Enter: the value lands on every selected
  // cell through `commitToCells`. The editor is a popover anchored at the first selected cell —
  // the same picture a click on a cell inside the marquee opens — and the selection bar's hint says
  // Enter opens it. The window handler below opens it and seeds it; it does nothing else.
  //
  // **The scope gate is `cellKeyboardPermission`**, and it is the fourth place "read-only" has to
  // be said (see CLAUDE.md §The programmer's scoped grid): the marquee arms in Output and on a
  // focused template layer too, and `useCellWriters` would take a commit from either as a live
  // write. Both keys read the same answer, and the field is simply not rendered where Enter would
  // be refused, so the hint beside it cannot promise a key that does nothing.
  const focusedTemplate = useFocusedTemplateLayer()
  const keys = cellKeyboardPermission(scope, focusedTemplate != null)
  const [entryOpen, setEntryOpen] = useState(false)
  const [entryAnchor, setEntryAnchor] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const [entryText, setEntryText] = useState('')
  const [entryProblem, setEntryProblem] = useState<'unreadable' | 'nowhere' | null>(null)
  const entryHint = useMemo(
    () => cellEntryHint([...new Set(cellSelection.cells.map((c) => c.col))]),
    [cellSelection.cells],
  )
  // A new marquee is a new question; text typed for the last one must not land on this one.
  // Keyed on the cells' *contents*, not their count and not the array's identity: a replace-marquee
  // of the same size over other cells is a new set with the same `cellCount`, while the `cells`
  // array is rebuilt on every `rows` rebuild — each filter keystroke, and under Lit every head that
  // crosses zero while an effect runs — and wiping a half-typed value on those would be a bug of
  // its own. The signature changes exactly when the set does.
  const cellsSignature = useMemo(
    () => cellSelection.cells.map((cell) => `${cell.rowId}\u0000${cell.col}`).join('\n'),
    [cellSelection.cells],
  )
  useEffect(() => {
    setEntryText('')
    setEntryProblem(null)
    setEntryOpen(false)
  }, [cellsSignature])

  /**
   * Open the editor at the first selected cell in visible order, seeded with whatever key opened
   * it. The cell is found by `(rowId, col)` through the `data-row-id` / `data-cell` attributes the
   * table puts on its rows — the container knows cells only by id, and the rows are virtualised —
   * and a cell that is scrolled out of the rendered window anchors the popover at the grid's top
   * instead of not opening.
   */
  const openEntry = useCallback(
    (seed: string) => {
      const cells = cellSelection.cells
      const first =
        rows.map((row) => cells.find((cell) => cell.rowId === row.id)).find((cell) => cell != null) ??
        cells[0]
      const el = first
        ? document.querySelector(
            `[data-row-id="${CSS.escape(first.rowId)}"] [data-cell="${CSS.escape(first.col)}"]`,
          )
        : null
      const rect = el?.getBoundingClientRect()
      setEntryAnchor(
        rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      )
      setEntryText(seed)
      setEntryProblem(null)
      setEntryOpen(true)
    },
    [cellSelection.cells, rows],
  )

  const submitEntry = useCallback(() => {
    if (!keys.entry) return
    const commit = parseCellEntry(entryText)
    if (commit == null) {
      setEntryProblem('unreadable')
      return
    }
    if (commitToCells(commit) === 0) {
      // Parsed, planned, and fitted nothing — `127` at a colour-only marquee. Said, and the text
      // kept, rather than cleared as though it had landed.
      setEntryProblem('nowhere')
      return
    }
    // Applied: the editor closes, the way a spreadsheet's does, and the marquee stays so a second
    // Enter can open it again for the next value.
    setEntryText('')
    setEntryProblem(null)
    setEntryOpen(false)
  }, [keys.entry, entryText, commitToCells])

  /**
   * Backspace / Delete on a marquee: take the selected cells out of Local — the spreadsheet's
   * "clear contents", and the one gesture the popovers have no button for. A cleared entry is
   * what stops a value being recorded, so this is how a busked colour that should *not* go into
   * the cue is un-busked without touching the fixtures around it.
   *
   * Local only (`cellKeyboardPermission`): Output is a read, and a Look layer's row draft has no
   * removal — `LookRowStore` exposes `setValue` alone — so rather than a key that silently does
   * nothing there, the gesture is not offered, and `cellClearKey` tells the toolbar so the hint
   * names it only where it works.
   */
  const canClearCells = keys.clear
  const canTypeCells = keys.entry
  const clearSelectedCells = useCallback(() => {
    if (!canClearCells) return
    for (const { col, rowIds } of cellSelection.byColumn()) {
      for (const outer of expandSelectionToTargets(rows, new Set(rowIds))) {
        for (const { target, resolution } of resolveTargetCells(outer, col)) {
          for (const propertyName of resolutionPropertyNames(resolution)) {
            writers.clearValue(target.key, propertyName)
          }
        }
      }
    }
  }, [canClearCells, cellSelection, rows, writers])

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

  // The marquee has to be counted, or the popover says "Applying to 1" while the commit writes
  // six hundred. An upper bound: cross-column commits are shape-filtered at write time, so a
  // colour edit over a Colour+Position marquee reaches fewer than this says. It's the same total
  // for every selected cell (marquee count doesn't vary by row/col), so it's hoisted into one
  // memo rather than recomputed per rendered cell — `batchCountFor` runs once per visible cell
  // per render, and each recompute here was itself O(rows × columns).
  const marqueeBatchCount = useMemo(
    () =>
      cellSelection.byColumn().reduce((n, group) => {
        const targets = expandSelectionToTargets(rows, new Set(group.rowIds))
        return n + targets.reduce((m, t) => m + resolveTargetCells(t, group.col).length, 0)
      }, 0),
    [cellSelection, rows],
  )

  // Counts write RESOLUTIONS for the column, not rows — a collapsed 12-head
  // bar's colour cell must warn "Applying to 12", matching what
  // planBatchWrites will actually expand the commit into.
  const batchCountFor = useCallback(
    (row: Row, col: ColumnKey): number => {
      if (row.kind === 'divider') return 0
      if (cellSelection.isSelected(row.id, col)) {
        return marqueeBatchCount
      }
      const targets =
        selection.isSelected(row.id) ? selectedTargets : rowWriteTargets(row)
      return targets.reduce((n, target) => n + resolveTargetCells(target, col).length, 0)
    },
    [cellSelection, marqueeBatchCount, selection, selectedTargets],
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
      if (cellCount > 0) {
        // Enter moves focus into the field; a character the grammar can start with is carried in
        // as its first character, so typing at the grid just works the way it does in a
        // spreadsheet. Plain keys only — ⌘/Ctrl combinations are someone else's shortcut.
        //
        // **Not from a focused control**, for every arm: a cell trigger is tabbable and
        // Tab-then-Enter opening its popover is a path the grid already promises, and a Radix menu
        // is `role="menu"`, not `dialog`, so the guard above does not cover a menu item. Backspace
        // is the destructive one — a live `clearEntry` per cell — so it is the arm that most needs
        // to know a chip, a checkbox or a menu item had the focus.
        const onControl =
          e.target instanceof HTMLElement &&
          e.target.closest('button, a, [role="menuitem"], [role="menu"]') != null
        if (e.metaKey || e.ctrlKey || e.altKey || onControl) {
          // fall through to the row shortcuts below
        } else if (e.key === 'Enter') {
          if (!canTypeCells) return
          e.preventDefault()
          openEntry('')
          return
        } else if (/^[0-9#.,]$/.test(e.key)) {
          if (!canTypeCells) return
          e.preventDefault()
          openEntry(e.key)
          return
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          if (canClearCells) {
            e.preventDefault()
            clearSelectedCells()
          }
          return
        }
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
    // `clearSelectedCells` is the exception this accepts: it closes over `cellSelection`, `rows`
    // and `writers`, so it rebinds on every marquee change, a filter or expansion change, and a
    // scope change — more often than `cellCount` — because the alternative is reading the current
    // selection through a ref inside a handler that also has to plan writes against `rows`, and a
    // rebind is cheaper than that second copy of the state. `openEntry` follows the same cadence
    // for the same reason. `canTypeCells` is a boolean.
  }, [selection, selectableOrder, cellCount, clearCells, canClearCells, canTypeCells, clearSelectedCells, openEntry])

  if (fixturesLoading || groupsLoading) {
    return <div>Loading...</div>
  }

  // The container owns these controls' state, so a caller re-arranging the toolbar gets them as
  // ready-made nodes rather than re-implementing them. See `renderToolbar`.
  const filterControl = (
    <div className="relative w-full min-w-48 sm:w-auto sm:flex-1">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={FIXTURE_FILTER_PLACEHOLDER}
        title={FIXTURE_FILTER_HINT}
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
          carry a title/tooltip. `compactControls` is the same answer asked for by a caller whose
          toolbar is short of width for a reason the viewport cannot see — see the prop. */}
      <span className={labelUnlessCompact(compactControls, 'sm:inline')}>Lit</span>
    </Button>
  )

  const columnsControl = (
    <ColumnsMenu
      visibility={columnVisibility}
      onChange={setColumnVisibility}
      compact={compactControls}
    />
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

  const cellEntryControl = (
    <CellEntryPopover
      open={entryOpen && cellCount > 0 && keys.entry}
      onOpenChange={(next) => {
        if (!next) setEntryOpen(false)
      }}
      anchor={entryAnchor}
      value={entryText}
      onChange={(next) => {
        setEntryText(next)
        setEntryProblem(null)
      }}
      onSubmit={submitEntry}
      hint={entryHint}
      problem={entryProblem}
      // Write resolutions, not cells — the same number the slider editor shows for the marquee.
      count={marqueeBatchCount}
    />
  )

  return (
    // `space-y-3` only off `fill`. The programmer's grid runs edge to edge under a 22px footer
    // that has to sit hard against the table's own border, and a rhythm applied to every child
    // would push a 12px gap under it.
    <div className={cn(fill ? 'flex min-h-0 flex-1 flex-col' : 'space-y-3')}>
      {cellEntryControl}
      {renderToolbar ? (
        renderToolbar({
          filter: filterControl,
          lit: litControl,
          columns: columnsControl,
          selection: selectionControl,
          cells: cellSelection.cells,
          cellEntryKey: cellCount > 0 && keys.entry,
          cellClearKey: cellCount > 0 && keys.clear,
          templateTargets,
          targetFamilies: templateFamilies,
          targetEmitters: templateEmitters,
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

      {renderFooter?.({ fixtureCount, selectedCount: locateTargets.length })}

      <FixtureDetailModal fixtureKey={infoFixtureKey} onClose={() => setInfoFixtureKey(null)} />
      <GroupDetailModal groupName={infoGroupName} onClose={() => setInfoGroupName(null)} />
    </div>
  )
}
