import { useState, useRef, useEffect, useMemo } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'

export interface SearchableSelectOption {
  value: string
  label: string
  sublabel?: string
  dimmed?: boolean // visual de-prioritization (e.g., not registered)
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string | null
  onValueChange: (value: string | null) => void
  placeholder?: string
  emptyLabel?: string // label for the "none" option
  className?: string
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  emptyLabel = 'Any',
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSearch('')
      // Focus input after popover animation
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!search) return options
    const q = search.toLowerCase()
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q)),
    )
  }, [options, search])

  const selectedLabel = value ? options.find((o) => o.value === value)?.label : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !selectedLabel && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronDown className="size-4 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-1 w-[var(--radix-popover-trigger-width)] max-h-[300px] overflow-hidden flex flex-col"
        align="start"
      >
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="h-8 text-xs mb-1 border-0 shadow-none focus-visible:ring-0"
        />
        <div className="overflow-y-auto flex-1">
          {/* None/Any option */}
          <button
            type="button"
            onClick={() => { onValueChange(null); setOpen(false) }}
            className={cn(
              'flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-xs cursor-pointer',
              'hover:bg-accent hover:text-accent-foreground',
              value === null && 'font-medium',
            )}
          >
            <Check className={cn('size-3.5 shrink-0', value === null ? 'opacity-100' : 'opacity-0')} />
            {emptyLabel}
          </button>
          {filtered.length === 0 && (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No results
            </div>
          )}
          {filtered.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => { onValueChange(option.value); setOpen(false) }}
              className={cn(
                'flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-xs cursor-pointer',
                'hover:bg-accent hover:text-accent-foreground',
                option.dimmed && 'opacity-50',
                value === option.value && 'font-medium',
              )}
            >
              <Check className={cn('size-3.5 shrink-0', value === option.value ? 'opacity-100' : 'opacity-0')} />
              <span className="truncate">{option.label}</span>
              {option.sublabel && (
                <span className="text-muted-foreground text-[10px] truncate ml-auto">
                  {option.sublabel}
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
