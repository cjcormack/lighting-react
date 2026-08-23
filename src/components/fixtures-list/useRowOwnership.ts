import type { LayerSource } from '@/api/cuesApi'
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { lightingApi } from '../../api/lightingApi'
import { parseProgrammerValue } from '../../lib/programmerValue'
import type {
  ProgrammerKeyState,
  ProvenanceEntry,
  ProvenanceSource,
} from '../../api/programmerWsApi'
import type { CellPropertyKey, RowCell } from './useRowValues'
import type { ColumnKey } from './columns'

/**
 * Which layer owns a cell's value, plus the programmer facts the sheet colours by.
 *
 * `source` collapses the backend's per-property provenance across everything the cell covers
 * (all members of a group row, all heads of a collapsed multi-head fixture). A cell with
 * nothing above baseline reads `baseline`.
 */
export type CellOwnershipSource = 'parked' | 'programmer' | 'effect' | 'cue' | 'baseline'

export interface CellOwnership {
  source: CellOwnershipSource
  /** True when at least one covered property carries an operator edit (not a hand-down). */
  touched: boolean
  /** False when the covered properties disagree about who owns them. */
  isUniform: boolean
  /** Distinct programmer owners across the cell: `web`, `locate`, `preset:3`, … */
  owners: string[]
  /** Group name when the programmer entry came through a group control. */
  sourceGroup?: string
  /**
   * The programmer's staged value while blind is engaged, as a level/colour/position — the
   * wire still shows the layers underneath, so this is the only way to see what you are
   * building. Undefined whenever blind is off (the wire value already *is* the programmer
   * value) or the cell's covered properties disagree.
   */
  staged?: StagedValue
  /**
   * Set when a **Look layer** produced this cell's winning value — in a cue or in the programmer.
   *
   * The answer to "why is this fixture this colour?", which `source` alone can only answer with
   * *a cue*. This is the survivor of a pair: `paletteRef` named a value-level `ref:` on the
   * operator's own entry, and retired with that grammar in session 4.
   */
  layer?: CellLayer
}

/**
 * The Look layer that won a cell.
 *
 * One object for the whole cell: a cell can cover twelve properties (every member of a group row,
 * both axes of a pan/tilt pair, every head of a collapsed multi-head fixture) and the operator needs
 * one answer, not twelve. `mixed` is the honest form of "they don't agree" —
 * naming one layer over a cell where half the heads came from another would be a confident lie.
 */
export interface CellLayer {
  /** Undefined when the covered properties were won by *different* layers — see `mixed`. */
  layerId?: number
  /** What that layer applies — a Look or a template. Undefined when `mixed`. */
  source?: LayerSource
  name?: string
  mixed: boolean
}

// `CellPaletteRef` and its `resolvedLiteralOf` helper stood here until session 4. They described
// the named palette a cell's entries referenced, as one verdict for the whole cell, and
// `resolvedLiteralOf` existed because on a POSITION palette every head of a group row held the
// identical `ref:{uuid}` string while resolving to a different pan/tilt — so comparing `value`
// reported the cell uniform and painted one head's crosshair for all twelve. With the `ref:` grammar
// gone an entry's `value` *is* its literal, and [CellLayer] answers "where did this come from".

export type StagedValue =
  | { kind: 'level'; value: number }
  | { kind: 'colour'; r: number; g: number; b: number; w: number; a: number; uv: number }
  | { kind: 'position'; pan: number; tilt: number }

export type RowOwnership = Partial<Record<ColumnKey, CellOwnership>>

/**
 * Most-significant-first. A cell covering a parked property and a cue-owned one reads
 * `parked`: park is the thing the operator most needs to know about, because it is the one
 * state where the rig ignores everything they do.
 */
const SOURCE_RANK: Record<CellOwnershipSource, number> = {
  parked: 4,
  programmer: 3,
  effect: 2,
  cue: 1,
  baseline: 0,
}

const PROVENANCE_TO_SOURCE: Record<ProvenanceSource, CellOwnershipSource> = {
  PARKED: 'parked',
  PROGRAMMER: 'programmer',
  EFFECT: 'effect',
  CUE: 'cue',
}

const EMPTY_OWNERSHIP: RowOwnership = {}

function sourceFor(state: ProgrammerKeyState): CellOwnershipSource {
  const provenance = state.provenance
  if (provenance) return PROVENANCE_TO_SOURCE[provenance.source] ?? 'baseline'
  // While blind, the programmer is gated out of the merge, so provenance reports whatever is
  // underneath — but the entry is still what the operator is editing, and the sheet must
  // show it as theirs.
  return state.entry ? 'programmer' : 'baseline'
}

