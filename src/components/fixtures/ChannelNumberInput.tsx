import { useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { useNumberFieldDraft } from '@/hooks/useNumberFieldDraft'
import { cn } from '@/lib/utils'

/**
 * A typable 0–255 channel byte — the "type it rather than convert it by hand" half of the colour
 * editor (`PD-COLOUR-EDITOR-INPUTS`).
 *
 * Deliberately a *raw byte* field and nothing cleverer. Every caller sits beside a picker or a
 * slider that already writes the same channel, so this has one job: take a number, clamp it to the
 * channel's range, and hand it over. It parses and clamps; it never resolves anything, and it
 * knows nothing about intents, policies or emitters — the head's descriptor decided which of these
 * fields exist before this component was rendered.
 *
 * **Mid-retype must not commit** — `useNumberFieldDraft`, which is that rule and nothing else,
 * shared with `SliderCell`'s popover field. Clamping is this component's own job rather than the
 * hook's, because a channel byte is 0–255 while a slider cell's bounds come from its resolution's
 * descriptor; the hook parses, the caller decides what the number may be.
 */
export function ChannelNumberInput({
  label,
  hideLabel,
  value,
  onChange,
  disabled,
  className,
}: {
  /** The field's accessible name, and its visible prefix unless [hideLabel] — `R`, `G`, `B`. */
  label: string
  /**
   * The row already names the channel, so draw the name for a screen reader only — an emitter row
   * carries a tinted dot and its letter beside the slider, and repeating it here put a second "W"
   * a few pixels from the first.
   */
  hideLabel?: boolean
  value: number
  onChange: (next: number) => void
  disabled?: boolean
  className?: string
}) {
  const draft = useNumberFieldDraft(
    String(Math.round(value)),
    useCallback((parsed: number) => onChange(Math.max(0, Math.min(255, Math.round(parsed)))), [onChange]),
  )

  return (
    <label className={cn('flex items-center gap-1.5', className)}>
      {!hideLabel && (
        <span className="w-5 shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
          {label}
        </span>
      )}
      <Input
        type="number"
        min={0}
        max={255}
        step={1}
        disabled={disabled}
        aria-label={label}
        className="h-7 w-full min-w-0 px-1.5 text-xs tabular-nums"
        value={draft.value}
        onChange={(e) => draft.onChange(e.target.value)}
        onBlur={draft.onBlur}
      />
    </label>
  )
}
