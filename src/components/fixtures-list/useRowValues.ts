import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  channelKey,
  getChannelValue,
  resolveSettingOption,
  subscribeToChannels,
} from '../../hooks/usePropertyValues'
import { computeCombinedCss } from '../../lib/colourMath'
import { resolutionChannels } from './columns'
import { resolveTargetCells, rowWriteTargets } from './rowModel'
import type { CellResolution, ColumnKey } from './columns'
import type { Row } from './rowModel'
import type { ChannelRef, SettingOption } from '../../store/fixtures'

/**
 * Aggregated live value for one cell. For a fixture row there's exactly one
 * backing resolution and `isUniform` is always true; for a group row the value
 * aggregates every member that has the property (mirroring the maths in
 * useGroupPropertyValues.ts).
 */
export type CellValue =
  | { kind: 'slider'; min: number; max: number; isUniform: boolean }
  | {
      kind: 'colour'
      isUniform: boolean
      r: number
      g: number
      b: number
      w?: number
      a?: number
      uv?: number
      combinedCss: string
    }
  | {
      kind: 'position'
      isUniform: boolean
      pan: number
      tilt: number
      panNormalized: number
      tiltNormalized: number
    }
  | {
      kind: 'setting'
      isUniform: boolean
      level: number
      option?: SettingOption
    }

export interface RowCell {
  col: ColumnKey
  /** Non-null resolutions: one for a plain fixture or element row, one per
   *  element for a multi-head fixture row whose parent lacks the property,
   *  one per member-with-the-property for a group row. */
  resolutions: NonNullable<CellResolution>[]
}

export type RowValues = Partial<Record<ColumnKey, CellValue>>

/**
 * Resolve a row's cells for the visible columns, through the same
 * rowWriteTargets + resolveTargetCells pair the write path uses — what a cell
 * displays is by construction what an edit on it writes (parent-first
 * precedence, element fallback, group members expanded). A column no target
 * supports resolves to no cell (renders empty).
 */
export function buildRowCells(row: Row, visibleColumns: readonly ColumnKey[]): RowCell[] {
  const targets = rowWriteTargets(row)
  const cells: RowCell[] = []
  for (const col of visibleColumns) {
    const resolutions = targets.flatMap((target) =>
      resolveTargetCells(target, col).map((r) => r.resolution),
    )
    if (resolutions.length > 0) cells.push({ col, resolutions })
  }
  return cells
}

/**
 * Aggregate one cell's resolutions against the live channel store. When a
 * group's members back the column with different descriptor kinds (say a
 * colour property on some, a colour wheel on others), only members matching
 * the *first* member's kind participate — a single cell can't meaningfully
 * blend RGB values with wheel positions.
 */
