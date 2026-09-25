import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Lock, LockOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { lightingApi } from '@/api/lightingApi'
import { DESK_OFFLINE_LABEL } from '@/api/wsGesture'
import { useChannelValue } from '@/hooks/usePropertyValues'
import { useContainerBand } from '@/hooks/useContainerBand'
import { useUpdateChannelMutation } from '@/store/channels'
import { useParkChannelMutation, useUnparkChannelMutation } from '@/store/park'
import { ignoreReportedError } from '@/store/errorToastMiddleware'
import { ownershipCellClass, OWNERSHIP_LABELS } from '@/components/fixtures-list/ownership'
import { OwnershipSwatch } from '@/components/fixtures-list/OwnershipLegend'
import { SheetPage } from '@/components/sheet/SheetPage'
import { aggregateCellOwnership, type CellOwnership } from '@/components/fixtures-list/useRowOwnership'
import { CellSelectionActions } from '@/components/sheet/CellSelectionActions'
import { SpreadPanel, type SpreadPlan } from '@/components/editor/SpreadPanel'
import { SelectionBar } from '@/components/sheet/SelectionBar'
import { SheetTable } from '@/components/sheet/SheetTable'
import { useSheet } from '@/components/sheet/useSheet'
import { LevelCell } from '@/components/sheet/cells/LevelCell'
import { PHONE_FOLDED_CLASS, WORD_CLASS } from '@/components/sheet/toolbarFolds'
import type { SheetColumn, SheetRow } from '@/components/sheet/sheetModel'
import type { ChannelMappingEntry, ChannelPropertyKey } from '@/api/channelMappingApi'
import type { ProgrammerChannelEntry, ProgrammerKeyState } from '@/api/programmerWsApi'

/** The row head, 48px, and the floor a cell needs to hold `001 Front PAR` over a value. */
const ROW_HEAD_WIDTH = 48
const MIN_CELL_WIDTH = 64
/** The DMX sheet's cells carry two lines, so its rows are 44 rather than 36. */
export const DMX_ROW_HEIGHT = 44

/**
 * **How many addresses a row holds, widest first** — sixteen on a desk, eight on a tablet, four on
 * a phone. The address space is the thing being read and a fixture's footprint runs across a row,
 * so the count halves rather than taking any value: every common footprint divides into these, and
 * a row's base stays a round address (`001`, `009`, `017`) whichever arm is showing.
 *
 * Each needs `48 + 64 × n` of container to be drawn without scrolling sideways, and the widest that
 * fits is the one used. Exported for `DmxSheet.test.tsx`, which pins the arms against the floors.
 */
export const DMX_ROW_WIDTHS = [16, 8, 4] as const

/** What `DMX_ROW_WIDTHS` needs of the container, in the same order. */
const DMX_ROW_WIDTH_FLOORS = DMX_ROW_WIDTHS.map((n) => ROW_HEAD_WIDTH + MIN_CELL_WIDTH * n)

export type DmxColumnKey = `c${number}`

/** One row of `columnCount` addresses, from `base`. */
export interface DmxRow extends SheetRow {
  base: number
}

function rowsFor(columnCount: number): DmxRow[] {
  return Array.from({ length: 512 / columnCount }, (_, r) => ({
    id: `row:${r * columnCount + 1}`,
    base: r * columnCount + 1,
  }))
}

/** An address no property drives — nothing to subscribe to. */
const NO_KEYS: readonly ChannelPropertyKey[] = []

const PARKED_OWNERSHIP: CellOwnership = { source: 'parked', touched: false, isUniform: true, owners: [] }
const BASELINE_OWNERSHIP: CellOwnership = { source: 'baseline', touched: false, isUniform: true, owners: [] }

