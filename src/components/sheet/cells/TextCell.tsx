import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CellEditorSurface } from './CellEditorSurface'
import { useCellEditorKeyboard } from './useCellEditorKeyboard'
import { useCellEditorOpen } from './useCellEditorOpen'
import type { SheetCellProps } from '../sheetModel'

export interface TextCellProps extends SheetCellProps<string> {
  /** What the cell shows. Defaults to the value, or an em-dash for an empty one. */
  face?: ReactNode
  placeholder?: string
  /** Draw the value in the mono face — keys, fade times. */
  mono?: boolean
  /**
   * Refuse a draft, with the reason shown under the field. Enter and Apply are withheld while it
   * answers; the editor stays open so the operator can fix the text rather than lose it.
   */
  validate?: (draft: string) => string | null
  /** The commit for an emptied field. Absent means an empty draft is refused. */
  allowEmpty?: boolean
}

/**
 * A text cell — name, key, notes, a fade time: an input, commit on Enter, Escape reverts
 * (CLAUDE.md §Sheet kit).
 *
 * It commits on Enter rather than as it is typed, unlike the level and colour editors: those
 * drive a live channel the operator judges by eye, and a half-typed name is not a value anyone
 * wants written. The draft is seeded from the value on every open and from the character typed
 * at the grid when the keyboard opened it; Escape closes the surface and the draft dies with it.
 */
export const TextCell = memo(function TextCell({
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
  placeholder,
  mono,
  validate,
  allowEmpty = false,
}: TextCellProps) {
  const [draft, setDraft] = useState(value)
  const valueRef = useRef(value)
  valueRef.current = value
  const reset = useCallback(() => setDraft(valueRef.current), [])

  const { isOpen, setOpen, keyboardOpen, atButton } = useCellEditorOpen({
    autoOpen,
    autoClose,
    anchorAtButton,
    keyboardSeed,
    disabled,
    selectionEmpty,
    onOpen: reset,
  })
  // The character that opened the editor replaces the draft: typing at the grid is the operator
  // starting a new value, not appending to the old one.
  useEffect(() => {
    if (keyboardOpen) setDraft(keyboardOpen)
  }, [keyboardOpen])

  const trimmed = draft.trim()
  const error = trimmed === '' && !allowEmpty ? `${label} cannot be empty` : (validate?.(draft) ?? null)
  const commit = useCallback(() => {
    if (error) return false
    onCommit(trimmed)
    return true
  }, [error, onCommit, trimmed])

  const { contentRef, onKeyDown, onOpenAutoFocus } = useCellEditorKeyboard({
    onDone: () => {
      if (commit()) setOpen(false)
    },
  })

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
          {face ?? (
            <span className={cn('mx-1.5 truncate text-xs', mono && 'font-mono tabular-nums', value === '' && 'text-muted-foreground/60')}>
              {value === '' ? '—' : value}
            </span>
          )}
        </button>
      }
    >
      <div ref={contentRef} onKeyDown={onKeyDown} className="space-y-3">
        {batchCount > 1 && (
          <p className="text-xs text-muted-foreground">Applying to {batchCount} rows</p>
        )}
        <Input
          type="text"
          aria-label={label}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className={cn('h-8', mono && 'font-mono tabular-nums')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={error != null}
            onClick={() => {
              if (commit()) setOpen(false)
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </CellEditorSurface>
  )
})
