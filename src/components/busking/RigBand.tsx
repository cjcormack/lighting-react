import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ChevronDown, ChevronLeft, ChevronRight, Crosshair, Flashlight, Grid2x2, GripVertical, MoreHorizontal, Waves, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DeskChip } from '@/components/desk/DeskChip'
import { HandPlaceStrip } from '@/components/hand/HandTarget'
import { registerDragOverlay } from '@/components/dnd/dragOverlayRegistry'
import { useHighlight } from '@/components/fixtures-list/useHighlight'
import type { WriteTarget } from '@/components/fixtures-list/rowModel'
import { formatFamilyList, type AttributeFamily } from '@/lib/attributeFamily'
import { targetKey } from '@/lib/targetKey'
import { cn } from '@/lib/utils'
import type { CueTarget } from '@/api/cuesApi'
import type { SubselectMode } from '@/api/selectionApi'
import type { HeldRecord } from '@/api/handApi'
import { BUSK_FLOWS, BUSK_FLOW_LABELS, BUSK_WIDTHS, BUSK_WIDTH_LABELS, type BuskFlow } from '@/api/buskApi'
import type { BuskRigCellMode, BuskRigRow } from '@/api/buskRigApi'
import { useGroupListQuery } from '@/store/groups'
import { usePatchListQuery } from '@/store/patches'
import { useLocateStateQuery, useToggleLocateMutation, type LocateTarget } from '@/store/locate'
import { useBuskRigQuery } from '@/store/busk'
import { useFixtureLookup } from '@/hooks/useFixtureLookup'
import { useHandPlace } from '@/store/hand'
import { setBuskSheet, useBuskRigRows } from '@/lib/buskWindow'
import { SUBSELECT_FILTER_MODES, SUBSELECT_MODE_LABELS, SUBSELECT_STEP_MODES } from '@/lib/cellsSubSelection'
import {
  applyDrop,
  effectiveRig,
  expandTile,
  removeRow,
  relabelTile,
  removeTile,
  renameRow,
  rigIdsFromPatches,
  rigLines,
  rigRowBodyId,
  rigRowGapId,
  rigRowId,
  RIG_NEW_ROW_ID,
  rowFlow,
  rowTiles,
  rowWidth,
  setRowLayout,
  setTile,
  tileKeyOf,
  type RenderTile,
  type RigPaletteRecord,
  type RigTileAddress,
} from '@/lib/buskRig'
import { RIG_DROP_DEPTH, rigDragData, type RigDropData, type RigRowDragData } from './buskDnd'
import { BuskLabel } from './BuskLabel'
import { NameField } from './NameField'
import { RigEditProvider, useRigEdit } from './RigEditProvider'
import { RigHandle } from './RigHandle'
import { RigDropSlot, RigTile, type TileLookup } from './RigTile'
import { summariseSelection, type BuskingTarget, type EffectPresence } from './buskingTypes'

/**
 * The **rig band**: the target band as a document the operator built (busk-further plan D1–D3),
 * across the top of the busk view.
 *
 * Rows of tiles, each tile a group, a fixture, or a fixture's cell; an **empty rig draws every
 * group then every fixture** — `effectiveRig`'s fallback, the client's by decision — so a desk with
 * nothing built sees what the target band showed. There is **one render path**: the fallback is a
 * set of rows like any other, only its tiles carry no address and take no drop.
 *
 * **A row is laid out the way a bank is** (2026-09-21): it carries a `width` share in twelfths and
 * a `flow` — the bank's two facts, plus `SCROLL`, the sideways-scrolling line every row was before
 * it had a flow and still the default. The rows fill a twelve-track grid in order (`rigLines`), so
 * two half-width rows sit side by side as two half-width columns do on a page, and the band's unit
 * is the **line**, not the row: the handle counts lines and `clampRigRows` clamps to them. Both
 * facts are set from the row's `…` menu in *Edit layout*, as a bank's are from its own.
 *
 * **A press is a plain toggle**, as it was, and a **pip is a press of its own** (session 7): a
 * `PIPS` tile's cells toggle `{type: 'fixture', key: element.key}` through the same `onToggle`, and
 * a drag across them is a run (`RigTile`). **Two rows of chrome, then the rows** (`Main.dc.html`
 * as revised 2026-09-21): the **label row** — the selection summary, the family pill, the desk chip
 * — and under it a **controls row** — the **Cells menu** with its two step buttons, the verbs
 * (*Spread…*, Locate, Highlight, Clear, each an icon with a word beside it where the band is wide,
 * `VERB_WORD_CLASS`, and the icon alone where it is not) and, at its end, whatever the host hands in
 * as [controls]: the Focus control and *Edit layout* / *Done*. They were one row, and a desk width
 * with the sidebar open put twelve controls on it; the controls row is the same row in every shape
 * — Split, Rig **and Pads**, where the band is drawn without its rows — so nothing on it moves as
 * the shape changes, and the page strip below is tabs and the page chip and nothing else. Below `md`
 * the band is one row with a row chip and the verbs in a menu (the phone board), and there is no
 * editing: the palette is not drawn there either.
 *
 * **The Cells menu is one desk op** (busk-further plan D12): the seven *filters* — All · Odd ·
 * Even · 1st half · 2nd half · Invert · Masters only — in one menu whose label names the mode last
 * pressed here, and *Prev* / *Next* as two buttons beside it, because a step moves the selection
 * along the rig where a filter narrows it, and the two read as one control only while they sat on
 * one chip. Each press is `onSubselect(mode)`, which is `selection.subselect` while this window
 * follows the desk and `lib/cellsSubSelection.ts`'s mirror over the tab's copy when it is unlinked
 * (`useBuskingSelection`). The desk keeps **no** sub-selection state, so nothing on the face is
 * derived from the selection: the label is only the filter last pressed here, and it resets with
 * the band. A step is never remembered as the label — it is not a mode.
 *
 * **The handle is `RigHandle`, in all three shapes** (busk-further plan D6, revised 2026-09-21): in
 * Split a grip under the rows, dragged to a height and **snapping to whole lines** — a half line of
 * tiles is useless — that reads and writes the window's `busk.rigRows` (`lib/buskWindow.ts`), and
 * **snaps past both ends**: dragged past the last line it lands on Rig focus, dragged above the
 * first on Pads, so the segmented control and this handle are one setting. While it is dragged every
 * line is drawn and the clip is the snap: cut at the pointer between the ends, to nothing in the
 * Pads region, lifted to every line in the Rig region — no count caption and no badge, the band
 * simply takes the shape the release will give it; the arrow keys step it one line at a time for
 * the keyboard. It is drawn for **one line too** (D6: 1…N — a one-row rig still needs its way into
 * Rig and Pads from the band). In **Pads** and **Rig** a chevron pill is drawn where the drag would
 * be — under the controls row, or under the rows at the bottom — and a press on it is the way back
 * to Split. In **Rig focus** the
 * band takes `focus="rig"`: every row, the band filling the body and its rows scrolling. **Below `md` Rig
 * focus stacks every row two tiles across, scrolling vertically** (`Phones.dc.html` note 6): it is
 * D15's replacement for the narrow-width target sheet, and a sideways scroll per row on a phone would
 * defeat the point of a list. Edit mode shows every row regardless, since a hidden row cannot take a
 * drop.
 *
 * In *Edit layout* the band joins the app's one `DndContext` through `RigEditProvider`: rows
 * reorder by their grip onto the gaps between rows, a tile or a Rig-tab palette row lands on a tile,
 * a row body or the new-row zone, and every gesture saves the whole rig through the same
 * operation queue the page uses. The show-all fallback is drawn dimmed behind the new-row zone
 * while editing an empty rig, because it is not on the wire and nothing on it can move.
 */

