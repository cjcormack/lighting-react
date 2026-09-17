import { LayoutGrid, Lightbulb, Rows2, type LucideIcon } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { isBuskFocus, setBuskFocus, useBuskFocus, type BuskFocus } from '@/lib/buskWindow'
import { cn } from '@/lib/utils'

/**
 * The **Focus** segmented control — Split · Pads · Rig — on the page strip beside *Edit layout*
 * (busk-further plan D5–D6, `Focus.dc.html`). It reads and writes the window's `busk.focus` and
 * nothing else, so it and the rig band's rows handle are one setting: the handle dragged past the
 * last row lands on *Rig* here, and to none on *Pads*.
 *
 * Glyphs only below `sm`, one control still. Disabled while editing: edit mode forces Split for its
 * duration, because a palette drag needs both regions on screen, and restores the window's focus on
 * Done — the fact is never written by entering edit mode, so there is nothing to restore *to*.
 */
const FOCUSES: readonly { id: BuskFocus; label: string; icon: LucideIcon; title: string }[] = [
  { id: 'split', label: 'Split', icon: Rows2, title: 'Split: rig rows above, the page below' },
  { id: 'pads', label: 'Pads', icon: LayoutGrid, title: 'Pads: the page fills the body, the rig folds to a strip' },
  { id: 'rig', label: 'Rig', icon: Lightbulb, title: 'Rig: every row at full size, the page folds to its strip' },
]

export function BuskFocusControl({ disabled = false, className }: { disabled?: boolean; className?: string }) {
  const focus = useBuskFocus()
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={focus}
      onValueChange={(next) => {
        // Radix answers '' for a press on the lit segment; a focus is never "none".
        if (isBuskFocus(next)) setBuskFocus(next)
      }}
      aria-label="Focus"
      disabled={disabled}
      className={cn('h-7 shrink-0 gap-0.5 p-0.5', className)}
    >
      {FOCUSES.map((entry) => (
        <ToggleGroupItem
          key={entry.id}
          value={entry.id}
          aria-label={entry.label}
          title={entry.title}
          className="h-6 gap-1 px-2 text-xs"
        >
          <entry.icon className="size-3.5" />
          <span className="hidden sm:inline">{entry.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
