import { memo, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { useNumberFieldDraft } from '@/hooks/useNumberFieldDraft'
import { CellEditorSurface } from './CellEditorSurface'
import { numericSeed, useCellEditorKeyboard } from './useCellEditorKeyboard'
import { useCellEditorOpen } from './useCellEditorOpen'
import type { SheetCellProps } from '../sheetModel'

export interface LevelCellProps extends SheetCellProps<number> {
  /** What the cell shows — the DMX sheet's two lines, a fill bar. */
  face: ReactNode
  min?: number
  max?: number
}

/**
 * A level cell — one number in a range, a slider and a box, committing **as it is edited**
 * (CLAUDE.md §Sheet kit). The DMX sheet's raw 0–255 value.
 *
 * The same editor `SliderCell` draws for a fixture's dimmer, without the fixture: `SliderCell`
 * takes a `CellResolution` for its range and a `CellValue` for its face, and this takes a number
 * and a face the column draws. Committing live is the ChannelSlider convention — the value drives
 * a channel the operator judges against the rig.
 */
export const LevelCell = memo(function LevelCell({
  value,
  label,
  batchCount,
  disabled,
  autoOpen,
  autoClose,
  anchorAtButton,
  keyboardSeed,
  selectionEmpty,
  editorAnchorRef,
  onBeginEdit,
  onCommit,
  face,
  min = 0,
  max = 255,
}: LevelCellProps) {
  const commit = useCallback(
    (raw: number) => onCommit(Math.max(min, Math.min(max, Math.round(raw)))),
    [max, min, onCommit],
  )
  // `useNumberFieldDraft` owns the "an emptied box must not commit" rule; the clamp stays here.
  const draft = useNumberFieldDraft(String(value), commit)
  const { isOpen, setOpen, keyboardOpen, atButton } = useCellEditorOpen({
    autoOpen,
    autoClose,
    anchorAtButton,
    keyboardSeed,
    disabled,
    selectionEmpty,
    onOpen: draft.reset,
  })
  const { contentRef, onKeyDown, onOpenAutoFocus } = useCellEditorKeyboard({
    onDone: () => setOpen(false),
  })
  // The character that opened this editor lands in the field as though it had been typed there —
  // which means it commits, because every field here writes as it is typed.
  const draftRef = useRef(draft)
  draftRef.current = draft
  useEffect(() => {
    const seed = numericSeed(keyboardOpen)
    if (seed) draftRef.current.onChange(seed)
  }, [keyboardOpen])

  return (
    <CellEditorSurface
      open={isOpen}
      onOpenChange={setOpen}
      title={label}
      contentClassName="w-64"
      onOpenAutoFocus={onOpenAutoFocus}
      triggerOpens={false}
      anchorRef={atButton ? editorAnchorRef : undefined}
      trigger={
        <button
          type="button"
          disabled={disabled}
          onClick={onBeginEdit}
          className="flex h-full w-full items-center rounded text-left hover:bg-accent/50"
        >
          {face}
        </button>
      }
    >
      <div ref={contentRef} onKeyDown={onKeyDown} className="space-y-3">
        {batchCount > 1 && (
          <p className="text-xs text-muted-foreground">Applying to {batchCount} channels</p>
        )}
        <div className="flex items-center gap-3">
          <Slider
            min={min}
            max={max}
            step={1}
            value={[value]}
            onValueChange={([next]) => commit(next)}
            className="flex-1"
          />
          <Input
            type="number"
            min={min}
            max={max}
            aria-label={label}
            className="h-8 w-20 tabular-nums"
            value={draft.value}
            onChange={(e) => draft.onChange(e.target.value)}
            onBlur={draft.onBlur}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {min} – {max}
          </span>
          <span>{Math.round(((value - min) / Math.max(1, max - min)) * 100)}%</span>
        </div>
      </div>
    </CellEditorSurface>
  )
})