export interface RigBandProps {
  projectId: number
  selectedTargets: Map<string, BuskingTarget>
  /** The selection's attribute mask, drawn as a pill beside the summary. Null is every attribute. */
  families: AttributeFamily[] | null
  onToggle: (target: CueTarget) => void
  onClear: () => void
  /** The Cells menu's and the step buttons' press — one desk op, or the client mirror when unlinked (D12). */
  onSubselect: (mode: SubselectMode) => void
  editing: boolean
  /** Off the desk board — below `md` and on the short board: one row with a row chip, 48px tiles, the verbs in a menu. */
  compact: boolean
  /**
   * Below `md` only: Rig focus stacks every row two tiles across, scrolling with the band
   * (`Phones.dc.html` note 6). Not on the short board — a landscape phone is wider than `md` and
   * keeps its sideways rows, which is why this is not derived from [compact].
   */
  stackRows?: boolean
  /**
   * Split shows `busk.rigRows` lines under the handle; Rig fills the body with every row; Pads
   * draws the label and controls rows and the grip, and no rows — the desk board's fold, in place
   * of `RigStrip`, so the controls row is the same row in every shape.
   */
  focus: 'split' | 'rig' | 'pads'
  /**
   * Drawn at the right end of the controls row (the label row, on the compact board): the Focus
   * control and *Edit layout* / *Done*. Handed in rather than mounted here because the band knows
   * nothing about the window's shape or the page's edit mode.
   */
  controls?: ReactNode
}

/**
 * The verbs' words, drawn only where the controls row is wide enough for everything on it with
 * them. The band is its own `@container`; measured on the desk, the controls row with every word
 * — the Cells menu, the two steps, four verbs, the Focus control and *Edit layout* — is 847px with
 * its gaps and ~600 without the verbs' words, so below this the verbs are their icons and the row
 * stays one line.
 * The thresholds were 1150 / 1000 when the verbs shared the label row with the summary and the
 * chips; a dedicated row has the room, and folding at those widths dropped an 1122px window to
 * icons for nothing. Wrapping remains the last resort for a row narrower than the icons.
 */
export const VERB_WORD_CLASS = 'hidden @[860px]:inline'

export { snapRigRows } from './RigHandle'

/** The Cells menu's label folds to its glyph a step later than the verbs' words do: it names a state. */
const CELLS_WORD_CLASS = 'hidden @[680px]:inline'

/** The Focus control's labels, by the same measure as the Cells label — glyphs alone below it. */
export const FOCUS_WORD_CLASS = 'hidden @[680px]:inline'

/** One verb on the controls row: a 28px outline button with its icon, its word folding away first (`VERB_WORD_CLASS`). */
const VERB_CLASS = 'h-7 gap-1.5 px-2 text-xs'

export function RigBand(props: RigBandProps) {
  const { projectId, editing } = props
  const { data: rig, isError: rigFailed } = useBuskRigQuery(projectId)
  const { data: patches } = usePatchListQuery(projectId)
  const ids = useMemo(() => rigIdsFromPatches(patches), [patches])
  const document = useMemo(() => rig ?? { rows: [] }, [rig])
  return (
    <RigEditProvider editing={editing} projectId={projectId} rig={document} ids={ids}>
      <RigBandBody {...props} rigLoaded={rig != null || rigFailed} />
    </RigEditProvider>
  )
}