/**
 * The programmer's key state for every property that drives an address — the desk's list, off
 * the channel-mapping frame (`ChannelMappingEntry.properties`), not a lookup rebuilt here.
 *
 * It was rebuilt here once, from the fixture descriptors, and it drifted from the desk in three
 * ways at once: bundled white/amber/UV were filed under the colour property (the desk lifts an
 * `updateChannel` write on one to its *own* slider, so a value set on this sheet never ringed), an
 * element's white was missing altogether (its colour descriptor names none), and a pan axis was
 * read only as `position` (the desk lifts it to the `pan` slider). An address is routinely driven
 * through two keys — a bundled amber is both `amber` and part of `rgbColour` — so this holds one
 * state per key and the caller aggregates.
 *
 * **The snapshot is cached per subscription.** `getKeyState` builds a fresh object on every call,
 * and `useSyncExternalStore` compares snapshots by identity — handed that directly, it re-rendered
 * on every render, logged "getSnapshot should be cached" for every owned cell, and the moment a
 * write gave a channel a programmer entry the loop crossed React's update-depth limit and took
 * the page down. The array the subscription callbacks build is what is held, and it is replaced
 * only when the next callback lands — the same discipline `useProgrammerRowSnapshot` keeps for
 * the fixtures list. `keys` is the frame's own array, so its identity holds until the next
 * channel-mapping frame.
 */
function useChannelKeyStates(keys: readonly ChannelPropertyKey[]): readonly ProgrammerKeyState[] {
  const cache = useRef<{ keys: readonly ChannelPropertyKey[]; states: readonly ProgrammerKeyState[] } | null>(null)
  const fresh = useCallback(
    () => keys.map((key) => lightingApi.programmer.getKeyState(key.targetKey, key.propertyName)),
    [keys],
  )
  const read = useCallback((): readonly ProgrammerKeyState[] => {
    if (cache.current?.keys !== keys) cache.current = { keys, states: fresh() }
    return cache.current.states
  }, [fresh, keys])
  const subscribe = useCallback(
    (cb: () => void) => {
      if (keys.length === 0) return () => {}
      // Registration itself refreshes: `subscribeToKey` emits nothing on subscribe, so a push
      // landing between the render's `read()` and this effect would otherwise be held in a stale
      // cache for as long as that key stayed quiet. Re-reading here hands React's post-subscribe
      // snapshot check a fresh array — the same gap `useProgrammerRowSnapshot` closes with its
      // version bump, and for the same reason.
      cache.current = { keys, states: fresh() }
      const subs = keys.map((key, index) =>
        lightingApi.programmer.subscribeToKey(key.targetKey, key.propertyName, (state) => {
          const states = cache.current?.keys === keys ? [...cache.current.states] : fresh()
          states[index] = state
          cache.current = { keys, states }
          cb()
        }),
      )
      return () => subs.forEach((sub) => sub.unsubscribe())
    },
    [fresh, keys],
  )
  return useSyncExternalStore(subscribe, read, () => NO_STATES)
}

const NO_STATES: readonly ProgrammerKeyState[] = []

/**
 * Whether the programmer is blind — one subscription for the whole sheet, threaded to every cell
 * as a prop. Blind decides whether an entry is drawn as staged, so a cell's ownership has to move
 * when it flips; reading `isBlind()` inside each cell's memo would not, and 512 subscriptions to
 * the whole-state channel would be the cost `useProgrammerRowSnapshot` exists to avoid.
 *
 * Not `hooks/useProgrammerBlind`, which reads the same fact off the RTK `ProgrammerSummary`: this
 * one reads the WS layer's snapshot, the source `useChannelKeyStates` reads each cell's key state
 * from, so a cell's blind and its entry come from one place — the pairing `useRowOwnership` keeps
 * on the programmer's grid. It also keeps this sheet mountable with no store.
 */
function useWsProgrammerBlind(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const sub = lightingApi.programmer.subscribe(() => cb())
      return () => sub.unsubscribe()
    },
    () => lightingApi.programmer.isBlind(),
    () => false,
  )
}

const NO_SIDEBAND: readonly ProgrammerChannelEntry[] = []

