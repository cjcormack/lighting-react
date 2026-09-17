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
 * Split. Built here so the band and its strip are one file apart and share one summary; **session
 * 4 mounts it** when `busk.focus` arrives. Nothing else does yet.
 */
export function RigStrip({
  selectedTargets,
  families,
  onUnfold,
  className,
}: {
  selectedTargets: Map<string, BuskingTarget>
  families: AttributeFamily[] | null
  onUnfold: () => void
  className?: string
}) {
  const summary = summariseSelection([...selectedTargets.values()])
  return (
    <div className={cn('flex h-8 shrink-0 items-center gap-2.5 border-b px-4', className)}>
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
    </div>
  )
}
