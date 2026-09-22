import { useCallback } from 'react'
import { EditorField } from '@/components/editor/EditorField'

/**
 * A typable 0–255 channel byte — the "type it rather than convert it by hand" half of the colour
 * editor (`PD-COLOUR-EDITOR-INPUTS`).
 *
 * A thin wrapper over the editor kit's `EditorField` since the kit landed (editor-kit plan D9):
 * the field, the draft rule and the 28px box are the kit's, and what stays here is the one thing
 * this component ever decided — the **clamp to the channel byte**, which is the caller's to make
 * and not the field's, because a channel byte is 0–255 while a slider cell's bounds come from its
 * resolution. It survives as a wrapper rather than being folded into its two callers because both
 * sit in `ColourPickerBody`, which session 2 of the plan owns and this session does not touch.
 *
 * It parses and clamps; it never resolves anything, and it knows nothing about intents, policies
 * or emitters — the head's descriptor decided which of these fields exist before this component
 * was rendered.
 */
export function ChannelNumberInput({
  label,
  hideLabel,
  value,
  onChange,
  seed,
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
  /**
   * A character typed at the grid that opened this editor, to land in the field as though it had
   * been typed here — which means it commits, the way every keystroke in this field does. Only the
   * colour editor's **R** box is ever given one: it is the first field, and the keyboard opens on
   * the first field. See `useEditorKeyboard`.
   */
  seed?: string | null
  disabled?: boolean
  className?: string
}) {
  const commit = useCallback(
    (parsed: number) => onChange(Math.max(0, Math.min(255, Math.round(parsed)))),
    [onChange],
  )
  return (
    <EditorField
      label={label}
      prefix={hideLabel ? undefined : label}
      value={Math.round(value)}
      onCommit={commit}
      min={0}
      max={255}
      seed={seed}
      disabled={disabled}
      className={className}
      fieldClassName="px-1.5"
    />
  )
}
