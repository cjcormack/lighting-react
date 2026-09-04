import { useEffect, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { GripVertical, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
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
import { BUSK_WIDTHS, BUSK_WIDTH_LABELS, type BuskBank as BuskBankModel } from '@/api/buskApi'
import {
  buskBankBodyId,
  buskBankId,
  buskBankUnderId,
  duplicateBank,
  removeBank,
  removePad,
  setBank,
  setColumnWidth,
  type BankAddress,
} from '@/lib/buskLayout'
import { useBuskEdit } from './BuskEditProvider'
import { BuskDropSlot, BuskPadButton } from './BuskPad'
import { DROP_DEPTH, type BuskBankDragData, type BuskDropData } from './buskDnd'
import type { PadBehaviour } from './padBehaviour'

/**
 * One bank: a named cluster of pads that either stacks or is exclusive.
 *
 * **Solo never decides a bank's shape.** The tag in the header is the only thing it shows here —
 * the exclusivity itself is the server's, resolved by the press route from the bank the pad sits
 * in, so nothing in this component knows what a press releases.
 */

function soloSwitchClass(on: boolean) {
  return cn(
    'relative h-4 w-7 shrink-0 rounded-full transition-colors',
    on ? 'bg-primary' : 'bg-muted',
  )
}

/**
 * The bank name, committed when the operator leaves the field rather than per keystroke.
 *
 * Every gesture saves the **whole page**, so a per-keystroke write would be one full layout PUT and
 * one broadcast per character. A rename is a gesture that ends when you stop typing, so it commits
 * on blur and on Enter; Escape puts the stored name back.
 */
function BankNameField({ bank, at }: { bank: BuskBankModel; at: BankAddress }) {
  const { commit } = useBuskEdit()
  const [draft, setDraft] = useState(bank.name)

  // Another client, or an undone save, can move the stored name under us.
  useEffect(() => setDraft(bank.name), [bank.name])

  function save() {
    if (draft === bank.name) return
    commit((page) => setBank(page, at, { name: draft }))
  }

  return (
    <Input
      value={draft}
      aria-label="Bank name"
      placeholder="Bank"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(bank.name)
          e.currentTarget.blur()
        }
      }}
      className="h-7 min-w-0 flex-1 text-[13px]"
    />
  )
}