function RigBandBody({
  projectId,
  selectedTargets,
  families,
  onToggle,
  onClear,
  onSubselect,
  editing,
  compact,
  stackRows = false,
  focus,
  controls,
  rigLoaded,
}: RigBandProps & { rigLoaded: boolean }) {
  const { rig, source, foreign, commit } = useRigEdit()
  const { data: groups } = useGroupListQuery()
  const { data: patches } = usePatchListQuery(projectId)
  const { fixtures, fixtureByKey, typeByKey } = useFixtureLookup()
  const placeFromHand = useHandPlace()

  const lookup = useMemo<TileLookup>(() => {
    const patchByKey = new Map(patches?.map((patch) => [patch.key, patch]) ?? [])
    return { patchByKey, fixtureByKey, typeByKey }
  }, [patches, fixtureByKey, typeByKey])

  const effective = useMemo(
    () => (rigLoaded ? effectiveRig(rig, groups, fixtures) : { rows: [], fallback: false }),
    [rigLoaded, rig, groups, fixtures],
  )
  const lines = useMemo(() => rigLines(effective.rows), [effective.rows])

  // The handle: 1…N whole lines (D6), the window's fact clamped to the rig. Edit mode and Rig focus
  // show every row — a hidden row cannot take a drop, and Rig focus *is* the whole rig — and so
  // does a drag in progress, which clips the rows at the pointer instead (`RigRowsHandle`).
  const shown = useBuskRigRows(lines.length)
  const everyRow = editing || focus === 'rig'
  const folded = focus === 'pads' && !editing
  const [compactRow, setCompactRow] = useState(0)
  const compactIndex = Math.min(compactRow, Math.max(0, effective.rows.length - 1))
  // Held by the band because it decides what is drawn (every line while the handle is held); the
  // clip at the pointer is the handle's own, written imperatively onto `rowsRef` per move so a
  // pointer frame re-renders the overlay and not every tile on the band.
  const [dragging, setDragging] = useState(false)
  const visibleLines: number[][] = folded
    ? []
    : everyRow || dragging
      ? lines
      : compact
        ? effective.rows.length === 0 ? [] : [[compactIndex]]
        : lines.slice(0, shown)
  const rowsRef = useRef<HTMLDivElement>(null)

  // Every cell the selection **covers**: the cells selected on their own, and every cell of a
  // selected whole fixture — the desk's `TargetCoverage` reads a cell as covered by its parent, so
  // a pip under a selected parent must read checked, or its press (which narrows the parent) would
  // be the dark-pip-that-deselects reading `presenceOf` refuses below for a cell tile.
  const selectedCells = useMemo(() => {
    const cells = new Set<string>()
    for (const target of selectedTargets.values()) {
      if (target.type !== 'fixture') continue
      if (target.element != null) cells.add(target.key)
      else for (const element of target.fixture.elements ?? []) cells.add(element.key)
    }
    return cells
  }, [selectedTargets])

  /** Is this tile's whole fixture selected as itself — which is what tells `4` from `4 of 4`. */
  const wholeSelected = useCallback(
    (tile: RenderTile): boolean => tile.kind === 'fixture' && selectedTargets.has(targetKey(tile.target)),
    [selectedTargets],
  )

  // The parent↔cell relation runs both ways (D11: a parent covers its cells): a fixture tile reads
  // `some` when one of its cells is selected elsewhere, and a cell or run tile reads `all` while
  // its whole fixture is — the desk would read a press on that cell as a narrowing, and a dark tile
  // whose press narrows is the worst reading of the three.
  const presenceOf = useCallback(
    (tile: RenderTile): EffectPresence => {
      if (tile.kind === 'run' || tile.kind === 'cell') {
        if (selectedTargets.has(targetKey({ type: 'fixture', key: tile.patch.key }))) return 'all'
      }
      if (tile.kind === 'run') {
        const lit = tile.targets.filter((target) => selectedTargets.has(targetKey(target))).length
        return lit === 0 ? 'none' : lit === tile.targets.length ? 'all' : 'some'
      }
      if (selectedTargets.has(targetKey(tile.target))) return 'all'
      if (tile.kind === 'fixture' && tile.cells.length > 0) {
        const lit = tile.cells.filter((cell) => selectedCells.has(cell.key)).length
        // Every cell selected reads `all` as the whole fixture does: what a run across all the pips
        // leaves, and what *Cells: All* would widen to the parent.
        if (lit === tile.cells.length) return 'all'
        if (lit > 0) return 'some'
      }
      return 'none'
    },
    [selectedTargets, selectedCells],
  )

  // A run is one pad: pressed from `all` it goes off, from anything else it goes on — toggling
  // each cell independently would carry a half-lit run to its complement, which is `some` again.
  // A fixture tile lit only by its cells follows the same rule: from `all` it goes off, cell by
  // cell, because toggling the parent there would *add* it (the desk never reads a parent as
  // covered by its cells) and the tile would not visibly move.
  const press = useCallback(
    (tile: RenderTile) => {
      if (tile.kind === 'fixture' && tile.cells.length > 0 && !selectedTargets.has(targetKey(tile.target))) {
        const lit = tile.cells.filter((cell) => selectedCells.has(cell.key))
        if (lit.length === tile.cells.length) {
          tile.cells.forEach((cell) => onToggle({ type: 'fixture', key: cell.key }))
          return
        }
      }
      if (tile.kind !== 'run') {
        onToggle(tile.target)
        return
      }
      const lit = tile.targets.filter((target) => selectedTargets.has(targetKey(target)))
      if (lit.length === tile.targets.length) tile.targets.forEach(onToggle)
      else tile.targets.filter((target) => !selectedTargets.has(targetKey(target))).forEach(onToggle)
    },
    [onToggle, selectedTargets, selectedCells],
  )

  // ── The label row's verbs ──
  const selected = [...selectedTargets.values()]
  const summary = summariseSelection(selected)
  const locateTargets = useMemo<LocateTarget[]>(
    () =>
      [...selectedTargets.values()].map((target) => ({
        type: target.type,
        key: target.type === 'group' ? target.name : target.key,
      })),
    [selectedTargets],
  )
  const { data: locateState } = useLocateStateQuery()
  const [toggleLocate] = useToggleLocateMutation()
  const isLocated = (target: LocateTarget) =>
    locateState?.targets.some((t) => t.type === target.type && t.key === target.key) ?? false
  const allLocated = locateTargets.length > 0 && locateTargets.every(isLocated)
  const locateSelection = () => {
    const toToggle = allLocated ? locateTargets : locateTargets.filter((t) => !isLocated(t))
    for (const target of toToggle) {
      toggleLocate(target)
        .unwrap()
        .catch((err) => console.error(`Locate toggle failed for ${target.type} '${target.key}'`, err))
    }
  }
  // Highlight lifts the selection's dimmers: a group's members from the fixture list, a fixture
  // itself, a cell its own element — the write targets `rowWriteTargets` would hand the toolbar.
  const getHighlightTargets = useCallback((): WriteTarget[] => {
    const out: WriteTarget[] = []
    for (const target of selectedTargets.values()) {
      if (target.type === 'group') {
        for (const fixture of fixtures ?? []) if (fixture.groups.includes(target.name)) out.push(fixture)
      } else if (target.element != null) out.push(target.element)
      else out.push(target.fixture)
    }
    return out
  }, [selectedTargets, fixtures])
  const highlight = useHighlight(getHighlightTargets)

  const [confirmingReset, setConfirmingReset] = useState(false)
  const draggingRow = source?.type === 'rig-row'

  // The hand's rig-row place (session 3's fifth item): the rig PUT through the commit queue, then
  // `hand.drop` through `useHandPlace`, Undo the rig as it stood. `rigRecordOf` answers null for
  // every kind the hand can hold today, so the strip never lights — see `lib/handTargets.ts`.
  const placeHeld = useCallback(
    (row: number, rowName: string, held: HeldRecord) => {
      void placeFromHand(held, {
        where: rowName,
        run: async () => {
          const record = rigRecordOf(held)
          if (record == null) return null
          const before = rig
          const at: RigTileAddress = { row, tile: rowTiles(rig.rows?.[row] ?? { name: '', tiles: [] }).length }
          commit((current) => applyDrop(current, { kind: 'rig-palette', record }, { kind: 'tile', at }) ?? current)
          return before
        },
        undo: (before) => commit(() => before),
      })
    },
    [placeFromHand, rig, commit],
  )

  const nothingToShow = rigLoaded && effective.rows.length === 0

  /** Edit mode's reset, drawn on whichever row the board has — a window narrowed mid-edit keeps it. */
  const resetButton = (
    <Button
      variant="ghost"
      size="sm"
      className={VERB_CLASS}
      onClick={() => setConfirmingReset(true)}
      disabled={effective.fallback}
      title="Remove every row: the rig goes back to every group then every fixture"
    >
      Show every target
    </Button>
  )

  const locateTitle = allLocated ? 'Release locate on the selection' : 'Locate the selection: white beam at centre'

  return (
    <div
      data-rig-band={focus}
      className={cn(
        // Its own container, so the verbs' words and the Focus labels fold on the band's width —
        // what the rail or the sheet has taken is the band's business, not the viewport's.
        '@container shrink-0 border-b px-4 pt-2.5 pb-2',
        editing && 'bg-muted/20',
        // Rig focus: the band fills the body and the **rows** scroll, not the band — the controls
        // row carries the Focus control, the way back to Split and Pads, and a scroller that took it
        // along would put the only way back off-screen on any rig taller than the body.
        focus === 'rig' && !editing && 'flex min-h-0 flex-1 flex-col',
        // Pads: the band folds to its two rows and the grip; the page takes the body.
        folded && 'pb-1',
      )}
    >
      {/* ── Label row ── */}
      {/* The label row: the summary, the pill and the desk chip; `flex-wrap` as the last resort. */}
      <div data-rig-label-row className={cn('flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1', compact ? 'mb-2' : 'mb-1.5')}>
        <BuskLabel>Rig</BuskLabel>
        {compact && !everyRow && effective.rows.length > 1 && (
          <RowChip rows={effective.rows} index={compactIndex} onSelect={setCompactRow} />
        )}
        {editing ? (
          <span className="min-w-[6rem] flex-1 truncate text-[11px] text-muted-foreground">
            Editing · drag targets from the palette, rows reorder by their grip
          </span>
        ) : (
          <span className="min-w-[6rem] flex-1 truncate text-[11px] text-muted-foreground" title={summary}>
            {summary}
          </span>
        )}
        {families != null && families.length > 0 && (
          <Badge
            variant="outline"
            className="shrink-0 whitespace-nowrap border-primary/40 bg-primary/10 px-2 py-0 text-[10px] text-primary"
          >
            {formatFamilyList(families, ' · ')}
          </Badge>
        )}
        {/* `showSubject`: the page strip below carries the same pill for the page, and two bare
            *Desk* chips a row apart would be worse than either alone. */}
        {!editing && <DeskChip showSubject />}
        {/* The compact board has one row: its verbs menu, the edit-mode reset and the host's
            controls sit here, for `Done`'s reason — a desk window narrowed mid-edit keeps editing. */}
        {compact && !editing && (
          <CompactVerbs
            onSubselect={onSubselect}
            onClear={onClear}
            canClear={selected.length > 0}
            locateLabel={allLocated ? 'Release locate' : 'Locate'}
            canLocate={locateTargets.length > 0}
            onLocate={locateSelection}
          />
        )}
        {compact && editing && resetButton}
        {compact && controls}
      </div>

      {/* ── Controls row ── */}
      {/* The common controls, on a row of their own in every shape (2026-09-21): the sub-selection,
          the verbs, then the host's Focus control and Edit layout / Done. One row on the desk board
          where the label row used to carry all of it and wrapped; the compact board keeps its one. */}
      {!compact && (
        <div data-rig-controls-row className="mb-2 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
          {!editing && (
            <>
              <CellsMenu onSubselect={onSubselect} />
              <StepButtons onSubselect={onSubselect} />
            </>
          )}
          {editing ? (
            resetButton
          ) : (
          <>
            {/* *Spread…* is a selection verb beside Locate and Highlight: it opens the Spread tab,
                which reads the selection, and writes nothing but the sheet fact — below `md` the
                overlay carries the tab, so the same write opens it there. Each verb is the desk's
                ordinary outline button with its icon (the programmer's toolbar draws Locate and
                Highlight with these two glyphs), the word folding away first. */}
            <Button
              variant="outline"
              size="sm"
              className={VERB_CLASS}
              onClick={() => setBuskSheet('spread')}
              aria-label="Spread…"
              title="Spread a value across the selection"
            >
              <Waves className="size-3.5" />
              <span className={VERB_WORD_CLASS}>Spread…</span>
            </Button>
            <Button
              variant={allLocated ? 'default' : 'outline'}
              size="sm"
              className={cn(VERB_CLASS, allLocated && 'bg-sky-500 text-white hover:bg-sky-600')}
              onClick={locateSelection}
              disabled={locateTargets.length === 0}
              aria-label="Locate"
              title={locateTitle}
            >
              <Crosshair className="size-3.5" />
              <span className={VERB_WORD_CLASS}>Locate</span>
            </Button>
            <Button
              variant={highlight.isActive ? 'default' : 'outline'}
              size="sm"
              className={VERB_CLASS}
              disabled={selected.length === 0}
              onPointerDown={highlight.press}
              onPointerUp={highlight.release}
              onPointerCancel={highlight.release}
              onPointerLeave={highlight.release}
              aria-label="Highlight"
              title="Hold: every selected dimmer to full"
            >
              <Flashlight className="size-3.5" />
              <span className={VERB_WORD_CLASS}>Highlight</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={VERB_CLASS}
              onClick={onClear}
              disabled={selected.length === 0}
              aria-label="Clear"
              title="Clear the selection"
            >
              <X className="size-3.5" />
              <span className={VERB_WORD_CLASS}>Clear</span>
            </Button>
          </>
        )}
          <span className="flex-1" />
          {controls}
        </div>
      )}

      {/* ── Rows ── */}
      {folded ? null : nothingToShow && !editing ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No fixtures or groups configured</p>
      ) : (
        <div
          ref={rowsRef}
          data-rig-rows
          className={cn(
            // Twelve tracks, the page's own grid: a row is `span <width>`, so two half-width rows
            // share a line. Compact and stacked rows are one to a line whatever their width.
            // `content-start` in every shape: the handle's drag extends the grid below its last
            // line, and stretched tracks would grow the tiles instead of leaving the room empty.
            'grid grid-cols-12 content-start gap-x-3 gap-y-1.5',
            editing && effective.fallback && 'opacity-60',
            focus === 'rig' && !editing && 'min-h-0 flex-1 overflow-y-auto',
          )}
        >
          {editing && effective.fallback && effective.rows.length > 0 && (
            <p className="col-span-12 text-[11px] text-muted-foreground">
              Showing every target — drop a target below to start building a rig.
            </p>
          )}
          {visibleLines.map((line, lineIndex) =>
            line.map((index) => {
              const row = effective.rows[index]
              return (
                <RigRow
                  key={row.uuid ?? row.localKey ?? `row-${index}`}
                  row={row}
                  index={index}
                  line={lineIndex}
                  span={compact || (stackRows && focus === 'rig' && !editing) ? 12 : rowWidth(row)}
                  inDocument={!effective.fallback}
                  editing={editing}
                  compact={compact}
                  stacked={stackRows && focus === 'rig' && !editing}
                  lookup={lookup}
                  presenceOf={presenceOf}
                  wholeSelected={wholeSelected}
                  selectedCells={selectedCells}
                  onPress={press}
                  onPressCell={onToggle}
                  onPlace={placeHeld}
                />
              )
            }),
          )}
        </div>
      )}

      {editing && (
        <>
          {draggingRow && (
            <RowGap index={effective.fallback ? 0 : effective.rows.length} />
          )}
          <NewRowZone disabled={draggingRow || foreign} />
        </>
      )}

      {/* ── The handle ── */}
      {/* One grip in three shapes, on the desk board: the drag in Split; the press back to Split
          under the controls row in Pads and under the rows in Rig. Not in edit mode, which forces
          Split for its duration, and not on the compact board, where the segmented control is the
          route. */}
      {!editing && !compact && (focus !== 'split' || lines.length > 0) && (
        <RigHandle
          mode={focus}
          shown={shown}
          total={lines.length}
          rowsRef={rowsRef}
          dragging={dragging}
          onDragging={setDragging}
        />
      )}

      {/* Confirmed, like the page delete: this takes a whole arrangement away and the rig write
          has no undo. */}
      <AlertDialog open={confirmingReset} onOpenChange={setConfirmingReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Show every target?</AlertDialogTitle>
            <AlertDialogDescription>
              The rows you built are removed, and the rig goes back to every group then every
              fixture. The groups and fixtures themselves are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingReset(false)
                commit(() => ({ rows: [] }))
              }}
            >
              Show every target
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * What a held record would put on the rig, or null.
 *
 * Null for all three kinds the hand can hold today: a rig row takes a group, a fixture or a cell,
 * and the hand's wire (`hand.pickUp {kind, id}`, `HeldRecord.kind` a `BuskPadKind`) holds only a
 * template, a Look or a cue. The seam is here so that the day the desk can hold a group, this is
 * the one function to teach — the strip, the place and the Undo are already wired above it.
 */
