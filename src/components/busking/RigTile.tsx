import { useRef } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Layers, LayoutGrid, MoreHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import type { FixturePatch } from '@/api/patchApi'
import type { BuskRigCellMode, BuskRigElement, BuskRigTile } from '@/api/buskRigApi'
import type { Fixture, FixtureTypeInfo } from '@/store/fixtures'
import { FixtureAppearanceSource, type FixtureAppearance } from '@/components/fixtures/fixtureAppearance'
import { rigTileId, type RenderTile, type RigTileAddress } from '@/lib/buskRig'
import type { EffectPresence } from './buskingTypes'
import { RIG_DROP_DEPTH, type RigDropData, type RigTileDragData } from './buskDnd'
import { useRigEdit } from './RigEditProvider'

/**
 * One rig tile: a group, a fixture, one cell, or a run of cells.
 *
 * **A press is a plain toggle**, the target band's rule — the pad-shaped selection vocabulary
 * (`padPresenceClass`'s three rungs) so a lit tile means the same thing a lit pad does. A
 * multi-head fixture's tile draws its cells as **read-only pips** until session 7 makes them
 * tappable; a tap on the tile is the whole fixture, as today, and the tile reads `some` when part
 * of its cells is selected elsewhere (a marquee on the programmer, the other screen).
 *
 * **The live bar is the stage's own colour**, through `FixtureAppearanceSource` — the same
 * dispatch the 2D plot, the DOM marker and the mini-stage read (`docs/stage-vis-engineering.md`
 * §Fixture appearance), so a tile never disagrees with the stage about what a head is doing. One
 * leaf per fixture tile, mounted here rather than in the band, because the render prop's leaf
 * carries a fixed hook set per colour source and the band would otherwise mount one per head
 * whether or not the head is on a visible row. A group has no channels of its own and draws no bar.
 */

/** What a fixture tile's appearance leaf needs, looked up once by the band and threaded down. */
export interface TileLookup {
  patchByKey: ReadonlyMap<string, FixturePatch>
  fixtureByKey: ReadonlyMap<string, Fixture>
  typeByKey: ReadonlyMap<string, FixtureTypeInfo>
}

export interface RigTileProps {
  tile: RenderTile
  /** Its address in the built document, or null for a show-all fallback tile (never in the document). */
  at: RigTileAddress | null
  /** The stored tile this render tile came from, for the cell-mode menu. Null on a fallback tile. */
  stored: BuskRigTile | null
  presence: EffectPresence
  /** Element keys currently selected, for the pips and the `4 of 8` count. */
  selectedCells: ReadonlySet<string>
  editing: boolean
  /** The phone board: 48px tiles. */
  compact: boolean
  lookup: TileLookup
  onPress: () => void
  onRemove: () => void
  onSetMode: (mode: BuskRigCellMode, split?: number) => void
}

const TILE_CLASS =
  'relative flex items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 select-none touch-manipulation text-sm transition-all'

function presenceClass(presence: EffectPresence) {
  return cn(
    presence === 'none' && 'border-border bg-card hover:bg-accent/50',
    presence === 'some' && 'border-primary/40 bg-primary/10 hover:bg-primary/15',
    presence === 'all' && 'border-primary bg-primary/20 ring-1 ring-primary/50 hover:bg-primary/25',
  )
}

/** The cells a tile draws: every cell of a `PIPS` fixture, a run's cells, the one cell of a cell tile. */
function cellsOf(tile: RenderTile): BuskRigElement[] {
  if (tile.kind === 'fixture') return tile.pips ? tile.cells : []
  if (tile.kind === 'run') return tile.cells
  if (tile.kind === 'cell') return [tile.element]
  return []
}

