import { memo } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CellResolution } from '../columns'
import type { CellCommit } from '../rowModel'
import type { CellValue } from '../useRowValues'
import { CellEditorSurface, useCellEditorForm } from './CellEditorSurface'
import { UNSET_CELL_TITLE, UnsetCellMark } from './UnsetCellMark'
import { useCellEditorOpen } from './useCellEditorOpen'

interface SettingCellProps {
  value: Extract<CellValue, { kind: 'setting' }>
  resolutions: NonNullable<CellResolution>[]
  /** The column's name, titling the editor where it is a bottom sheet. See `SliderCell`. */
  label?: string
  batchCount: number
  /** No value in the current scope — see `UnsetCellMark`. */
  placeholder?: boolean
  /**
   * The cell cannot take an edit — the desk is unreachable, so the write would go nowhere.
   * A real `disabled` rather than the wrapper's `pointer-events-none` alone: that stops the
   * mouse and not the keyboard, and this trigger is tabbable.
   */
  disabled?: boolean
  /**
   * A released single-column marquee named this cell: open the editor without a click.
   * See `useCellEditorOpen`.
   */
  autoOpen?: boolean
  /**
   * Nothing is selected any more, so this editor's targets are gone with it — close.
   * See `useCellEditorOpen`.
   */
  selectionEmpty?: boolean
  onCommit: (commit: CellCommit) => void
  onBeginEdit: () => void
}

/**
 * Current option name (with colour chip when the option carries a preview —
 * colour wheels, some gobo wheels); edit via an option list in the shared
 * cell-editor surface. Option
 * levels come from the *first* backing property — heterogeneous groups whose
 * members map options to different levels get the first member's mapping,
 * which is the same compromise the group setting hook makes.
 */
export const SettingCell = memo(function SettingCell({
  value,
  resolutions,
  label = 'Setting',
  batchCount,
  placeholder,
  disabled = false,
  autoOpen,
  selectionEmpty,
  onCommit,
  onBeginEdit,
}: SettingCellProps) {
  const { isOpen, setOpen } = useCellEditorOpen({ autoOpen, disabled, selectionEmpty })
  // This is the one cell editor whose control *is* the list, so each option has to be a touch
  // target wherever a finger can reach it — which is both sheets, and not the popover.
  //
  // **Not a `sm:` variant**, which was the first attempt and was wrong in exactly the case it was
  // written for: `sm:` is `min-width: 640px`, and the side sheet is chosen by *height*. A landscape
  // phone — 852x393, the reference case in `CellEditorSurface`'s own doc — is over 640px wide, so
  // the width variant fired and shrank the rows back on the touch surface that most needed them.
  // Width cannot answer "is this a finger" on this desk; the form can.
  const touchTarget = useCellEditorForm() !== 'popover'
  const first = resolutions[0]
  const options = first.kind === 'setting' || first.kind === 'colour-setting' ? first.property.options : []

  return (
    <CellEditorSurface
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open)
        if (open) onBeginEdit()
      }}
      title={label}
      contentClassName="w-56 p-1"
      trigger={
        <button
          type="button"
          disabled={disabled}
          className="flex h-full w-full items-center gap-1.5 rounded text-left hover:bg-accent/50"
          title={placeholder ? UNSET_CELL_TITLE : undefined}
        >
          {placeholder ? (
            <UnsetCellMark />
          ) : (
            <>
              {value.option?.colourPreview && (
                <span
                  className="ml-1.5 size-3 shrink-0 rounded-sm border border-border"
                  style={{ backgroundColor: value.option.colourPreview }}
                />
              )}
              <span className="mx-1.5 truncate text-xs text-muted-foreground">
                {value.isUniform ? (value.option?.displayName ?? '—') : 'Mixed'}
              </span>
            </>
          )}
        </button>
      }
    >
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
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 text-left text-xs hover:bg-accent',
                touchTarget ? 'py-2.5' : 'py-1.5',
              )}
              onClick={() => {
                onCommit({ kind: 'setting', level: option.level })
                setOpen(false)
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
    </CellEditorSurface>
  )
})