export function aggregateCellValue(
  resolutions: readonly NonNullable<CellResolution>[],
): CellValue | undefined {
  const first = resolutions[0]
  if (!first) return undefined

  switch (first.kind) {
    case 'slider': {
      const values = resolutions
        .filter((r) => r.kind === 'slider')
        .map((r) => getChannelValue(r.property.channel))
      const min = Math.min(...values)
      const max = Math.max(...values)
      return { kind: 'slider', min, max, isUniform: min === max }
    }
    case 'colour': {
      const members = resolutions
        .filter((r) => r.kind === 'colour')
        .map((r) => ({
          r: getChannelValue(r.property.redChannel),
          g: getChannelValue(r.property.greenChannel),
          b: getChannelValue(r.property.blueChannel),
          w: r.property.whiteChannel ? getChannelValue(r.property.whiteChannel) : undefined,
          a: r.property.amberChannel ? getChannelValue(r.property.amberChannel) : undefined,
          uv: r.property.uvChannel ? getChannelValue(r.property.uvChannel) : undefined,
        }))
      const head = members[0]
      const isUniform = members.every(
        (m) =>
          m.r === head.r &&
          m.g === head.g &&
          m.b === head.b &&
          m.w === head.w &&
          m.a === head.a &&
          m.uv === head.uv,
      )
      const avg = (pick: (m: (typeof members)[number]) => number | undefined) => {
        const defined = members.map(pick).filter((v): v is number => v !== undefined)
        if (defined.length === 0) return undefined
        return Math.round(defined.reduce((sum, v) => sum + v, 0) / defined.length)
      }
      const r = avg((m) => m.r) ?? 0
      const g = avg((m) => m.g) ?? 0
      const b = avg((m) => m.b) ?? 0
      const w = avg((m) => m.w)
      const a = avg((m) => m.a)
      const uv = avg((m) => m.uv)
      return {
        kind: 'colour',
        isUniform,
        r,
        g,
        b,
        w,
        a,
        uv,
        combinedCss: computeCombinedCss(r, g, b, w, a, uv),
      }
    }
    case 'position': {
      const members = resolutions
        .filter((r) => r.kind === 'position')
        .map((r) => ({ pan: getChannelValue(r.pan), tilt: getChannelValue(r.tilt) }))
      const pan = Math.round(members.reduce((sum, m) => sum + m.pan, 0) / members.length)
      const tilt = Math.round(members.reduce((sum, m) => sum + m.tilt, 0) / members.length)
      const isUniform = members.every((m) => m.pan === members[0].pan && m.tilt === members[0].tilt)
      const panRange = first.panMax - first.panMin
      const tiltRange = first.tiltMax - first.tiltMin
      return {
        kind: 'position',
        isUniform,
        pan,
        tilt,
        panNormalized: panRange > 0 ? (pan - first.panMin) / panRange : 0.5,
        tiltNormalized: tiltRange > 0 ? (tilt - first.tiltMin) / tiltRange : 0.5,
      }
    }
    case 'setting':
    case 'colour-setting': {
      const levels = resolutions
        .filter((r) => r.kind === 'setting' || r.kind === 'colour-setting')
        .map((r) => getChannelValue(r.property.channel))
      const isUniform = levels.every((level) => level === levels[0])
      return {
        kind: 'setting',
        isUniform,
        level: levels[0],
        option: isUniform ? resolveSettingOption(first.property.options, levels[0]) : undefined,
      }
    }
  }
}

function signaturesEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Live values for one row: a single subscription set covering every channel
 * the row's visible cells reference, snapshotted as `ColumnKey → CellValue`.
 * The snapshot keeps its object identity while none of the row's channels
 * change, so unrelated channel traffic never re-renders the row. This is the
 * per-row alternative to per-cell value hooks, which at table scale would open
 * thousands of subscriptions.
 */
export function useRowValues(cells: readonly RowCell[]): RowValues {
  // `cells` gets a fresh identity whenever the row list is rebuilt (buildRows
  // mints new Row objects), but the underlying channel set rarely changes.
  // Key the subscription on the channel-key string so a filter keystroke or
  // lit-set change doesn't tear down and re-register every channel
  // subscription for every mounted row.
  const channelsKey = useMemo(
    () =>
      cells
        .flatMap((cell) => cell.resolutions.flatMap(resolutionChannels))
        .map(channelKey)
        .join('|'),
    [cells],
  )

  const channels = useMemo<ChannelRef[]>(
    () =>
      channelsKey === ''
        ? []
        : channelsKey.split('|').map((key) => {
            const [universe, channelNo] = key.split(':')
            return { universe: Number(universe), channelNo: Number(channelNo) }
          }),
    [channelsKey],
  )

  const cachedRef = useRef<{
    cells: readonly RowCell[]
    signature: number[]
    values: RowValues
  } | null>(null)

  const subscribe = useCallback(
    (callback: () => void) => subscribeToChannels(channels, callback),
    [channels],
  )

  const getSnapshot = useCallback((): RowValues => {
    // Every cell value is a pure function of these channel reads AND the
    // resolutions that produced them, so the cache is valid only while both
    // are unchanged — a descriptor change with identical channel values (a
    // repatch while idle) must not serve values computed from old options.
    const signature = channels.map(getChannelValue)
    const cached = cachedRef.current
    if (cached && cached.cells === cells && signaturesEqual(cached.signature, signature)) {
      return cached.values
    }
    const values: RowValues = {}
    for (const cell of cells) {
      const value = aggregateCellValue(cell.resolutions)
      if (value) values[cell.col] = value
    }
    cachedRef.current = { cells, signature, values }
    return values
  }, [cells, channels])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