/**
 * The programmer's channel **sideband** on this universe, by address — one subscription for the
 * sheet, threaded to each cell as a prop, for `useWsProgrammerBlind`'s reason.
 *
 * The sideband is where an `updateChannel` write lands when the desk cannot lift it to a property
 * (`handleUpdateChannel`): an address no property drives, a raw pan/tilt axis, and — since the
 * desk's covering lookup walks only a fixture's own properties — every address of a multi-head
 * fixture's heads. Provenance names none of the last two kinds' keys, so without this a value set
 * here on a pixel bar never rang. It is read *beside* the property keys, never instead of them
 * (`ProgrammerChannelEntry`'s docblock: the sideband is a supplement, not the programmer's output).
 */
function useWsProgrammerSideband(universe: number): ReadonlyMap<number, ProgrammerChannelEntry> {
  const channels = useSyncExternalStore(
    (cb) => {
      const sub = lightingApi.programmer.subscribe(() => cb())
      return () => sub.unsubscribe()
    },
    () => lightingApi.programmer.getState().channels,
    () => NO_SIDEBAND,
  )
  const last = useRef<{ universe: number; signature: string; map: ReadonlyMap<number, ProgrammerChannelEntry> } | null>(null)
  return useMemo(() => {
    const mine = channels.filter((entry) => entry.universe === universe)
    // Every `programmer.state` refetch hands a fresh array of fresh entries — and it is refetched
    // on the desk's provenance frames, which fire for any write on any universe. Keep the previous
    // map while this universe's slots are unchanged, so an unrelated busk does not rebuild the
    // columns and re-render every cell that carries a slot.
    const signature = mine.map((e) => `${e.channel}:${e.value}:${e.owner}:${e.touched}`).join('|')
    if (last.current?.universe === universe && last.current.signature === signature) return last.current.map
    const map = new Map<number, ProgrammerChannelEntry>()
    for (const entry of mine) map.set(entry.channel, entry)
    last.current = { universe, signature, map }
    return map
  }, [channels, universe])
}

/**
 * One address's owner. **Always an answer** — an address the desk names no property for reads
 * baseline like any idle one, where it used to read *nothing* and so drew undimmed, brighter than
 * the patched channels beside it.
 *
 * **One address, one owner.** The keys driving it can disagree — amber programmer-owned through its
 * slider while a cue holds `rgbColour` — but the wire carries one byte, and it is the strongest
 * layer's; `aggregateCellOwnership` already ranks them. So the dashed "mixed" ring, which on the
 * programmer's grid means *these heads disagree*, is not drawn here: it would mark every channel an
 * operator set on a fixture whose colour a cue also holds.
 *
 * **A sideband slot promotes an address to the programmer over a cue or baseline, and over nothing
 * else.** Programmer output composes over the cue layers on the wire (`FxTarget.composeProgrammerOver`),
 * so a raw write beats a cue. But park beats everything, and an `effect` verdict stands: the desk
 * attributes a sideband slot to the property covering its channel before deciding a key's winner,
 * and a programmer-band effect deliberately outranks the programmer there (`ProvenanceService`) —
 * so for any address the desk can name, an `effect` answer has already weighed the sideband.
 */
function useChannelOwnership(
  keys: readonly ChannelPropertyKey[],
  sideband: ProgrammerChannelEntry | undefined,
  parked: boolean,
  blind: boolean,
): CellOwnership {
  const states = useChannelKeyStates(keys)
  return useMemo(() => {
    if (parked) return PARKED_OWNERSHIP
    const fromKeys =
      states.length === keys.length
        ? aggregateCellOwnership(keys, blind, (targetKey, propertyName) => {
            const index = keys.findIndex((k) => k.targetKey === targetKey && k.propertyName === propertyName)
            return states[index] ?? {}
          })
        : undefined
    if (sideband && fromKeys?.source !== 'parked' && fromKeys?.source !== 'effect') {
      const owners = fromKeys?.source === 'programmer' ? fromKeys.owners : []
      return {
        source: 'programmer',
        touched: sideband.touched || (fromKeys?.source === 'programmer' && fromKeys.touched),
        isUniform: true,
        owners: owners.includes(sideband.owner) ? owners : [...owners, sideband.owner],
      }
    }
    return fromKeys ? { ...fromKeys, isUniform: true } : BASELINE_OWNERSHIP
  }, [blind, keys, parked, sideband, states])
}

