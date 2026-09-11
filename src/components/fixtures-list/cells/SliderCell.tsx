import { memo, useCallback, useEffect, useRef } from 'react'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { useNumberFieldDraft } from '@/hooks/useNumberFieldDraft'
import type { CellResolution } from '../columns'
import type { CellCommit } from '../rowModel'
import type { CellValue } from '../useRowValues'
import { CellEditorSurface } from './CellEditorSurface'
import { UNSET_CELL_TITLE, UnsetCellMark } from './UnsetCellMark'
import { numericSeed, useCellEditorKeyboard } from './useCellEditorKeyboard'
import { useCellEditorOpen } from './useCellEditorOpen'

interface SliderCellProps {
  value: Extract<CellValue, { kind: 'slider' }>
  resolutions: NonNullable<CellResolution>[]
  /**
   * The column's name — "Dimmer", "Zoom" — which titles the editor where it is a bottom sheet.
   * See `CellEditorSurface`. Defaulted rather than required because the value's `kind` cannot
   * supply it (one `slider` cell is a dimmer and the next is an iris) and two callers mount these
   * components read-only, where the editor never opens.
   */
  label?: string
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
  /**
   * The auto-open came from a character typed at the grid, which lands in the number field as its
   * first keystroke. Focus is not its business — the field is focused however the editor was
   * opened. See `useCellEditorKeyboard`.
   */
  keyboardSeed?: string | null
  /**
   * Nothing is selected any more, so this editor's targets are gone with it — close.
   * See `useCellEditorOpen`.
   */
  selectionEmpty?: boolean
  onCommit: (commit: CellCommit) => void
  onBeginEdit: () => void
}

function toPct(value: number): number {
  return Math.round((value / 255) * 100)
}

/**
 * Display: compact fill bar + percentage; a group with mixed values renders a
 * min–max range bar and "lo–hi%". Edit: a slider + numeric input in the shared cell-editor
 * surface, committing continuously while dragging (the ChannelSlider convention).
 */
export const SliderCell = memo(function SliderCell({
  value,
  resolutions,
  label = 'Value',
  batchCount,
  placeholder,
  disabled = false,
  autoOpen,
  keyboardSeed,
  selectionEmpty,
  onCommit,
  onBeginEdit,
}: SliderCellProps) {
  const first = resolutions[0]
  const range = first.kind === 'slider' ? { min: first.property.min, max: first.property.max } : { min: 0, max: 255 }
  const current = value.max

  const commit = useCallback(
    (raw: number) => {
      const clamped = Math.max(range.min, Math.min(range.max, Math.round(raw)))
      onCommit({ kind: 'slider', value: clamped })
    },
    [onCommit, range.min, range.max],
  )
  // The field's own draft text — `useNumberFieldDraft` owns the "an emptied box must not commit"
  // rule, shared with the colour editor's channel fields; the clamp above stays here, because
  // this cell's bounds come from its resolution rather than being a flat byte.
  const draft = useNumberFieldDraft(String(current), commit)
  // The typed input is reset on every open, by a click or by a marquee alike — which is why it is
  // `onOpen` on the hook rather than part of the `onOpenChange` handler below.
  const { isOpen, setOpen, keyboardOpen } = useCellEditorOpen({
    autoOpen,
    keyboardSeed,
    disabled,
    selectionEmpty,
    onOpen: draft.reset,
  })
  const { contentRef, onKeyDown, onOpenAutoFocus } = useCellEditorKeyboard({
    onDone: () => setOpen(false),
  })
  // The character that opened this editor lands in the field as though it had been typed there —
  // which means it commits, because every field here writes as it is typed. Through a ref so the
  // effect depends on the open alone: `draft` is rebuilt on every render, and depending on it
  // would re-seed the field on the operator's next keystroke.
  const draftRef = useRef(draft)
  draftRef.current = draft
  useEffect(() => {
    const seed = numericSeed(keyboardOpen)
    if (seed) draftRef.current.onChange(seed)
  }, [keyboardOpen])

  const display = value.isUniform ? `${toPct(value.min)}%` : `${toPct(value.min)}–${toPct(value.max)}%`

  return (
    <CellEditorSurface
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open)
        if (open) onBeginEdit()
      }}
      title={label}
      contentClassName="w-64"
      onOpenAutoFocus={onOpenAutoFocus}
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
      }
    >
      {/* The wrapper is the editor's keyboard: Enter closes, comma steps between fields, and a
          keyboard-opened editor focuses the first of them. See `useCellEditorKeyboard`. */}
      <div ref={contentRef} onKeyDown={onKeyDown} className="space-y-3">
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
            aria-label={label}
            className="h-8 w-20 tabular-nums"
            value={draft.value}
            onChange={(e) => draft.onChange(e.target.value)}
            onBlur={draft.onBlur}
          />
        </div>
      </div>
    </CellEditorSurface>
  )
})
