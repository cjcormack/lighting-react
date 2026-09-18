import { useCallback, useMemo, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ChevronDown, GripVertical, Minus, MoreHorizontal, Plus, X } from 'lucide-react'
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
import type { HeldRecord } from '@/api/handApi'
import type { BuskRigCellMode, BuskRigRow } from '@/api/buskRigApi'
import { useGroupListQuery } from '@/store/groups'
import { usePatchListQuery } from '@/store/patches'
import { useLocateStateQuery, useToggleLocateMutation, type LocateTarget } from '@/store/locate'
import { useBuskRigQuery } from '@/store/busk'
import { useFixtureLookup } from '@/hooks/useFixtureLookup'
import { useHandPlace } from '@/store/hand'
import { setBuskFocus, setBuskRigRows, setBuskSheet, useBuskRigRows } from '@/lib/buskWindow'
import {
  applyDrop,
  effectiveRig,
  expandTile,
  removeRow,
  removeTile,
  renameRow,
  rigIdsFromPatches,
  rigRowBodyId,
  rigRowGapId,
  rigRowId,
  RIG_NEW_ROW_ID,
  rowTiles,
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
 * **A press is a plain toggle**, as it was. The label row is the design's (`Main.dc.html`): the
 * selection summary, the family pill, the desk chip, then the verbs — *Cells* drawn **inert**
 * until session 7 lands it, *Spread…* (opens the side sheet's Spread tab), Locate, Highlight,
 * Clear — and the `n of N rows`
 * handle under the rows. Below `md` the band is one row with a row chip and the verbs in a menu
 * (the phone board), and there is no editing: the palette is not drawn there either.
 *
 * **The handle reads and writes the window's `busk.rigRows`** (`lib/buskWindow.ts`), clamped to
 * the rig on read, and **snaps at both ends** (busk-further plan D6): one more than the last row
 * is Rig focus, one fewer than the first is Pads focus, so the segmented control on the page strip
 * and this handle are one setting. In **Rig focus** the band takes `focus="rig"`: every row, the
 * band filling the body and scrolling, no handle — below `md` too, where it is the whole rig
 * stacked and replaces the narrow-width target sheet (D15). Edit mode shows every row regardless,
 * since a hidden row cannot take a drop.
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
  editing: boolean
  /** Below `md`: one row with a row chip, 48px tiles, the verbs in a menu. */
  compact: boolean
  /** Split shows `busk.rigRows` rows under the handle; Rig fills the body with every row. */
  focus: 'split' | 'rig'
}

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
  editing,
  compact,
  focus,
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

  // The handle: 1…N whole rows (D6), the window's fact clamped to the rig. Edit mode and Rig focus
  // show every row — a hidden row cannot take a drop, and Rig focus *is* the whole rig.
  const shown = useBuskRigRows(effective.rows.length)
  const everyRow = editing || focus === 'rig'
  const [compactRow, setCompactRow] = useState(0)
  const compactIndex = Math.min(compactRow, Math.max(0, effective.rows.length - 1))
  const visibleRows = everyRow
    ? effective.rows
    : compact
      ? effective.rows.slice(compactIndex, compactIndex + 1)
      : effective.rows.slice(0, shown)
  const rowOffset = !everyRow && compact ? compactIndex : 0
  // One fewer than the first row is Pads, one more than the last is Rig: the control and the
  // handle are one setting.
  const fewerRows = () => (shown <= 1 ? setBuskFocus('pads') : setBuskRigRows(shown - 1))
  const moreRows = () => (shown >= effective.rows.length ? setBuskFocus('rig') : setBuskRigRows(shown + 1))

  const selectedCells = useMemo(() => {
    const cells = new Set<string>()
    for (const target of selectedTargets.values()) {
      if (target.type === 'fixture' && target.element != null) cells.add(target.key)
    }
    return cells
  }, [selectedTargets])

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
      if (tile.kind === 'fixture' && tile.cells.some((cell) => selectedCells.has(cell.key))) return 'some'
      return 'none'
    },
    [selectedTargets, selectedCells],
  )

  // A run is one pad: pressed from `all` it goes off, from anything else it goes on — toggling
  // each cell independently would carry a half-lit run to its complement, which is `some` again.
  const press = useCallback(
    (tile: RenderTile) => {
      if (tile.kind !== 'run') {
        onToggle(tile.target)
        return
      }
      const lit = tile.targets.filter((target) => selectedTargets.has(targetKey(target)))
      if (lit.length === tile.targets.length) tile.targets.forEach(onToggle)
      else tile.targets.filter((target) => !selectedTargets.has(targetKey(target))).forEach(onToggle)
    },
    [onToggle, selectedTargets],
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

  return (
    <div
      data-rig-band={focus}
      className={cn(
        'shrink-0 border-b px-4 pt-2.5 pb-2',
        editing && 'bg-muted/20',
        focus === 'rig' && !editing && 'min-h-0 flex-1 overflow-y-auto',
      )}
    >
      {/* ── Label row ── */}
      {/* `flex-wrap`: the verbs are a fixed ~330px and the summary gives, so at a tablet width the
          row overflowed into the speed rail with the summary squeezed to nothing (seen on the desk
          at 800px). Wrapped, the verbs take a second line and the summary keeps a readable floor. */}
      <div data-rig-label-row className="mb-2 flex min-h-6 flex-wrap items-center gap-x-2.5 gap-y-1">
        <BuskLabel>Rig</BuskLabel>
        {compact && !everyRow && effective.rows.length > 1 && (
          <RowChip rows={effective.rows} index={compactIndex} onSelect={setCompactRow} />
        )}
        {editing ? (
          <span className="min-w-[8rem] flex-1 truncate text-[11px] text-muted-foreground">
            Editing · drag targets from the palette, rows reorder by their grip
          </span>
        ) : (
          <span className="min-w-[8rem] flex-1 truncate text-[11px] text-muted-foreground">{summary}</span>
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
        {/* The Cells chip is session 7's (`selection.subselect`); drawn so the row has its shape,
            inert so it promises nothing the desk cannot do from this window yet. */}
        {!editing && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled
            title="Sub-selection — All · Odd · Even · Next · Prev — arrives with session 7"
          >
            Cells: All
          </Button>
        )}
        {editing ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setConfirmingReset(true)}
            disabled={effective.fallback}
            title="Remove every row: the rig goes back to every group then every fixture"
          >
            Show every target
          </Button>
        ) : compact ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-1.5" aria-label="Selection verbs">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setBuskSheet('spread')} title="Spread a value across the selection">
                Spread…
              </DropdownMenuItem>
              <DropdownMenuItem disabled={locateTargets.length === 0} onSelect={locateSelection}>
                {allLocated ? 'Release locate' : 'Locate'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={selected.length === 0} onSelect={onClear}>
                Clear
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            {/* *Spread…* is a selection verb beside Locate and Highlight: it opens the Spread tab,
                which reads the selection, and writes nothing but the sheet fact — below `md` the
                overlay carries the tab, so the same write opens it there. */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setBuskSheet('spread')}
              title="Spread a value across the selection"
            >
              Spread…
            </Button>
            <Button
              variant={allLocated ? 'default' : 'outline'}
              size="sm"
              className={cn('h-6 px-2 text-xs', allLocated && 'bg-sky-500 text-white hover:bg-sky-600')}
              onClick={locateSelection}
              disabled={locateTargets.length === 0}
              title={allLocated ? 'Release locate on the selection' : 'Locate the selection: white beam at centre'}
            >
              Locate
            </Button>
            <Button
              variant={highlight.isActive ? 'default' : 'outline'}
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={selected.length === 0}
              onPointerDown={highlight.press}
              onPointerUp={highlight.release}
              onPointerCancel={highlight.release}
              onPointerLeave={highlight.release}
              title="Hold: every selected dimmer to full"
            >
              Highlight
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onClear}
              disabled={selected.length === 0}
            >
              Clear
            </Button>
          </>
        )}
      </div>

      {/* ── Rows ── */}
      {nothingToShow && !editing ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No fixtures or groups configured</p>
      ) : (
        <div className={cn('flex flex-col gap-1.5', editing && effective.fallback && 'opacity-60')}>
          {editing && effective.fallback && effective.rows.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Showing every target — drop a target below to start building a rig.
            </p>
          )}
          {visibleRows.map((row, index) => (
            <RigRow
              key={row.uuid ?? row.localKey ?? `row-${index}`}
              row={row}
              index={rowOffset + index}
              inDocument={!effective.fallback}
              editing={editing}
              compact={compact}
              lookup={lookup}
              presenceOf={presenceOf}
              selectedCells={selectedCells}
              onPress={press}
              onPlace={placeHeld}
            />
          ))}
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

      {/* ── The rows handle ── */}
      {!everyRow && !compact && effective.rows.length > 1 && (
        <div className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            aria-label="Show one row fewer"
            title={shown <= 1 ? 'Fold the rig: Pads focus' : 'Show one row fewer'}
            onClick={fewerRows}
          >
            <Minus className="size-3" />
          </Button>
          <span data-rig-rows-handle className="tabular-nums">
            {shown} of {effective.rows.length} rows
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            aria-label="Show one row more"
            title={shown >= effective.rows.length ? 'Every row, full size: Rig focus' : 'Show one row more'}
            onClick={moreRows}
          >
            <Plus className="size-3" />
          </Button>
        </div>
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

function RigRow({
  row,
  index,
  inDocument,
  editing,
  compact,
  lookup,
  presenceOf,
  selectedCells,
  onPress,
  onPlace,
}: {
  row: BuskRigRow
  index: number
  /** False for a show-all fallback row, which nothing can address. */
  inDocument: boolean
  editing: boolean
  compact: boolean
  lookup: TileLookup
  presenceOf: (tile: RenderTile) => EffectPresence
  selectedCells: ReadonlySet<string>
  onPress: (tile: RenderTile) => void
  onPlace: (row: number, rowName: string, held: HeldRecord) => void
}) {
  const { source, target, foreign, commit } = useRigEdit()
  const editable = editing && inDocument
  const draggingRow = source?.type === 'rig-row'
  const tiles = rowTiles(row)

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
          selectedCells={selectedCells}
          editing={editing}
          compact={compact}
          lookup={lookup}
          onPress={() => onPress(rendered)}
          onRemove={() => commit((rig) => removeTile(rig, at))}
          onSetMode={(mode: BuskRigCellMode, split?: number) =>
            commit((rig) => setTile(rig, at, { cellMode: mode, cellSplit: split ?? null }))
          }
        />,
      )
    }
  })
  if (slotIndex === tiles.length) cells.push(<RigDropSlot key="drop-slot" compact={compact} />)

  return (
    <>
      {editing && draggingRow && !isDragging && inDocument && <RowGap index={index} />}
      <div ref={setRowRef} className={cn('flex flex-col gap-1', isDragging && 'opacity-40')}>
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
              className="max-w-[16rem] flex-1"
            />
          ) : (
            <span className="truncate text-[11px] font-semibold text-muted-foreground">{row.name}</span>
          )}
          {editable && (
            <button
              type="button"
              onClick={() => commit((rig) => removeRow(rig, index))}
              aria-label={`Remove row ${row.name || 'row'}`}
              className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div
          ref={setBodyRef}
          className={cn(
            'flex gap-2 overflow-x-auto pb-1',
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
        'grid h-[22px] place-items-center rounded-lg border-2 border-dashed text-[10px] font-semibold transition-colors',
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