/** The face and the live value of one address, subscribed per cell. */
const DmxCell = memo(function DmxCell({
  universe,
  channelNo,
  mapping,
  first,
  tint,
  parkedValue,
  props,
}: {
  universe: number
  channelNo: number
  mapping: ChannelMappingEntry | undefined
  first: boolean
  tint: boolean
  /** Read by the wrapper's ownership hook, not by the face. */
  keys: readonly ChannelPropertyKey[]
  /** Read by the wrapper's ownership hook, not by the face. */
  sideband: ProgrammerChannelEntry | undefined
  /** Read by the wrapper's ownership hook, not by the face. */
  blind: boolean
  parkedValue: number | undefined
  props: Omit<React.ComponentProps<typeof LevelCell>, 'value' | 'face'>
}) {
  const live = useChannelValue({ universe, channelNo })
  const parked = parkedValue !== undefined
  const shown = parked ? parkedValue : live
  return (
    <LevelCell
      {...props}
      // The column's label is the header's `+7`; the editor is titled by what it edits.
      label="Value"
      value={live}
      face={
        <span
          className={cn(
            'flex h-full w-full flex-col justify-center gap-0.5 overflow-hidden rounded px-1.5',
            tint && 'bg-card/55',
          )}
        >
          <span className="flex items-center gap-1 whitespace-nowrap text-[9.5px] leading-none text-muted-foreground">
            <span className={cn('shrink-0 font-mono tabular-nums', first && 'font-semibold text-foreground')}>
              {String(channelNo).padStart(3, '0')}
            </span>
            <span className={cn('truncate', first && 'text-foreground')}>
              {mapping ? (first ? mapping.fixtureName : mapping.description) : ''}
            </span>
          </span>
          <span
            className={cn(
              'font-mono text-sm leading-none tabular-nums',
              parked ? 'font-medium text-amber-600 dark:text-amber-400' : shown > 0 ? 'font-semibold' : 'text-muted-foreground',
              !mapping && 'text-muted-foreground/40',
            )}
          >
            {shown}
          </span>
        </span>
      }
    />
  )
})

/**
 * The DMX sheet — one universe's 512 addresses as a 16-wide grid of 44px cells
 * (CLAUDE.md §Sheet kit): address and attribute on the first line, the raw 0–255 value on the
 * second, a fixture's footprint tinted as a run and named on its first cell, ownership rings as
 * the programmer's. Every cell is the same trigger: a marquee across `007`–`014` selects eight,
 * and ⏎, a double click or typing opens one slider for all of them.
 *
 * The grid has no row axis — a press on the row head is a press on nothing — so the selection
 * bar counts channels alone. Writes are `lightingApi.channels.update` per address, the
 * fire-and-forget gesture the cards use; Clear writes 0. There is no Edit/Done toggle here: a
 * deliberate double click or ⏎ is the guard the sliders needed. The desk being offline is this
 * sheet's read-only scope, in the four places the programmer's is.
 *
 * Raw 0–255 only, and no level bar behind the value — the readout toggles the desks all have are
 * left for later, stated rather than half-drawn.
 */
