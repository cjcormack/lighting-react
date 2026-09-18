import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DeskChip } from '@/components/desk/DeskChip'
import { formatFamilyList, type AttributeFamily } from '@/lib/attributeFamily'
import { cn } from '@/lib/utils'
import { BuskLabel } from './BuskLabel'
import { summariseSelection, type BuskingTarget } from './buskingTypes'

/**
 * The rig **folded** to a 32px strip — Pads focus (busk-further plan D5, `Focus.dc.html`).
 *
 * It keeps what a press needs to be honest about: the selection summary, the family pill and the
 * desk chip. It cannot select — that is the other screen's job, or a tap on the chevron to unfold
 * Split. Built here so the band and its strip are one file apart and share one summary;
 * `BuskingView` mounts it in place of the band while `busk.focus` is `pads`.
 *
 * **On the short board the strip has no row of its own** (`Phones.dc.html`, landscape): the rig
 * strip and the page strip merge into one 32px row, so the pieces are [RigStripContent] and the
 * row is here only for the boards where the strip stands alone. One set of pieces, placed on one
 * of two rows — never a third strip.
 */
export interface RigStripProps {
  selectedTargets: Map<string, BuskingTarget>
  families: AttributeFamily[] | null
  onUnfold: () => void
  className?: string
}

export function RigStrip({ className, ...content }: RigStripProps) {
  return (
    <div data-rig-strip className={cn('flex h-8 shrink-0 items-center gap-2.5 border-b px-4', className)}>
      <RigStripContent {...content} />
    </div>
  )
}

/** The strip's pieces — label, summary, family pill, desk chip, chevron — without a row. */
export function RigStripContent({ selectedTargets, families, onUnfold }: Omit<RigStripProps, 'className'>) {
  const summary = summariseSelection([...selectedTargets.values()])
  return (
    <>
      <BuskLabel>Rig</BuskLabel>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{summary}</span>
      {families != null && families.length > 0 && (
        <Badge
          variant="outline"
          className="shrink-0 whitespace-nowrap border-primary/40 bg-primary/10 px-2 py-0 text-[10px] text-primary"
        >
          {formatFamilyList(families, ' · ')}
        </Badge>
      )}
      <DeskChip showSubject />
      <button
        type="button"
        onClick={onUnfold}
        aria-label="Unfold the rig"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className="size-4" />
      </button>
    </>
  )
}