function rigRecordOf(held: HeldRecord): RigPaletteRecord | null {
  void held
  return null
}

// ─── The Cells menu and the steps ────────────────────────────────────────

/**
 * The Cells menu (D12, revised 2026-09-21): *Cells: <last>* opening the seven filters. `last` is
 * the filter pressed here most recently and nothing more — the desk keeps no sub-selection, so
 * there is nothing to read one back from. The two steps are `StepButtons`, beside it.
 */
function CellsMenu({ onSubselect }: { onSubselect: (mode: SubselectMode) => void }) {
  const [last, setLast] = useState<SubselectMode>('ALL')
  const press = (mode: SubselectMode) => {
    setLast(mode)
    onSubselect(mode)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-cells-chip
          aria-label={`Cells: ${SUBSELECT_MODE_LABELS[last]}`}
          title={`Sub-selection over rig order — ${SUBSELECT_FILTER_MODES.map((mode) => SUBSELECT_MODE_LABELS[mode]).join(' · ')}`}
          className={cn(VERB_CLASS, 'gap-1')}
        >
          <Grid2x2 className="size-3.5" />
          <span className={CELLS_WORD_CLASS}>Cells: {SUBSELECT_MODE_LABELS[last]}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Cells</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={last} onValueChange={(mode) => press(mode as SubselectMode)}>
          {SUBSELECT_FILTER_MODES.map((mode) => (
            <DropdownMenuRadioItem key={mode} value={mode} title={CELLS_MODE_TITLES[mode]}>
              {SUBSELECT_MODE_LABELS[mode]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const STEP_LABELS: Partial<Record<SubselectMode, string>> = {
  PREV: 'Previous along the rig',
  NEXT: 'Next along the rig',
}

/** *Prev* / *Next*: a step along the rig order, which moves the selection rather than filtering it. */
function StepButtons({ onSubselect }: { onSubselect: (mode: SubselectMode) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Step the selection along the rig">
      {SUBSELECT_STEP_MODES.map((mode) => (
        <Button
          key={mode}
          variant="outline"
          size="sm"
          data-cells-step={mode}
          aria-label={STEP_LABELS[mode]}
          title={CELLS_MODE_TITLES[mode]}
          className="h-7 w-7 px-0"
          onClick={() => onSubselect(mode)}
        >
          {mode === 'PREV' ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </Button>
      ))}
    </div>
  )
}

const CELLS_MODE_TITLES: Partial<Record<SubselectMode, string>> = {
  ALL: 'Every selected cell widened to its whole fixture',
  ODD: 'Every other unit in rig order, from the first — cells where a selected head has them',
  EVEN: 'Every other unit in rig order, from the second',
  FIRST_HALF: 'The first half of the selection in rig order',
  SECOND_HALF: 'The second half of the selection in rig order',
  INVERT: 'Every unit of the selected heads that is not selected',
  MASTERS: 'The masters only: a multi-head fixture’s own channels, no cell',
  NEXT: 'The whole selection one step along rig order; one cell when only cells are selected',
  PREV: 'The whole selection one step back along rig order',
}

/**
 * Below `md` the label row has no room for a second control: the filters, the steps and the verbs
 * sit in one menu. **Module-level, not a closure inside the band**: a component declared during a
 * render is a new element type per render, so React remounted it — and closed its open menu —
 * on every `selection.state` frame, locate push or rig refetch while the operator had it open.
 */
function CompactVerbs({
  onSubselect,
  onClear,
  canClear,
  locateLabel,
  canLocate,
  onLocate,
}: {
  onSubselect: (mode: SubselectMode) => void
  onClear: () => void
  canClear: boolean
  locateLabel: string
  canLocate: boolean
  onLocate: () => void
}) {
  return (
    <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-1.5" aria-label="Selection verbs">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Below `md` the menu's filters and the two steps sit here: the label row has no
                  room for a second control. */}
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Cells</DropdownMenuLabel>
              {SUBSELECT_FILTER_MODES.map((mode) => (
                <DropdownMenuItem key={mode} onSelect={() => onSubselect(mode)}>
                  {SUBSELECT_MODE_LABELS[mode]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {SUBSELECT_STEP_MODES.map((mode) => (
                <DropdownMenuItem key={mode} onSelect={() => onSubselect(mode)} title={CELLS_MODE_TITLES[mode]}>
                  {STEP_LABELS[mode] ?? SUBSELECT_MODE_LABELS[mode]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setBuskSheet('spread')} title="Spread a value across the selection">
                Spread…
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canLocate} onSelect={onLocate}>
                {locateLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!canClear} onSelect={onClear}>
                Clear
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
  )
}

function RowChip({
  rows,
  index,
  onSelect,
}: {
  rows: BuskRigRow[]
  index: number
  onSelect: (index: number) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border bg-card px-2 text-[11px] font-medium"
          aria-label={`Row: ${rows[index]?.name ?? ''}`}
        >
          <span className="max-w-[9rem] truncate">{rows[index]?.name}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={String(index)} onValueChange={(value) => onSelect(Number(value))}>
          {rows.map((row, i) => (
            <DropdownMenuRadioItem key={row.uuid ?? row.localKey ?? i} value={String(i)}>
              {row.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── A row ───────────────────────────────────────────────────────────────

/** The row body per flow: the sideways line it always was, a wrapping grid of tiles, or one tile per line. */
function rowBodyClass(flow: BuskFlow, stacked: boolean): string {
  if (stacked) return 'grid grid-cols-2 gap-2 pb-1'
  switch (flow) {
    case 'WRAP':
      return 'flex flex-wrap gap-2 pb-1'
    case 'COLUMN':
      return 'flex flex-col gap-2 pb-1'
    case 'SCROLL':
      return 'flex gap-2 overflow-x-auto pb-1'
  }
}

function RigRow({
  row,
  index,
  line,
  span,
  inDocument,
  editing,
  compact,
  stacked,
  lookup,
  presenceOf,
  wholeSelected,
  selectedCells,
  onPress,
  onPressCell,
  onPlace,
}: {
  row: BuskRigRow
  index: number
  /** Which line of the band's grid this row is on (`rigLines`), for the handle's measurement. */
  line: number
  /** The row's grid span in twelfths — its width, or 12 where rows are one to a line. */
  span: number
  /** False for a show-all fallback row, which nothing can address. */
  inDocument: boolean
  editing: boolean
  compact: boolean
  /** Rig focus below `md`: the tiles in a two-column grid that scrolls with the band, not a sideways row. */
  stacked: boolean
  lookup: TileLookup
  presenceOf: (tile: RenderTile) => EffectPresence
  wholeSelected: (tile: RenderTile) => boolean
  selectedCells: ReadonlySet<string>
  onPress: (tile: RenderTile) => void
  onPressCell: (target: CueTarget) => void
  onPlace: (row: number, rowName: string, held: HeldRecord) => void
}) {
  const { source, target, foreign, commit } = useRigEdit()
  const editable = editing && inDocument
  const draggingRow = source?.type === 'rig-row'
  const tiles = rowTiles(row)
  const flow = rowFlow(row)

  const { attributes, listeners, setNodeRef: setRowRef, isDragging } = useDraggable({
    id: rigRowId(index),
    data: { type: 'rig-row', row: index, name: row.name, tileCount: tiles.length } satisfies RigRowDragData,
    disabled: !editable,
  })
  const { setNodeRef: setBodyRef, isOver } = useDroppable({
    id: rigRowBodyId(index),
    data: {
      type: 'rig-drop',
      target: { kind: 'tile', at: { row: index, tile: tiles.length } },
      depth: RIG_DROP_DEPTH.rowBody,
    } satisfies RigDropData,
    disabled: !editable || draggingRow || foreign,
  })

  const slotIndex =
    editable && !draggingRow && target?.kind === 'tile' && target.at.row === index ? target.at.tile : null

  const cells: React.ReactNode[] = []
  tiles.forEach((stored, tileIndex) => {
    if (slotIndex === tileIndex) cells.push(<RigDropSlot key="drop-slot" compact={compact} />)
    const at: RigTileAddress = { row: index, tile: tileIndex }
    const key = tileKeyOf(stored, at)
    for (const rendered of expandTile(stored, key)) {
      cells.push(
        <RigTile
          key={rendered.key}
          tile={rendered}
          at={inDocument ? at : null}
          stored={inDocument ? stored : null}
          presence={presenceOf(rendered)}
          wholeSelected={wholeSelected(rendered)}
          selectedCells={selectedCells}
          editing={editing}
          compact={compact}
          lookup={lookup}
          onPress={() => onPress(rendered)}
          onPressCell={(element) => onPressCell({ type: 'fixture', key: element.key })}
          onRemove={() => commit((rig) => removeTile(rig, at))}
          onSetMode={(mode: BuskRigCellMode, split?: number) =>
            commit((rig) => setTile(rig, at, { cellMode: mode, cellSplit: split ?? null }))
          }
          onRename={(label) => commit((rig) => relabelTile(rig, at, label))}
        />,
      )
    }
  })
  if (slotIndex === tiles.length) cells.push(<RigDropSlot key="drop-slot" compact={compact} />)

  const style = { gridColumn: `span ${span} / span ${span}` } as CSSProperties

  return (
    <>
      {editing && draggingRow && !isDragging && inDocument && <RowGap index={index} />}
      <div
        ref={setRowRef}
        data-rig-line={line}
        data-rig-row-flow={flow}
        style={style}
        className={cn('flex min-w-0 flex-col gap-1', isDragging && 'opacity-40')}
      >
        <div className="flex min-h-5 items-center gap-2">
          {editable && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${row.name || 'row'}`}
              className="shrink-0 cursor-grab touch-none text-muted-foreground"
            >
              <GripVertical className="size-3.5" />
            </button>
          )}
          {editable ? (
            <NameField
              value={row.name}
              label="Row name"
              placeholder="Row"
              onSave={(name) => commit((rig) => renameRow(rig, index, name))}
              className="min-w-[6rem] max-w-[16rem] flex-1"
            />
          ) : (
            <span className="truncate text-[11px] font-semibold text-muted-foreground">{row.name}</span>
          )}
          {editable && (
            <RowMenu
              row={row}
              onLayout={(patch) => commit((rig) => setRowLayout(rig, index, patch))}
              onRemove={() => commit((rig) => removeRow(rig, index))}
            />
          )}
        </div>
        <div
          ref={setBodyRef}
          data-rig-row-body={stacked ? 'stacked' : flow.toLowerCase()}
          className={cn(
            rowBodyClass(flow, stacked),
            isOver && editable && !draggingRow && !foreign && 'rounded-lg bg-primary/5 ring-1 ring-inset ring-primary/40',
          )}
        >
          {cells}
        </div>
        {editable && (
          <HandPlaceStrip
            target="rig-row"
            where={row.name}
            amongDropTargets
            onPlace={(held) => onPlace(index, row.name, held)}
          />
        )}
      </div>
    </>
  )
}

/**
 * The row's menu while editing — the bank's own, on the row: its **width** share, its **flow**,
 * and *Remove row* last. The width and flow are the row's rather than a column's here, because a
 * rig has no columns: a row *is* the box, and its width says how much of a line it takes.
 */
function RowMenu({
  row,
  onLayout,
  onRemove,
}: {
  row: BuskRigRow
  onLayout: (patch: { flow?: BuskFlow; width?: number }) => void
  onRemove: () => void
}) {
  const width = rowWidth(row)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Options for row ${row.name || 'row'}`}
          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Row width</DropdownMenuLabel>
        <div className="flex gap-0.5 px-1 pb-1" role="group" aria-label="Row width">
          {BUSK_WIDTHS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === width}
              onClick={() => onLayout({ width: option })}
              className={cn('rounded px-2 py-1 text-xs hover:bg-accent', option === width && 'bg-muted font-semibold')}
            >
              {BUSK_WIDTH_LABELS[option]}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={rowFlow(row)} onValueChange={(flow) => onLayout({ flow: flow as BuskFlow })}>
          {BUSK_FLOWS.map((flow) => (
            <DropdownMenuRadioItem key={flow} value={flow}>
              Flow: {BUSK_FLOW_LABELS[flow]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          Remove row
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The strip a lifted row lands on — before row `index`, or after the last for `rows.length`. */
function RowGap({ index }: { index: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: rigRowGapId(index),
    data: { type: 'rig-drop', target: { kind: 'row-gap', row: index }, depth: RIG_DROP_DEPTH.rowGap } satisfies RigDropData,
  })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        // A whole line of the band's grid, whatever the rows around it span.
        'col-span-12 grid h-[22px] place-items-center rounded-lg border-2 border-dashed text-[10px] font-semibold transition-colors',
        isOver ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
      )}
    >
      move row here
    </div>
  )
}

/**
 * Where a tile starts a new row. It **is** `+ Row`: the server refuses an empty row, so a row
 * cannot be minted and then filled — it is minted *by* the first thing dropped into it.
 */
function NewRowZone({ disabled }: { disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: RIG_NEW_ROW_ID,
    data: { type: 'rig-drop', target: { kind: 'new-row' }, depth: RIG_DROP_DEPTH.newRow } satisfies RigDropData,
    disabled,
  })
  return (
    <div
      ref={setNodeRef}
      data-rig-new-row
      className={cn(
        'mt-1.5 grid h-10 place-items-center rounded-lg border-2 border-dashed text-[11px] font-medium transition-colors',
        disabled ? 'border-border/50 text-muted-foreground/50' : isOver ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
      )}
    >
      + Row · drop a target here to start a new row
    </div>
  )
}

/**
 * Registered at module scope, so `Layout.tsx`'s one overlay draws a lifted rig tile, row or
 * palette target without the app shell importing the band. Frozen and hookless, by the overlay's
 * rule.
 */
registerDragOverlay((active) => {
  const data = rigDragData(active)
  if (data == null) return null
  if (data.type === 'rig-row') {
    return (
      <div
        className="w-[150px] rounded-lg border border-primary bg-card p-2.5 opacity-90 shadow-lg"
        style={{ transform: 'rotate(-2deg)' }}
      >
        <div className="truncate text-[11px] font-semibold">{data.name || 'Row'}</div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {data.tileCount} {data.tileCount === 1 ? 'tile' : 'tiles'}
        </div>
      </div>
    )
  }
  return (
    <div
      className="flex h-13 w-[148px] items-center rounded-lg border border-primary bg-card px-3.5 text-sm opacity-90 shadow-lg"
      style={{ transform: 'rotate(-2deg)' }}
    >
      <span className="truncate">{data.name}</span>
    </div>
  )
})
