import { useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CellEditorSurface } from './cells/CellEditorSurface'

/**
 * The typed-value editor for a cell selection — the keyboard half of the marquee, drawn the way the
 * cell editors are drawn.
 *
 * Opened by Enter (or a digit) from the grid and **anchored at the first selected cell**, in the
 * same surface, at the same size, with the same "Applying to N targets" line the slider editor
 * opens with — so the operator sees one kind of thing happen whether they clicked a cell or
 * pressed Enter. That is what makes it `CellEditorSurface`'s rather than a popover of its own:
 * where a cell editor folds to a bottom sheet, so does this, or the two gestures stop matching.
 * It replaced a small input in the selection bar, which was too far from the cells and too quiet
 * to read as "this is where your keystrokes are going".
 *
 * Enter applies and closes, Escape closes, and a value that could not be read or fitted nothing
 * stays in the field with the reason on it. Controlled from the container because the container
 * owns the keystroke that seeds it — a `1` typed at the grid has to arrive here as text.
 *
 * The anchor is a fixed-position box over the cell's measured rect rather than the cell itself:
 * the rows are virtualised and belong to the table, and the container that owns this editor only
 * knows the cell by `(rowId, col)`. Radix positions against the box; it goes stale if the list
 * scrolls while open, and a click outside closes it then as always. A bottom sheet ignores it —
 * it is anchored to the screen — which also disposes of the staleness on the surface that has it
 * worst, a phone.
 */
export function CellEntryPopover({
  open,
  onOpenChange,
  anchor,
  value,
  onChange,
  onSubmit,
  hint,
  problem,
  count,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Viewport rect of the first selected cell; null anchors at the top of the grid instead. */
  anchor: { left: number; top: number; width: number; height: number } | null
  value: string
  onChange: (next: string) => void
  /** Enter. The container parses and commits; it reports back through [problem]. */
  onSubmit: () => void
  /** What the selected columns will take — `cellEntryHint`. */
  hint: string
  /**
   * Why the last Enter did nothing, or null. Cleared by the next keystroke. `unreadable` is text
   * the grammar could not parse; `nowhere` parsed but fitted none of the selected columns — `127`
   * at a colour-only marquee — which the field says rather than closing as if it had landed.
   */
  problem: 'unreadable' | 'nowhere' | null
  /** How many write targets the selection resolves to — the slider editor's own count. */
  count: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Focus on open, and again when a seeded keystroke arrives while already open. Radix's own
  // auto-focus lands on the content element, not the field.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const message =
    problem === 'unreadable'
      ? `Could not read that — try ${hint}`
      : problem === 'nowhere'
        ? 'That value fits none of the selected cells'
        : hint

  return (
    <CellEditorSurface
      open={open}
      onOpenChange={onOpenChange}
      title="Set value"
      anchor={anchor}
      contentClassName="w-64 space-y-3"
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        inputRef.current?.focus()
      }}
    >
      <p className="text-xs text-muted-foreground">Applying to {count} targets</p>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onSubmit()
          }
        }}
        aria-label={`Value for ${count} selected cells`}
        aria-invalid={problem != null || undefined}
        spellCheck={false}
        autoComplete="off"
        className={cn(
          'h-9 font-mono tabular-nums',
          problem != null && 'border-destructive ring-1 ring-destructive/40',
        )}
      />
      <p className={cn('text-[11px]', problem != null ? 'text-destructive' : 'text-muted-foreground')}>
        {message}
      </p>
    </CellEditorSurface>
  )
}
