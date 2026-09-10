import { memo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import type { CellResolution } from '../columns'
import type { CellCommit } from '../rowModel'
import type { CellValue } from '../useRowValues'
import { UNSET_CELL_TITLE, UnsetCellMark } from './UnsetCellMark'
import { useCellEditorOpen } from './useCellEditorOpen'

interface SliderCellProps {
  value: Extract<CellValue, { kind: 'slider' }>
  resolutions: NonNullable<CellResolution>[]
  /** How many fixtures a commit from this cell will write to. */
  batchCount: number
  /**
   * The current scope holds no value here: draw an em-dash instead of the fill bar, but keep
   * `value` as the editor's starting point so a busk begins where the rig is. See `UnsetCellMark`.
   */
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
  onCommit: (commit: CellCommit) => void
  onBeginEdit: () => void
}

function toPct(value: number): number {
  return Math.round((value / 255) * 100)
}

/**
 * Display: compact fill bar + percentage; a group with mixed values renders a
 * min–max range bar and "lo–hi%". Edit: popover slider + numeric input,
 * committing continuously while dragging (the ChannelSlider convention).
 */
export const SliderCell = memo(function SliderCell({
  value,
  resolutions,
  batchCount,
  placeholder,
  disabled = false,
  autoOpen,
  onCommit,
  onBeginEdit,
}: SliderCellProps) {
  const [inputText, setInputText] = useState<string | null>(null)
  // The typed input is reset on every open, by a click or by a marquee alike — which is why it is
  // `onOpen` on the hook rather than part of the `onOpenChange` handler below.
  const { isOpen, setOpen } = useCellEditorOpen({
    autoOpen,
    disabled,
    onOpen: () => setInputText(null),
  })

  const first = resolutions[0]
  const range = first.kind === 'slider' ? { min: first.property.min, max: first.property.max } : { min: 0, max: 255 }
  const current = value.max

  const commit = (raw: number) => {
    const clamped = Math.max(range.min, Math.min(range.max, Math.round(raw)))
    onCommit({ kind: 'slider', value: clamped })
  }

  const display = value.isUniform ? `${toPct(value.min)}%` : `${toPct(value.min)}–${toPct(value.max)}%`

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open)
        if (open) onBeginEdit()
      }}
    >
      <PopoverTrigger asChild>
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
              <span className="relative ml-1.5 h-1.5 min-w-6 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="absolute inset-y-0 rounded-full bg-primary"
                  style={
                    value.isUniform
                      ? { left: 0, width: `${toPct(value.min)}%` }
                      : { left: `${toPct(value.min)}%`, width: `${Math.max(toPct(value.max) - toPct(value.min), 2)}%` }
                  }
                />
              </span>
              <span className="mr-1.5 w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {display}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        {batchCount > 1 && (
          <p className="text-xs text-muted-foreground">Applying to {batchCount} targets</p>
        )}
        <div className="flex items-center gap-3">
          <Slider
            min={range.min}
            max={range.max}
            step={1}
            value={[current]}
            onValueChange={([next]) => commit(next)}
            className="flex-1"
          />
          <Input
            type="number"
            min={range.min}
            max={range.max}
            className="h-8 w-20 tabular-nums"
            value={inputText ?? String(current)}
            onChange={(e) => {
              setInputText(e.target.value)
              // An empty field (mid-retype) must not commit — Number('') is 0,
              // which would black out the whole selection.
              if (e.target.value.trim() === '') return
              const parsed = Number(e.target.value)
              if (Number.isFinite(parsed)) commit(parsed)
            }}
            onBlur={() => setInputText(null)}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
})