export function RigTile({
  tile,
  at,
  stored,
  presence,
  selectedCells,
  editing,
  compact,
  lookup,
  onPress,
  onRemove,
  onSetMode,
}: RigTileProps) {
  const { source, foreign } = useRigEdit()
  const draggingRow = source?.type === 'rig-row'
  // Per **render** tile, never per stored tile: see `rigTileId`.
  const id = at == null ? `rtile-fallback:${tile.key}` : rigTileId(at, tile.key)
  const inDocument = at != null

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
    data: { type: 'rig-tile', at: at ?? { row: -1, tile: -1 }, name: tile.name } satisfies RigTileDragData,
    disabled: !editing || !inDocument,
  })
  // Not a droppable while a row is lifted (a row lands on the row gaps) or while anything foreign
  // is — the page's own two rules.
  const { setNodeRef: setDropRef } = useDroppable({
    id,
    data: {
      type: 'rig-drop',
      target: { kind: 'tile', at: at ?? { row: -1, tile: -1 } },
      depth: RIG_DROP_DEPTH.tile,
    } satisfies RigDropData,
    disabled: !editing || !inDocument || draggingRow || foreign,
  })
  const nodeRef = useRef<HTMLElement | null>(null)
  const setRef = (node: HTMLElement | null) => {
    setDragRef(node)
    setDropRef(node)
    nodeRef.current = node
  }

  const cells = cellsOf(tile)
  const selectedInTile = cells.filter((cell) => selectedCells.has(cell.key)).length
  const isGroup = tile.kind === 'group'
  const Icon = isGroup ? Layers : LayoutGrid
  const count =
    isGroup
      ? String(tile.group.memberCount)
      : tile.kind === 'fixture' && tile.cells.length > 0
        ? selectedInTile > 0 && presence !== 'all'
          ? `${selectedInTile} of ${tile.cells.length}`
          : String(tile.cells.length)
        : null

  const modeMenu =
    editing && stored != null && stored.kind === 'FIXTURE' && stored.elementKey == null && (stored.patch?.elements?.length ?? 0) > 1

  return (
    <div ref={setRef} data-rig-tile-id={id} className={cn('relative shrink-0', isDragging && 'opacity-40')}>
      <button
        type="button"
        {...(editing && inDocument ? attributes : {})}
        {...(editing && inDocument ? listeners : {})}
        aria-pressed={presence !== 'none'}
        aria-label={tile.name}
        title={tile.name}
        onClick={editing ? undefined : onPress}
        className={cn(
          TILE_CLASS,
          compact ? 'h-12 min-w-[120px]' : 'h-13 min-w-[148px]',
          presenceClass(presence),
          editing ? (inDocument ? 'cursor-grab' : 'cursor-default') : 'active:scale-[0.96]',
          // Room for the bar and the pips under the name.
          cells.length > 0 && 'pb-2.5',
        )}
      >
        <Icon className={cn('size-3.5 shrink-0', presence !== 'none' ? 'text-primary' : 'text-muted-foreground')} />
        <span className="flex-1 truncate text-left">{tile.name}</span>
        {count != null && (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        {!isGroup && <TileLive tile={tile} cells={cells} selectedCells={selectedCells} lookup={lookup} />}
      </button>
      {editing && inDocument && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${tile.name} from the rig`}
          className="absolute -top-[7px] -left-[7px] grid size-[18px] place-items-center rounded-full border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-2.5" strokeWidth={2.5} />
        </button>
      )}
      {modeMenu && stored != null && (
        <CellModeMenu tile={stored} name={tile.name} onSetMode={onSetMode} onRemove={onRemove} />
      )}
    </div>
  )
}

/**
 * The four cell modes (D3), on the tile rather than in a mode: the whole fixture with pips, the
 * whole fixture only, one tile per cell, or `HALVES` with its split — 2 up to the cell count, which
 * is exactly the range the server accepts.
 */
function CellModeMenu({
  tile,
  name,
  onSetMode,
  onRemove,
}: {
  tile: BuskRigTile
  name: string
  onSetMode: (mode: BuskRigCellMode, split?: number) => void
  onRemove: () => void
}) {
  const cellCount = tile.patch?.elements?.length ?? 0
  const splits: number[] = []
  for (let n = 2; n <= cellCount; n += 1) splits.push(n)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Cell mode for ${name}`}
          className="absolute -top-[7px] -right-[7px] grid size-[18px] place-items-center rounded-full border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <MoreHorizontal className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          {tile.patch?.name} · {cellCount} cells
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={tile.cellMode}
          onValueChange={(mode) => {
            if (mode === 'HALVES') onSetMode('HALVES', tile.cellSplit ?? 2)
            else onSetMode(mode as BuskRigCellMode)
          }}
        >
          <DropdownMenuRadioItem value="PIPS">Whole fixture, cells on the tile</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="WHOLE">Whole fixture only</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="PER_CELL">One tile per cell · {cellCount} tiles</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="HALVES">Split into…</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <div className="flex flex-wrap gap-0.5 px-1 pb-1">
          {splits.map((split) => (
            <button
              key={split}
              type="button"
              aria-pressed={tile.cellMode === 'HALVES' && tile.cellSplit === split}
              onClick={() => onSetMode('HALVES', split)}
              className={cn(
                'rounded px-2 py-1 text-xs tabular-nums hover:bg-accent',
                tile.cellMode === 'HALVES' && tile.cellSplit === split && 'bg-muted font-semibold',
              )}
            >
              {split}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          Remove from rig
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The 3px live bar and, for a `PIPS` tile, the pips — one appearance leaf per fixture tile.
 *
 * A cell or run tile draws only its own cells' colours, read off the parent's per-element
 * `segments` by the element's position in the patch's cell list — an index into a list the desk
 * ordered, never a number parsed out of the key.
 */
function TileLive({
  tile,
  cells,
  selectedCells,
  lookup,
}: {
  tile: Exclude<RenderTile, { kind: 'group' }>
  cells: BuskRigElement[]
  selectedCells: ReadonlySet<string>
  lookup: TileLookup
}) {
  const patch = lookup.patchByKey.get(tile.patch.key)
  if (patch == null) return null
  const fixture = lookup.fixtureByKey.get(tile.patch.key)
  const fixtureType = fixture == null ? undefined : lookup.typeByKey.get(fixture.typeKey)
  const allCells = tile.patch.elements ?? []
  return (
    <FixtureAppearanceSource patch={patch} fixture={fixture} fixtureType={fixtureType}>
      {(appearance) => (
        <LiveBar
          appearance={appearance}
          slices={
            tile.kind === 'fixture'
              ? null
              : cells.map((cell) => allCells.findIndex((candidate) => candidate.key === cell.key))
          }
          pips={tile.kind === 'fixture' && tile.pips ? cells : []}
          allCells={allCells}
          selectedCells={selectedCells}
        />
      )}
    </FixtureAppearanceSource>
  )
}

function sliceStyle(appearance: FixtureAppearance, index: number | null) {
  const segment = index == null || index < 0 ? undefined : appearance.segments?.[index]
  const color = segment?.css ?? appearance.color
  const intensity = segment?.intensity ?? appearance.intensity
  return { background: color, opacity: 0.15 + 0.85 * Math.max(0, Math.min(1, intensity)) }
}

function LiveBar({
  appearance,
  slices,
  pips,
  allCells,
  selectedCells,
}: {
  appearance: FixtureAppearance
  /** Segment indices to draw the bar from, or null for the whole fixture's colour. */
  slices: number[] | null
  pips: BuskRigElement[]
  allCells: BuskRigElement[]
  selectedCells: ReadonlySet<string>
}) {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[3px] overflow-hidden rounded-b-lg">
        {slices == null ? (
          <span className="flex-1" style={sliceStyle(appearance, null)} />
        ) : (
          slices.map((index, i) => <span key={i} className="flex-1" style={sliceStyle(appearance, index)} />)
        )}
      </span>
      {pips.length > 0 && (
        <span
          aria-hidden
          data-rig-pips
          className="pointer-events-none absolute right-3.5 bottom-[5px] left-3.5 flex gap-0.5"
        >
          {pips.map((cell) => {
            const index = allCells.findIndex((candidate) => candidate.key === cell.key)
            return (
              <span
                key={cell.key}
                className={cn(
                  'h-1 flex-1 rounded-[1px]',
                  selectedCells.has(cell.key) && 'ring-1 ring-primary',
                )}
                style={sliceStyle(appearance, index)}
              />
            )
          })}
        </span>
      )}
    </>
  )
}

/** The tile-shaped placeholder that opens where a drop would land. */
export function RigDropSlot({ compact }: { compact: boolean }) {
  return (
    <div
      aria-hidden
      // Never a droppable and never hit-testable — `BuskDropSlot`'s reason.
      className={cn(
        'pointer-events-none shrink-0 rounded-lg border-2 border-dashed border-primary bg-primary/5',
        compact ? 'h-12 w-[120px]' : 'h-13 w-[148px]',
      )}
    />
  )
}
