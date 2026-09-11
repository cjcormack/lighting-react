import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import type { useNumberFieldDraft } from '@/hooks/useNumberFieldDraft'

/**
 * One named value, said twice: a typed box and a slider that drive the same number.
 *
 * Shared because the two panels that draw it are the two the keyboard work gave text fields to —
 * `PositionCell`'s Pan and Tilt, and `FanPopover`'s From and To — and they had arrived at
 * byte-identical markup. A row is the unit an editor's keyboard rules land on (`useCellEditorKeyboard`
 * finds "the next field" by walking the inputs in DOM order), so a future change to the field's
 * height, its aria wiring or its select-on-focus behaviour has to reach both or neither.
 *
 * `SliderCell` is deliberately *not* a third caller: its row is the other way round — the slider
 * takes the width and the box sits beside it, because that editor is one value and has the whole
 * popover for it. Folding that in would mean a layout prop, which is where a shared component
 * stops sharing anything.
 *
 * The [draft] rather than a bare value is the point of the split: `useNumberFieldDraft` owns the
 * "an emptied box must not commit" rule, and the caller owns the clamp, because a position's
 * bounds come from its resolution while a fan's ends are flat bytes.
 */
export function ValueFieldRow({
  label,
  min,
  max,
  value,
  draft,
  onSlide,
}: {
  /** Names the row, and is the field's accessible name. */
  label: string
  min: number
  max: number
  /** What the slider shows — the desk's value, not the draft's text. */
  value: number
  draft: ReturnType<typeof useNumberFieldDraft>
  onSlide: (next: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <Input
          type="number"
          min={min}
          max={max}
          step={1}
          aria-label={label}
          className="h-7 w-20 tabular-nums"
          value={draft.value}
          onChange={(e) => draft.onChange(e.target.value)}
          onBlur={draft.onBlur}
        />
      </div>
      <Slider min={min} max={max} step={1} value={[value]} onValueChange={([next]) => onSlide(next)} />
    </div>
  )
}
