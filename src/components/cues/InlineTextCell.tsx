import { useState, useRef, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface InlineTextCellProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
  /** Placeholder shown when value is null/empty */
  placeholder?: string
  /** Static prefix shown in display mode only (e.g. "Q") */
  prefix?: string
  /** Styling for the display button */
  className?: string
  /** Styling for the Input element */
  inputClassName?: string
  /** Select all text on focus (default true) */
  selectAllOnFocus?: boolean
}

/**
 * Click-to-edit cell for inline string editing in tables.
 * Shows value (with optional prefix) in display mode, switches to a text input on click.
 */
export function InlineTextCell({
  value,
  onChange,
  placeholder = '—',
  prefix,
  className,
  inputClassName,
  selectAllOnFocus = true,
}: InlineTextCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (selectAllOnFocus) inputRef.current.select()
    }
  }, [editing, selectAllOnFocus])

  const commit = useCallback(() => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed === '') {
      if (value != null && value !== '') onChange(null)
      return
    }
    if (trimmed !== value) {
      onChange(trimmed)
    }
  }, [draft, value, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        commit()
      } else if (e.key === 'Escape') {
        setEditing(false)
      }
    },
    [commit],
  )

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={cn('h-6 text-xs px-1', inputClassName)}
      />
    )
  }

  const hasValue = value != null && value !== ''
  const displayText = hasValue ? `${prefix ?? ''}${value}` : placeholder

  return (
    <button
      type="button"
      className={cn(
        'text-xs text-left hover:bg-accent rounded px-1 py-0.5 transition-colors truncate block w-full',
        className,
      )}
      onClick={() => {
        setDraft(value ?? '')
        setEditing(true)
      }}
    >
      <span className={hasValue ? '' : 'text-muted-foreground/50'}>
        {displayText}
      </span>
    </button>
  )
}
