import { Link2, Link2Off } from 'lucide-react'
import { describePaletteRef } from '../ownership'
import type { CellPaletteRef } from '../useRowOwnership'

/**
 * The line every cell editor shows above its controls when the cell references a palette.
 *
 * This is not garnish. Dragging a slider or picking a colour on a referencing cell silently
 * *breaks* the reference — the programmer slot becomes a plain literal and stops following the
 * palette — and the moment the editor opens is the only one where we can say so before it
 * happens. It sits in every one of the four editors for that reason; leaving it out of one would
 * make that column the one where the reference dies quietly.
 */
export function PaletteRefNotice({ paletteRef }: { paletteRef?: CellPaletteRef }) {
  if (!paletteRef) return null
  const Icon = paletteRef.resolved ? Link2 : Link2Off
  return (
    <p
      className={`flex items-start gap-1.5 text-xs ${
        paletteRef.resolved ? 'text-muted-foreground' : 'text-destructive'
      }`}
    >
      <Icon className="mt-px size-3 shrink-0" />
      <span>
        {/* Capitalised in place rather than stored capitalised: the same clause is appended
            mid-sentence to the cell's hover title. */}
        {describePaletteRef(paletteRef).replace(/^./, (c) => c.toUpperCase())}. Editing this cell
        replaces the reference with a fixed value.
      </span>
    </p>
  )
}
