import { memo, useState } from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PaletteRefNotice } from './PaletteRefNotice'
import type { CellResolution } from '../columns'
import type { CellPaletteRef } from '../useRowOwnership'
import type { CellCommit } from '../rowModel'
import type { CellValue } from '../useRowValues'

interface SettingCellProps {
  value: Extract<CellValue, { kind: 'setting' }>
  resolutions: NonNullable<CellResolution>[]
  batchCount: number
  /** Set when this cell's programmer entries reference a named palette. */
  paletteRef?: CellPaletteRef
  onCommit: (commit: CellCommit) => void
  onBeginEdit: () => void
}

/**
 * Current option name (with colour chip when the option carries a preview —
 * colour wheels, some gobo wheels); edit via a popover option list. Option
 * levels come from the *first* backing property — heterogeneous groups whose
 * members map options to different levels get the first member's mapping,
 * which is the same compromise the group setting hook makes.
 */
export const SettingCell = memo(function SettingCell({
  value,
  resolutions,
  batchCount,
  paletteRef,
  onCommit,
  onBeginEdit,
}: SettingCellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const first = resolutions[0]
  const options = first.kind === 'setting' || first.kind === 'colour-setting' ? first.property.options : []

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (open) onBeginEdit()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-full w-full items-center gap-1.5 rounded px-1.5 text-left hover:bg-accent/50"
        >
          {value.option?.colourPreview && (
            <span
              className="size-3 shrink-0 rounded-sm border border-border"
              style={{ backgroundColor: value.option.colourPreview }}
            />
          )}
          <span className="truncate text-xs text-muted-foreground">
            {value.isUniform ? (value.option?.displayName ?? '—') : 'Mixed'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        {paletteRef && (
          <div className="px-2 py-1.5">
            <PaletteRefNotice paletteRef={paletteRef} />
          </div>
        )}
        {batchCount > 1 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Applying to {batchCount} targets
          </p>
        )}
        <div className="max-h-64 overflow-y-auto">
          {options.map((option) => {
            const isCurrent = value.isUniform && value.option?.name === option.name
            return (
              <button
                key={`${option.name}:${option.level}`}
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                onClick={() => {
                  onCommit({ kind: 'setting', level: option.level })
                  setIsOpen(false)
                }}
              >
                {option.colourPreview ? (
                  <span
                    className="size-3 shrink-0 rounded-sm border border-border"
                    style={{ backgroundColor: option.colourPreview }}
                  />
                ) : (
                  <span className="size-3 shrink-0" />
                )}
                <span className="flex-1 truncate">{option.displayName}</span>
                {isCurrent && <Check className="size-3 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
})