export function DmxSheet({
  universe,
  connected,
  mappings,
  parkValueMap,
}: {
  universe: number
  /** The desk is reachable — every write here is a WebSocket frame. */
  connected: boolean
  mappings: Record<number, ChannelMappingEntry> | undefined
  parkValueMap: ReadonlyMap<number, number>
}) {
  const [updateChannel] = useUpdateChannelMutation()
  const [parkChannel] = useParkChannelMutation()
  const [unparkChannel] = useUnparkChannelMutation()
  const blind = useWsProgrammerBlind()
  const sideband = useWsProgrammerSideband(universe)

  // **How many addresses fit on a row** — the widest arm the container can draw without scrolling
  // sideways. `useContainerBand` reads the floors straight off `DMX_ROW_WIDTHS`, so the arms and
  // the choice between them are one list rather than an array beside a hand-written ternary. A
  // container query could not answer it at all: the row *count* is JavaScript, not a class.
  const [measureRef, band] = useContainerBand(DMX_ROW_WIDTH_FLOORS)
  const columnCount = DMX_ROW_WIDTHS[band]
  const rows = useMemo(() => rowsFor(columnCount), [columnCount])
  const columnKeys = useMemo(
    () => Array.from({ length: columnCount }, (_, i) => `c${i}` as DmxColumnKey),
    [columnCount],
  )

  // A fixture's footprint is a run of consecutive addresses with one fixture key; its first cell
  // carries the name, and alternate runs are tinted so the reading eye can tell them apart.
  const runs = useMemo(() => {
    const first = new Set<number>()
    const tinted = new Set<number>()
    let previous: string | undefined
    let index = -1
    for (let n = 1; n <= 512; n++) {
      const key = mappings?.[n]?.fixtureKey
      if (key && key !== previous) {
        first.add(n)
        index += 1
      }
      if (key && index % 2 === 0) tinted.add(n)
      previous = key
    }
    return { first, tinted }
  }, [mappings])

  const write = useCallback(
    (channelNo: number, value: number) => {
      updateChannel({ universe, channelNo, value }).unwrap().catch(ignoreReportedError)
    },
    [universe, updateChannel],
  )

  const columns = useMemo<SheetColumn<DmxRow, DmxColumnKey>[]>(
    () =>
      columnKeys.map((key, i) => ({
        key,
        label: `+${i}`,
        // One kind for all sixteen: a marquee across a row is eight columns of one, and a level
        // typed into any of them is meant for every selected address.
        kind: 'level',
        width: `minmax(${MIN_CELL_WIDTH}px, 1fr)`,
        // No marks gutter: this cell draws no corner glyph, and the 18px made its ownership ring
        // a different box from the selection overlay drawn over it — see `SheetColumn.gutter`.
        gutter: false,
        // The channel number is the cell's identity; the live value is read by the cell itself.
        value: (row) => row.base + i,
        cell: (row, props) => {
          const channelNo = row.base + i
          return (
            <DmxCellWithOwnership
              universe={universe}
              channelNo={channelNo}
              mapping={mappings?.[channelNo]}
              first={runs.first.has(channelNo)}
              tint={runs.tinted.has(channelNo)}
              keys={mappings?.[channelNo]?.properties ?? NO_KEYS}
              sideband={sideband.get(channelNo)}
              blind={blind}
              parkedValue={parkValueMap.get(channelNo)}
              props={props as Omit<React.ComponentProps<typeof LevelCell>, 'value' | 'face'>}
            />
          )
        },
        write: (rows, value) => {
          if (typeof value !== 'number') return false
          for (const row of rows) write(row.base + i, value)
          return true
        },
        clear: (rows) => {
          for (const row of rows) write(row.base + i, 0)
        },
      })),
    [blind, columnKeys, mappings, parkValueMap, runs, sideband, universe, write],
  )

  const copy = useCallback(
    (cellCount: number) => {
      const cells = `${cellCount} selected channel${cellCount === 1 ? '' : 's'}`
      if (!connected) return { setTitle: DESK_OFFLINE_LABEL, clearTitle: DESK_OFFLINE_LABEL }
      return {
        setTitle: `Set the ${cells} (Enter)`,
        clearTitle: `Set the ${cells} to 0 (Backspace)`,
      }
    },
    [connected],
  )
  const permission = useMemo(() => ({ entry: connected, clear: connected }), [connected])
  const cellDisabled = useCallback(() => !connected, [connected])
  // No row axis: every press is a cell press, so the arrows always walk the cells and ⌘A selects
  // every address. `tableProps` carries the flag to the table, so this is the one place it is said.
  // The cells run `linear`: the kit walks rows × columns in order, which on this sheet is address
  // order in every arm, so a plain ← / → wraps from `016` onto `017`. Shift extends a rectangle, as
  // on every sheet: ↓ then → from `005` is `005`, `006`, `021`, `022` at sixteen wide.
  const sheet = useSheet<DmxRow, DmxColumnKey>({
    rows,
    columns,
    permission,
    copy,
    cellDisabled,
    noun: 'channel',
    selectsRows: false,
    cellFlow: 'linear',
  })
  const { cellCount } = sheet

  // **A row width change drops the cell selection, and drops it during the render that changes
  // it.** Re-basing the rows makes the same `rowId`/`col` pair name a different address — `row:17 ·
  // c3` is 020 at sixteen wide and 012 at eight — and nothing prunes it, because the row ids
  // survive (16, 8 and 4 are multiples, so every wide row id exists narrow too) and `byColumn`
  // reads the stored keys rather than the visible ones. In an effect that left one painted frame
  // where `selectedChannels` named an address nothing on screen showed as selected; React's own
  // "adjust state when a prop changes" reset re-renders before touching the DOM, so there is no
  // such frame. Clearing an empty selection is a no-op, so the mount costs nothing.
  const { clear: clearCells } = sheet.cellSelection
  const [bandAtSelection, setBandAtSelection] = useState(columnCount)
  if (bandAtSelection !== columnCount) {
    setBandAtSelection(columnCount)
    clearCells()
  }

  /**
   * The selected addresses, in address order — what Park, Unpark and Spread act on.
   *
   * Filtered by the columns this arm actually has, the way `useSheet`'s own `selectedColumns` and
   * `spreadPlans` are (they go through `columnByKey`): `columnGroups` is built from the stored cell
   * keys, so a `c9` held from the sixteen-wide arm would otherwise resolve to `base + 9` — a real
   * address, and one the operator can see no highlight on. The reset above means that cannot
   * outlive a render; this means it cannot be *read* even within one.
   */
  const selectedChannels = useMemo(() => {
    const known = new Set<string>(columnKeys)
    return sheet.columnGroups
      .filter(({ col }) => known.has(col))
      .flatMap(({ col, rows }) => rows.map((row) => row.base + Number(col.slice(1))))
      .sort((a, b) => a - b)
  }, [columnKeys, sheet.columnGroups])
  // One spread over every selected cell in address order, rather than one per column: a marquee
  // across eight addresses in a row is eight columns of one, and a spread is what that gesture
  // means. Raw bytes — a DMX address has no intent for the desk to resolve — walked by the panel
  // under its Curve · Order · Parts, with *Order: Reverse* where a Reverse checkbox was; over
  // Heads only, since an address has no cells.
  const spreadPlans = useMemo<SpreadPlan[]>(
    () =>
      selectedChannels.length === 0
        ? []
        : [
            {
              kind: 'raw',
              col: 'value',
              label: 'Value',
              count: selectedChannels.length,
              cellCount: 0,
              apply: (values) => {
                selectedChannels.forEach((channelNo, i) => write(channelNo, values[i]))
              },
            },
          ],
    [selectedChannels, write],
  )

  const parkedSelected = selectedChannels.filter((n) => parkValueMap.has(n))
  const unparkedSelected = selectedChannels.filter((n) => !parkValueMap.has(n))
  const parkSelection = () => {
    for (const channelNo of unparkedSelected) {
      parkChannel({ universe, channelNo, value: lightingApi.channels.get(universe, channelNo) })
        .unwrap()
        .catch(ignoreReportedError)
    }
  }
  const unparkSelection = () => {
    for (const channelNo of parkedSelected) {
      unparkChannel({ universe, channelNo }).unwrap().catch(ignoreReportedError)
    }
  }

  const verbs =
    cellCount > 0 ? (
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <CellSelectionActions
          copy={sheet.copy}
          permission={sheet.permission}
          setRef={sheet.setButtonRef}
          onSet={sheet.toggleCellEditor}
          onClear={sheet.clearSelectedCells}
          spread={
            <SpreadPanel
              host="popover"
              plans={spreadPlans}
              disabledReason={connected ? null : DESK_OFFLINE_LABEL}
              drivableHint="value"
              className={PHONE_FOLDED_CLASS}
            />
          }
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!connected || unparkedSelected.length === 0}
          onClick={parkSelection}
          title={
            !connected
              ? DESK_OFFLINE_LABEL
              : unparkedSelected.length === 0
                ? 'Every selected channel is already parked'
                : `Park ${unparkedSelected.length} channel${unparkedSelected.length === 1 ? '' : 's'} at their current values`
          }
        >
          <Lock className="size-3.5" />
          <span className={WORD_CLASS}>Park</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!connected || parkedSelected.length === 0}
          onClick={unparkSelection}
          title={
            !connected
              ? DESK_OFFLINE_LABEL
              : parkedSelected.length === 0
                ? 'No selected channel is parked'
                : `Unpark ${parkedSelected.length} channel${parkedSelected.length === 1 ? '' : 's'}`
          }
        >
          <LockOpen className="size-3.5" />
          <span className={WORD_CLASS}>Unpark</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={sheet.clearByLadder} title="Deselect all">
          <X className="size-3.5" />
          <span className="hidden sm:inline">Deselect</span>
        </Button>
      </div>
    ) : null

  const patched = useMemo(() => Object.keys(mappings ?? {}).length, [mappings])

  return (
    <div ref={measureRef} className="flex min-h-0 flex-1 flex-col">
      <div className="@container shrink-0">
        <SelectionBar
          rowLabel={null}
          cellLabel={cellCount > 0 ? `${cellCount} channel${cellCount === 1 ? '' : 's'}` : null}
          cellTitle={
            selectedChannels.length > 0
              ? `${universe}-${String(selectedChannels[0]).padStart(3, '0')} to ${universe}-${String(selectedChannels[selectedChannels.length - 1]).padStart(3, '0')} — edit once, applies to all`
              : undefined
          }
          family={cellCount > 0 ? 'Value' : null}
          hints={{ entry: cellCount > 0 && sheet.permission.entry, clear: cellCount > 0 && sheet.permission.clear }}
          verbs={verbs}
          marqueeDragging={sheet.marqueeDragging}
        />
      </div>
      <SheetTable<DmxRow, DmxColumnKey>
        {...sheet.tableProps}
        rowHeight={DMX_ROW_HEIGHT}
        minWidth={`${ROW_HEAD_WIDTH + MIN_CELL_WIDTH * columnCount}px`}
        firstColumn={{
          label: '',
          width: `${ROW_HEAD_WIDTH}px`,
          render: (row) => (
            <span className="relative font-mono text-[11px] tabular-nums text-muted-foreground">
              {String(row.base).padStart(3, '0')}
            </span>
          ),
        }}
      />
      {/* The shell's footer, with the programmer's own swatches (CLAUDE.md §List shell): each is
          styled by the real `ownershipCellClass`, so retuning a ring moves this key with it — the
          four hand-copied ring colours this drew before could drift from the cells above. */}
      <SheetPage.Footer>
        <span>
          Universe {universe} · {patched} of 512 patched · {parkValueMap.size} parked
        </span>
        <span className="font-medium">Owned by</span>
        {(
          [
            ['programmer', 'You'],
            ['cue', 'Cue'],
            ['effect', 'Effect'],
            ['parked', 'Parked'],
          ] as const
        ).map(([source, name]) => (
          <span key={name} className="inline-flex items-center gap-1.5" title={OWNERSHIP_LABELS[source]}>
            <OwnershipSwatch source={source} />
            {name}
          </span>
        ))}
      </SheetPage.Footer>
    </div>
  )
}

/** A cell with its ownership ring read per address — a hook per cell, so it cannot live in the column closure. */
function DmxCellWithOwnership(props: React.ComponentProps<typeof DmxCell>) {
  const ownership = useChannelOwnership(props.keys, props.sideband, props.parkedValue !== undefined, props.blind)
  return (
    <div className={cn('h-full', ownershipCellClass(ownership))} title={ownership.source !== 'baseline' ? OWNERSHIP_LABELS[ownership.source] : undefined}>
      <DmxCell {...props} />
    </div>
  )
}
