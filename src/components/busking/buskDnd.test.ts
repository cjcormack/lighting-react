import { describe, expect, it } from 'vitest'
import type { ClientRect } from '@dnd-kit/core'
import type { BuskPage } from '@/api/buskApi'
import {
  applyDrop,
  buskBankBodyId,
  buskBankUnderId,
  buskGutterId,
  buskPadId,
  BUSK_NEW_ROW_ID,
} from '@/lib/buskLayout'
import { insertionSide, resolveDropTarget, sameTarget } from './buskDnd'

/**
 * Where a hover lands.
 *
 * This is the whole of the drag *decision*; `BuskEditProvider` only feeds it what dnd-kit reports
 * and hands the answer to `applyDrop`. Driving a real `DndContext` in jsdom would test dnd-kit's
 * collision detection against rects that are all zero, which is why the decision lives out here.
 */

const page: BuskPage = {
  id: 1,
  uuid: 'p1',
  name: 'Ballads',
  sortOrder: 0,
  rows: [
    {
      columns: [
        {
          id: 1,
          uuid: 'c1',
          width: 12,
          banks: [
            {
              id: 1,
              uuid: 'b1',
              name: 'Movement',
              solo: false,
              flow: 'WRAP',
              pads: [
                { id: 1, uuid: 'pa', kind: 'TEMPLATE', template: { id: 1 } as never },
                { id: 2, uuid: 'pb', kind: 'TEMPLATE', template: { id: 2 } as never },
              ],
            },
          ],
        },
      ],
    },
  ],
}

function rect(left: number, top: number): ClientRect {
  return { top, left, right: left + 100, bottom: top + 50, width: 100, height: 50 } as ClientRect
}

const PAD_1 = buskPadId({ row: 0, column: 0, bank: 0, pad: 1 })

function hover(overId: string, opts: { activeId?: string; activeRect?: ClientRect | null } = {}) {
  return resolveDropTarget({
    page,
    activeId: opts.activeId ?? 'palette:look:9',
    overId,
    collisionIds: [overId],
    activeRect: opts.activeRect ?? null,
    overRect: rect(100, 100),
  })
}

describe('resolving a hover', () => {
  it('lands before the pad when the pointer is on its leading half', () => {
    expect(hover(PAD_1, { activeRect: rect(60, 100) })).toEqual({
      kind: 'pad',
      at: { row: 0, column: 0, bank: 0, pad: 1 },
    })
  })

  it('lands after the pad when the pointer has crossed its centre', () => {
    expect(hover(PAD_1, { activeRect: rect(140, 100) })).toEqual({
      kind: 'pad',
      at: { row: 0, column: 0, bank: 0, pad: 2 },
    })
  })

  it('reads the axis the drag is actually moving along', () => {
    // Barely right but well below: the vertical difference is what decides it.
    expect(hover(PAD_1, { activeRect: rect(105, 200) })).toEqual({
      kind: 'pad',
      at: { row: 0, column: 0, bank: 0, pad: 2 },
    })
  })

  it('appends at the end of the bank over its body', () => {
    expect(hover(buskBankBodyId({ row: 0, column: 0, bank: 0 }))).toEqual({
      kind: 'pad',
      at: { row: 0, column: 0, bank: 0, pad: 2 },
    })
  })

  it('reads the three bank zones', () => {
    expect(hover(buskBankUnderId({ row: 0, column: 0, bank: 0 }))).toEqual({
      kind: 'bank-under',
      at: { row: 0, column: 0, bank: 0 },
    })
    expect(hover(buskGutterId(0, 1))).toEqual({ kind: 'new-column', row: 0, column: 1 })
    expect(hover(BUSK_NEW_ROW_ID)).toEqual({ kind: 'new-row' })
  })

  it('takes the deepest thing the pointer is inside, whatever order they arrive in', () => {
    const target = resolveDropTarget({
      page,
      activeId: 'palette:look:9',
      // The bank body contains the pad; the pad must win however dnd-kit sorted them.
      collisionIds: [buskBankBodyId({ row: 0, column: 0, bank: 0 }), PAD_1],
      overId: buskBankBodyId({ row: 0, column: 0, bank: 0 }),
      activeRect: null,
      overRect: rect(100, 100),
    })
    expect(target).toEqual({ kind: 'pad', at: { row: 0, column: 0, bank: 0, pad: 1 } })
  })

  it('answers null over nothing, over itself, and over a foreign droppable', () => {
    expect(hover(PAD_1, { activeId: PAD_1 })).toBeNull()
    expect(
      resolveDropTarget({
        page,
        activeId: 'palette:look:9',
        overId: null,
        collisionIds: [],
        activeRect: null,
        overRect: null,
      }),
    ).toBeNull()
    expect(hover('slot-0-3')).toBeNull()
  })
})

describe('the hover guards', () => {
  it('treats the same landing place as no change', () => {
    const at = { row: 0, column: 0, bank: 0, pad: 1 }
    expect(sameTarget({ kind: 'pad', at }, { kind: 'pad', at: { ...at } })).toBe(true)
    expect(sameTarget({ kind: 'pad', at }, { kind: 'new-row' })).toBe(false)
    expect(sameTarget(null, null)).toBe(true)
    expect(sameTarget(null, { kind: 'new-row' })).toBe(false)
  })

  it('lands before the target when it has no rect to compare', () => {
    expect(insertionSide(null, rect(0, 0))).toBe(0)
  })
})

describe('the slot and the landing place agree', () => {
  /**
   * The regression this exists for: `resolveDropTarget` hands back the gap the dashed slot is drawn
   * in, and `applyDrop` has to put the pad in *that* gap. Testing either half alone missed a
   * downward drag landing one place further on than the operator was shown — each half was
   * self-consistent, and they disagreed about what the index meant.
   */
  function drop(fromPad: number, overPad: number, side: 'leading' | 'trailing') {
    const target = resolveDropTarget({
      page,
      activeId: buskPadId({ row: 0, column: 0, bank: 0, pad: fromPad }),
      overId: buskPadId({ row: 0, column: 0, bank: 0, pad: overPad }),
      collisionIds: [buskPadId({ row: 0, column: 0, bank: 0, pad: overPad })],
      activeRect: rect(side === 'trailing' ? 140 : 60, 100),
      overRect: rect(100, 100),
    })
    const next = applyDrop(page, { kind: 'pad', at: { row: 0, column: 0, bank: 0, pad: fromPad } }, target!)
    return {
      slotBefore: target?.kind === 'pad' ? target.at.pad : null,
      pads: (next ?? page).rows[0].columns[0].banks[0].pads.map((p) => p.template!.id),
    }
  }

  it('lands a pad dragged forwards in the gap the slot showed', () => {
    // [1,2] with 1 lifted, dropped past 2's centre: the slot sits after 2, and so does the pad.
    expect(drop(0, 1, 'trailing')).toEqual({ slotBefore: 2, pads: [2, 1] })
  })

  it('lands a pad dragged backwards in the gap the slot showed', () => {
    expect(drop(1, 0, 'leading')).toEqual({ slotBefore: 0, pads: [2, 1] })
  })

  it('treats the gap either side of the dragged pad as no move', () => {
    expect(drop(0, 1, 'leading').pads).toEqual([1, 2])
  })
})
