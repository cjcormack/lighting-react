import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CueStackCueEntry } from '@/api/cueStacksApi'

function natKey(s: string): string[] {
  return s
    .split(/(\d+)/)
    .filter(Boolean)
    .map((p) => (/^\d+$/.test(p) ? p.padStart(20, '0') : p.toLowerCase()))
}

function natCmp(a: string, b: string): number {
  const ka = natKey(a)
  const kb = natKey(b)
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    if ((ka[i] || '') < (kb[i] || '')) return -1
    if ((ka[i] || '') > (kb[i] || '')) return 1
  }
  return 0
}

export function detectOutOfOrder(cues: CueStackCueEntry[]): boolean {
  const participating = cues.filter(
    (c) => c.cueType === 'STANDARD' && c.cueNumber != null && /^\d/.test(c.cueNumber),
  )
  for (let i = 1; i < participating.length; i++) {
    if (natCmp(participating[i].cueNumber!, participating[i - 1].cueNumber!) < 0) return true
  }
  return false
}

interface OutOfOrderBannerProps {
  onFixOrder: () => void
  onDismiss: () => void
}

export function OutOfOrderBanner({ onFixOrder, onDismiss }: OutOfOrderBannerProps) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-1.5 bg-amber-500/[0.07] border-b border-amber-500/[0.18] text-[12px] text-amber-600 dark:text-amber-500/80 shrink-0">
      <TriangleAlert className="size-3.5 shrink-0" />
      <span>Cue numbers are out of order.</span>
      <Button
        variant="outline"
        size="sm"
        className="h-5 px-2.5 text-[10px] font-bold tracking-wider border-amber-500/30 text-amber-600 dark:text-amber-500/80 hover:bg-amber-500/10"
        onClick={onFixOrder}
      >
        Fix Order
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-5 px-2.5 text-[10px] font-bold tracking-wider border-amber-500/30 text-amber-600 dark:text-amber-500/80 hover:bg-amber-500/10"
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </div>
  )
}
