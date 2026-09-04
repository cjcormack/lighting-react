import type { Active, ClientRect } from '@dnd-kit/core'
import type { BuskPage } from '@/api/buskApi'
import {
  dropTargetFor,
  parseBuskDragId,
  type BankAddress,
  type DragSource,
  type DropTarget,
  type PadAddress,
  type PaletteRecord,
  type ParsedBuskId,
} from '@/lib/buskLayout'
import type { PadFace } from './padFace'

/**
 * What a busk drag carries, and how deep the thing it is over sits.
 *
 * The busk page shares the app's single `DndContext` with the FX cue-slot grid (see
 * `dnd/DeskDndProvider.tsx`), so both ends of every handler are typed and **both ignore what they
 * do not recognise**. That mutual ignorance is the whole coexistence mechanism: no registry, no
 * priority, no shared enum.
 */

export interface BuskPadDragData {
  type: 'busk-pad'
  at: PadAddress
  face: PadFace
}

export interface BuskBankDragData {
  type: 'busk-bank'
  at: BankAddress
  name: string
  padCount: number
}

export interface BuskPaletteDragData {
  type: 'busk-palette'
  record: PaletteRecord
  face: PadFace
  /**
   * Whether a cue slot could take this — a cue, or a Look with no deferred effect (D7).
   *
   * Nothing reads it yet. It is here because the palette is the surface session 3 feeds the slots
   * from, and deriving it there rather than at the slot keeps one answer to "can this land in a
   * place with no selection".
   */
  slotEligible: boolean
}

export type BuskDragData = BuskPadDragData | BuskBankDragData | BuskPaletteDragData

export interface BuskDropData {
  type: 'busk-drop'
  target: DropTarget
  /**
   * How deeply nested this droppable is, largest wins.
   *
   * A pad sits geometrically inside its bank's body, so a pointer inside the pad is inside both;
   * `pointerWithin` returns every containing droppable and only *usually* puts the innermost first.
   * Reading the deepest busk drop out of `event.collisions` makes it deterministic.
   */
  depth: number
}

export const DROP_DEPTH = { pad: 3, bankBody: 2, bankUnder: 2, gutter: 1, newRow: 0 } as const

export function buskDragData(active: Active | null): BuskDragData | null {
  const data = active?.data.current
  if (data == null) return null
  if (data.type === 'busk-pad' || data.type === 'busk-bank' || data.type === 'busk-palette') {
    return data as BuskDragData
  }
  return null
}

export function dragSourceOf(data: BuskDragData): DragSource {
  if (data.type === 'busk-palette') return { kind: 'palette', record: data.record }
  if (data.type === 'busk-pad') return { kind: 'pad', at: data.at }
  return { kind: 'bank', at: data.at }
}

/**
 * Which side of the pad it was dropped on: 0 to land before it, 1 to land after.
 *
 * The axis is chosen per drag rather than per bank, because a `WRAP` bank lays its pads out in rows
 * *and* columns — the operator crossing a pad from the left means something different from crossing
 * it from above, and the bank's `flow` cannot tell you which they did. Whichever axis the two
 * centres differ on more is the one they were moving along.
 */
export function insertionSide(activeRect: ClientRect | null, overRect: ClientRect): 0 | 1 {
  if (activeRect == null) return 0
  const dx = activeRect.left + activeRect.width / 2 - (overRect.left + overRect.width / 2)
  const dy = activeRect.top + activeRect.height / 2 - (overRect.top + overRect.height / 2)
  const along = Math.abs(dx) >= Math.abs(dy) ? dx : dy
  return along > 0 ? 1 : 0
}

/**
 * How deep a parsed droppable id sits, for the largest-wins rule above.
 *
 * Derived from the **id** rather than read off the droppable's `data`, because a collision only
 * reports an id and reaching its container's data through `collisions[n].data` is both awkward and
 * undocumented. The id already says what it names.
 */
export function depthOf(parsed: ParsedBuskId): number {
  switch (parsed.kind) {
    case 'pad':
      return DROP_DEPTH.pad
    case 'bank-body':
      return DROP_DEPTH.bankBody
    case 'bank-under':
      return DROP_DEPTH.bankUnder
    case 'gutter':
      return DROP_DEPTH.gutter
    case 'new-row':
      return DROP_DEPTH.newRow
    default:
      return -1
  }
}

/** Do two hover targets name the same landing place? A repeat hover must write no state. */
export function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a == null || b == null) return a === b
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The deepest busk landing place among everything the pointer is inside. */
function deepest(collisionIds: readonly string[]): ParsedBuskId | null {
  let best: ParsedBuskId | null = null
  let bestDepth = -1
  for (const id of collisionIds) {
    const parsed = parseBuskDragId(id)
    if (parsed == null) continue
    const depth = depthOf(parsed)
    if (depth > bestDepth) {
      best = parsed
      bestDepth = depth
    }
  }
  return best
}

/**
 * Where a hover would land, or null for no landing place.
 *
 * Pure, and separated from the monitor that calls it for the reason every reducer in this feature
 * is: the alternative is a jsdom pointer sequence against a `DndContext` whose rects are all zero,
 * which tests dnd-kit rather than this decision.
 */
export function resolveDropTarget(args: {
  page: BuskPage
  activeId: string
  overId: string | null
  collisionIds: readonly string[]
  activeRect: ClientRect | null
  overRect: ClientRect | null
}): DropTarget | null {
  const { page, activeId, overId, collisionIds, activeRect, overRect } = args
  // A pad is its own droppable as well as a draggable, and hovering yourself is not a gesture.
  if (overId == null || overId === activeId) return null

  const parsed = deepest(collisionIds.length > 0 ? collisionIds : [overId])
  if (parsed == null) return null

  const target = dropTargetFor(parsed, page)
  if (target?.kind !== 'pad' || overRect == null) return target

  // The half-of-the-pad test only means anything when the pad that won is the one dnd-kit measured.
  const overParsed = parseBuskDragId(overId)
  if (
    overParsed?.kind !== 'pad' ||
    overParsed.at.row !== target.at.row ||
    overParsed.at.column !== target.at.column ||
    overParsed.at.bank !== target.at.bank ||
    overParsed.at.pad !== target.at.pad
  ) {
    return target
  }
  return { kind: 'pad', at: { ...target.at, pad: target.at.pad + insertionSide(activeRect, overRect) } }
}
