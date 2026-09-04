import { Layers, ListMusic } from 'lucide-react'
import type { CueSlot } from '../store/cueSlots'

/**
 * What `CueSlotOverviewPanel` and `CueSlotEditAssignPanel` both need, extracted so neither has to
 * import the other.
 *
 * They were a value-import cycle — the panel rendered the assign panel, the assign panel imported
 * the panel's `SlotItemContent` and drag-data type. That is the only failure mode in this tree
 * that shows up as a working build and a broken app in the browser (see the `startOAuthIdentityBridge`
 * TDZ break in CLAUDE.md), so the shared half lives here rather than in either end of it.
 */

/**
 * A slot being dragged to another slot.
 *
 * Here rather than in the panel because `DeskDndProvider` — which is no longer a cue-slot module —
 * resolves the drop, and the panel imports the provider's hook. Same non-cycle reason as the rest
 * of this file.
 */
export interface CueSlotSwapDragData {
  type: 'slot-item'
  page: number
  slotIndex: number
  slot: CueSlot
}

/** A slot offering itself as a landing place. */
export interface CueSlotDropTargetData {
  type: 'slot-target'
  page: number
  slotIndex: number
}

/** The payload a drag from the assign panel carries to a slot. */
export interface CueSlotAssignDragData {
  type: 'cue-slot-assign'
  itemType: 'cue' | 'cue_stack'
  itemId: number
  itemName: string
}

/** The label and type glyph, identical in a slot, in the assign list and under the drag cursor. */
export function SlotItemContent({
  name,
  itemType,
}: {
  name: string
  itemType: 'cue' | 'cue_stack'
}) {
  return (
    <>
      <span className="text-xs font-medium leading-tight text-center line-clamp-2 w-full">
        {name}
      </span>
      <div className="flex items-center gap-1 mt-0.5">
        {itemType === 'cue_stack' ? (
          <Layers className="size-3 text-muted-foreground shrink-0" />
        ) : (
          <ListMusic className="size-3 text-muted-foreground shrink-0" />
        )}
      </div>
    </>
  )
}