function BankHeader({
  bank,
  at,
  dragHandle,
}: {
  bank: BuskBankModel
  at: BankAddress
  dragHandle: React.ReactNode
}) {
  const { editing, commit } = useBuskEdit()

  if (!editing) {
    return (
      <div className="flex min-h-5 items-center gap-2">
        <span className="flex-1 truncate text-[11px] font-semibold">{bank.name}</span>
        {bank.solo && (
          <span className="inline-flex h-4 shrink-0 items-center rounded-full border border-violet-500/60 bg-violet-500/20 px-1.5 text-[9px] font-bold tracking-[0.06em] text-violet-300 uppercase">
            solo
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-5 items-center gap-2">
      {dragHandle}
      <BankNameField bank={bank} at={at} />
      <span className="text-[10px] text-muted-foreground">Solo</span>
      <button
        type="button"
        role="switch"
        aria-checked={bank.solo}
        aria-label={`Solo ${bank.name || 'bank'}`}
        onClick={() => commit((page) => setBank(page, at, { solo: !bank.solo }))}
        className={soloSwitchClass(bank.solo)}
      >
        <span
          className={cn(
            'absolute top-0.5 size-3 rounded-full transition-all',
            bank.solo ? 'left-3.5 bg-card' : 'left-0.5 bg-muted-foreground',
          )}
        />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${bank.name || 'bank'}`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Width belongs to the **column**, not the bank — a column can stack several banks and
              they all share its share of the row. The control is here because this is where the
              operator is looking; it reaches past the bank on purpose. */}
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            Column width
          </DropdownMenuLabel>
          <div className="flex gap-0.5 px-1 pb-1">
            {BUSK_WIDTHS.map((width) => (
              <button
                key={width}
                type="button"
                onClick={() => commit((page) => setColumnWidth(page, at.row, at.column, width))}
                className="rounded px-2 py-1 text-xs hover:bg-accent"
              >
                {BUSK_WIDTH_LABELS[width]}
              </button>
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={bank.flow}
            onValueChange={(flow) =>
              commit((page) => setBank(page, at, { flow: flow as BuskBankModel['flow'] }))
            }
          >
            <DropdownMenuRadioItem value="WRAP">Flow: Wrap</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="COLUMN">Flow: Column</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => commit((page) => duplicateBank(page, at))}>
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => commit((page) => removeBank(page, at))}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function BuskBankCluster({
  bank,
  at,
  behaviour,
}: {
  bank: BuskBankModel
  at: BankAddress
  behaviour: PadBehaviour
}) {
  const { editing, source, target, commit } = useBuskEdit()

  const { attributes, listeners, setNodeRef: setBankRef, isDragging } = useDraggable({
    id: buskBankId(at),
    data: {
      type: 'busk-bank',
      at,
      name: bank.name,
      padCount: bank.pads.length,
    } satisfies BuskBankDragData,
    disabled: !editing,
  })

  const { setNodeRef: setBodyRef, isOver } = useDroppable({
    id: buskBankBodyId(at),
    data: {
      type: 'busk-drop',
      target: { kind: 'pad', at: { ...at, pad: bank.pads.length } },
      depth: DROP_DEPTH.bankBody,
    } satisfies BuskDropData,
    disabled: !editing,
  })

  const draggingBank = source?.type === 'busk-bank'
  const { setNodeRef: setUnderRef, isOver: isOverUnder } = useDroppable({
    id: buskBankUnderId(at),
    data: {
      type: 'busk-drop',
      target: { kind: 'bank-under', at },
      depth: DROP_DEPTH.bankUnder,
    } satisfies BuskDropData,
    disabled: !editing || !draggingBank,
  })

  const slotIndex =
    target?.kind === 'pad' &&
    target.at.row === at.row &&
    target.at.column === at.column &&
    target.at.bank === at.bank
      ? target.at.pad
      : null

  const cells: React.ReactNode[] = []
  bank.pads.forEach((pad, index) => {
    if (slotIndex === index) cells.push(<BuskDropSlot key="drop-slot" />)
    cells.push(
      <BuskPadButton
        key={pad.uuid ?? pad.localKey ?? `pad-${index}`}
        pad={pad}
        at={{ ...at, pad: index }}
        presence={behaviour.presenceOf(pad)}
        isLive={behaviour.isLive(pad)}
        editing={editing}
        onPress={() => behaviour.onPress(pad)}
        onInspect={() => behaviour.onInspect(pad)}
        onRemove={() => commit((page) => removePad(page, { ...at, pad: index }))}
      />,
    )
  })
  if (slotIndex === bank.pads.length) cells.push(<BuskDropSlot key="drop-slot" />)

  return (
    <>
      <div
        ref={setBankRef}
        className={cn(
          'flex min-w-0 flex-col gap-2 rounded-[10px] border bg-muted/15 p-2.5',
          isDragging && 'opacity-40',
          isOver && editing && !draggingBank && 'bg-primary/5 ring-1 ring-inset ring-primary/40',
        )}
      >
        <BankHeader
          bank={bank}
          at={at}
          dragHandle={
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${bank.name || 'bank'}`}
              // The listeners live on the grip alone. The app's pointer sensor activates at 8px
              // and is shared, so a bank that dragged by its whole body would swallow every
              // attempt to scroll the page on a touchscreen.
              className="shrink-0 cursor-grab touch-none text-muted-foreground"
            >
              <GripVertical className="size-3.5" />
            </button>
          }
        />
        <div
          ref={setBodyRef}
          className={cn(
            'grid gap-2',
            bank.flow === 'COLUMN'
              ? 'grid-cols-1'
              : 'grid-cols-[repeat(auto-fill,minmax(110px,1fr))]',
            // An empty bank is legal and keeps its own height, so there is somewhere to drop into.
            bank.pads.length === 0 && slotIndex == null && 'min-h-[56px]',
          )}
        >
          {cells}
          {bank.pads.length === 0 && slotIndex == null && editing && (
            <div className="flex min-h-[56px] items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground">
              Drag a pad here
            </div>
          )}
        </div>
      </div>
      {editing && draggingBank && (
        <div
          ref={setUnderRef}
          className={cn(
            'grid h-[26px] place-items-center rounded-lg border-2 border-dashed text-[10px] font-semibold transition-colors',
            isOverUnder
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground',
          )}
        >
          stack under
        </div>
      )}
    </>
  )
}