/** Aggregate one cell's covered properties into a single ownership verdict. */
export function aggregateCellOwnership(
  keys: readonly CellPropertyKey[],
  blind: boolean,
  lookup: (targetKey: string, propertyName: string) => ProgrammerKeyState,
): CellOwnership | undefined {
  if (keys.length === 0) return undefined

  let source: CellOwnershipSource = 'baseline'
  let uniform = true
  let touched = false
  let sourceGroup: string | undefined
  const owners: string[] = []
  let stagedValue: string | undefined
  let stagedUniform = true

  // The winning layer, tracked separately from ownership because the two disagree routinely: it is
  // a property of provenance rather than of the operator's entry.
  let layerId: number | undefined
  let layerEntry: ProvenanceEntry | undefined
  let layerCount = 0
  let layerMixed = false

  keys.forEach((key, index) => {
    const state = lookup(key.targetKey, key.propertyName)
    const keySource = sourceFor(state)
    if (index === 0) source = keySource
    else if (keySource !== source) {
      uniform = false
      if (SOURCE_RANK[keySource] > SOURCE_RANK[source]) source = keySource
    }

    const layer = state.provenance
    if (layer?.layerId != null) {
      layerCount += 1
      if (layerId === undefined) {
        layerId = layer.layerId
        layerEntry = layer
      } else if (layerId !== layer.layerId) {
        layerMixed = true
      }
    }

    if (state.entry) {
      if (state.entry.touched) touched = true
      sourceGroup ??= state.entry.sourceGroup
      for (const owner of state.entry.owners) {
        if (!owners.includes(owner)) owners.push(owner)
      }
      const literal = state.entry.value
      if (index === 0) stagedValue = literal
      else if (literal !== stagedValue) stagedUniform = false
    } else if (index === 0) {
      stagedValue = undefined
    } else {
      stagedUniform = false
    }
  })

  const staged =
    blind && stagedUniform && stagedValue !== undefined
      ? (parseProgrammerValue(stagedValue) ?? undefined)
      : undefined

  const cellLayer: CellLayer | undefined =
    layerCount === 0
      ? undefined
      : {
          layerId: layerMixed ? undefined : layerId,
          source: layerMixed ? undefined : layerEntry?.layerSource,
          name: layerMixed ? undefined : layerEntry?.layerSource?.name,
          mixed: layerMixed || layerCount !== keys.length,
        }

  return {
    source,
    touched,
    isUniform: uniform,
    owners,
    sourceGroup,
    staged,
    layer: cellLayer,
  }
}

/**
 * Ownership for one row's cells — the sibling of `useRowValues`, and the same discipline:
 * one subscription set per row (not per cell), keyed on a stable string so rebuilding the
 * row list doesn't churn subscriptions, and a cached snapshot identity so an unrelated
 * layer event never re-renders the row.
 *
 * The subscriptions are per `(target, property)` rather than whole-state, because
 * `provenanceState` is a *full* snapshot pushed on every layer event — a cue change would
 * otherwise wake every mounted row in the sheet.
 */
export function useRowOwnership(cells: readonly RowCell[]): RowOwnership {
  const keysSignature = useMemo(
    () =>
      cells
        .map((cell) => `${cell.col}=${cell.keys.map((k) => `${k.targetKey}|${k.propertyName}`).join(',')}`)
        .join(';'),
    [cells],
  )

  const subscribedKeys = useMemo<CellPropertyKey[]>(() => {
    const seen = new Set<string>()
    const out: CellPropertyKey[] = []
    for (const cell of cells) {
      for (const key of cell.keys) {
        const id = `${key.targetKey}|${key.propertyName}`
        if (seen.has(id)) continue
        seen.add(id)
        out.push(key)
      }
    }
    return out
    // Keyed on the signature, not `cells`: buildRows mints fresh Row objects on every filter
    // keystroke, and re-registering every subscription for every mounted row would make
    // typing in the filter box quadratic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSignature])

  const cachedRef = useRef<{
    cells: readonly RowCell[]
    version: number
    ownership: RowOwnership
  } | null>(null)
  const versionRef = useRef(0)

  const subscribe = useCallback(
    (callback: () => void) => {
      // Nothing to track — the "ownership off" path (FixturesTable passes an empty cell list
      // for the plain Fixtures/Groups lists). Registering the blind listener anyway would put
      // every mounted row of a several-hundred-row table on the global programmer channel,
      // waking them all on every cue change and effect start — the exact cost the per-key
      // split exists to avoid.
      if (subscribedKeys.length === 0) return () => {}

      const bump = () => {
        versionRef.current += 1
        callback()
      }
      const subscriptions = subscribedKeys.map((key) =>
        lightingApi.programmer.subscribeToKey(key.targetKey, key.propertyName, bump),
      )
      // Blind is global rather than per-key, and flipping it changes what every cell
      // displays. Filter to *just* that transition — the whole-state channel also fires on
      // every provenance push, and reacting to those here would undo the per-key split.
      let lastBlind = lightingApi.programmer.isBlind()
      subscriptions.push(
        lightingApi.programmer.subscribe((state) => {
          if (state.blind === lastBlind) return
          lastBlind = state.blind
          bump()
        }),
      )
      return () => subscriptions.forEach((s) => s.unsubscribe())
    },
    [subscribedKeys],
  )

  const getSnapshot = useCallback((): RowOwnership => {
    if (subscribedKeys.length === 0) return EMPTY_OWNERSHIP
    // Cache on both the programmer version and the cell identity: a repatch or a column
    // toggle changes what to aggregate without any layer event firing.
    const cached = cachedRef.current
    if (cached && cached.cells === cells && cached.version === versionRef.current) {
      return cached.ownership
    }

    const blind = lightingApi.programmer.isBlind()
    const lookup = (targetKey: string, propertyName: string) =>
      lightingApi.programmer.getKeyState(targetKey, propertyName)

    const ownership: RowOwnership = {}
    for (const cell of cells) {
      const value = aggregateCellOwnership(cell.keys, blind, lookup)
      if (value) ownership[cell.col] = value
    }
    cachedRef.current = { cells, version: versionRef.current, ownership }
    return ownership
  }, [cells, subscribedKeys])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
