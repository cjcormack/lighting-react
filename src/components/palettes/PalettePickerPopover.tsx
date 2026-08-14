import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { serializePaletteRef } from '@/lib/programmerValue'
import { PALETTE_TYPE_LABELS } from '@/lib/paletteTypes'
import { usePaletteListQuery } from '@/store/palettes'
import { PalettePreviewRow } from './paletteValue'
import type { PaletteType } from '@/api/palettesApi'

export interface PalettePickerPopoverProps {
  projectId: number
  /**
   * Restrict to palettes of this type. Set it wherever the property is known: a COLOUR palette
   * referenced from a `position` row can never resolve, and offering it would only produce a
   * `paletteTypeMismatch` an hour later.
   */
  type?: PaletteType
  /** Receives the stored value form (`ref:{uuid}`), ready to drop into a value field. */
  onPick: (value: string) => void
}

/**
 * Pick a palette to reference from a stored row.
 *
 * Writes the reference *string*, not the palette's values — which is the entire point of the
 * feature: the row keeps tracking the palette, and one edit to the palette moves every row that
 * names it.
 */
export function PalettePickerPopover({ projectId, type, onPick }: PalettePickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { data: palettes } = usePaletteListQuery({ projectId, type }, { skip: !isOpen })

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" title="Reference a palette instead">
          <Link2 className="size-3.5" />
          Palette
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-1" align="end">
        <p className="text-xs text-muted-foreground">
          {type
            ? `${PALETTE_TYPE_LABELS[type].plural} — the row follows the palette.`
            : 'The row follows the palette.'}
        </p>
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {(palettes ?? []).map((palette) => (
            <button
              key={palette.id}
              type="button"
              onClick={() => {
                onPick(serializePaletteRef(palette.uuid))
                setIsOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate">{palette.name}</span>
              <PalettePreviewRow
                type={palette.type}
                preview={palette.preview.slice(0, 4)}
                className="shrink-0"
              />
            </button>
          ))}
          {(palettes ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No palettes of this type yet. Record one from the programmer.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
