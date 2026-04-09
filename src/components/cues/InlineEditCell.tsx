import { useState, useRef, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'

interface InlineEditCellProps {
  value: number | null | undefined
  onChange: (value: number | null) => void
  /** Format the number for display mode (e.g. formatMs, getBeatDivisionLabel) */
  format?: (value: number) => string
  /** Parse user input string to a number. Return null for empty/clear. */
  parse?: (input: string) => number | null
  /** Placeholder shown when value is null/undefined */
  placeholder?: string
  /** Minimum input value */
  min?: number
  /** Step increment */
  step?: number
}

/**
 * Click-to-edit cell for inline number editing in tables.
 * Shows formatted value in display mode, switches to a text input on click.
 * Supports custom parse functions for human-friendly input (e.g. "4s", "1/8").
 */
export function InlineEditCell({
  value,
  onChange,
  format,
  parse,
  placeholder = '—',
}: InlineEditCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commit = useCallback(() => {
    setEditing(false)
    if (draft.trim() === '') {
      if (value != null) onChange(null)
      return
    }
    const parsed = parse ? parse(draft) : (isNaN(Number(draft)) ? null : Number(draft))
    if (parsed !== value && !(parsed === null && (value === null || value === undefined))) {
      onChange(parsed)
    }
  }, [draft, value, onChange, parse])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      commit()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }, [commit])

  if (editing) {
    return (
      <div className="w-[5rem]">
        <Input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="h-6 text-xs tabular-nums px-1 w-full"
        />
      </div>
    )
  }

  const displayValue = value != null
    ? (format ? format(value) : String(value))
    : placeholder

  return (
    <button
      type="button"
      className="w-[5rem] text-xs tabular-nums text-left hover:bg-accent rounded px-1 py-0.5 transition-colors"
      onClick={() => {
        setDraft(value != null ? (format ? format(value) : String(value)) : '')
        setEditing(true)
      }}
    >
      <span className={value != null ? '' : 'text-muted-foreground/50'}>
        {displayValue}
      </span>
    </button>
  )
}

// ─── Parsers ───────────────────────────────────────────────────────────

/**
 * Parse a human-friendly duration string to milliseconds.
 * Accepts: "4s" → 4000, "2.5s" → 2500, "1m" → 60000, "500ms" → 500, "500" → 500 (raw ms).
 */
export function parseMs(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (s === '') return null

  // Match number + optional unit
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(s|ms|m)?$/)
  if (match) {
    const num = parseFloat(match[1])
    const unit = match[2]
    if (unit === 's') return Math.round(num * 1000)
    if (unit === 'm') return Math.round(num * 60000)
    // "ms" or no unit → raw milliseconds
    return Math.round(num)
  }

  return null
}

/**
 * Parse a human-friendly beat division string to a numeric value.
 * Accepts: "1/8" → 0.5, "1/4" → 1.0, "1/2" → 2.0, "1 bar" → 4.0, "2 bars" → 8.0,
 *          "trip" → 0.333, or raw numbers like "0.5" → 0.5.
 */
export function parseBeatDivision(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (s === '') return null

  // Named values
  const NAMED: Record<string, number> = {
    'trip': 0.333, 'triplet': 0.333,
    '1 bar': 4.0, '1bar': 4.0, 'bar': 4.0,
    '2 bars': 8.0, '2bars': 8.0, '2 bar': 8.0,
  }
  if (NAMED[s] != null) return NAMED[s]

  // Fraction: "1/8", "1/4", "1/16", "1/32"
  const fracMatch = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fracMatch) {
    const num = parseInt(fracMatch[1])
    const den = parseInt(fracMatch[2])
    if (den === 0) return null
    // Beat divisions: 1/32=0.125, 1/16=0.25, 1/8=0.5, 1/4=1.0, 1/2=2.0
    // The convention is: 1/4 = 1 beat, so multiply fraction by 4
    return (num / den) * 4
  }

  // Raw number
  const num = parseFloat(s)
  if (!isNaN(num) && num > 0) return num

  return null
}
