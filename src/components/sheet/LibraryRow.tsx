import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { SheetPage } from './SheetPage'

/**
 * **Row B for a library** (library-sheets plan D2): the filter · the partition chips · a spacer ·
 * the create verb, on the list shell's 40px chrome row. The create verb leaves the page header for
 * it, as the patch list's *+ Patch* did.
 *
 * Every slot but the filter is optional: Speed Masters and Looks partition nothing and draw no chips
 * (D3), and a library read from another project has no create verb.
 */
export function LibraryRow({
  filter,
  onFilterChange,
  filterLabel = 'Filter by name',
  chips,
  create,
  className,
}: {
  filter: string
  onFilterChange: (next: string) => void
  /** The field's accessible name and tooltip — what the filter matches. */
  filterLabel?: string
  /** A `PartitionChips`, where the library partitions exactly. */
  chips?: ReactNode
  /** The create verb — `+ New master`, `+ New template`. */
  create?: ReactNode
  className?: string
}) {
  return (
    <SheetPage.Row className={className}>
      <div className="relative min-w-0 max-w-[340px] flex-[999_1_0%]">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter…"
          title={filterLabel}
          aria-label={filterLabel}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="h-8 pl-9"
        />
      </div>
      {/* With chips, their own container is the row's slack — the spacer; without, a spacer. */}
      {chips ?? <div className="flex-1" />}
      {create}
    </SheetPage.Row>
  )
}

/** One partition a library divides into — a script type, an effect category, a template family. */
export interface PartitionOption<V extends string> {
  value: V
  label: string
  /** How many records are in it — drawn beside the label. */
  count?: number
  icon?: ReactNode
}

/**
 * The partition chips (library-sheets plan D3): *All* plus one per partition, each with its count —
 * `LookFamilyFilterBar` generalised, and **controlled** as that is: a value and the counts in, a
 * change out. The `?param=` and the remembered value are the **route's** (as `routes/Templates.tsx`
 * owns `looks.family` through `get/setStoredLookFamily`), so the same chips mount with local state
 * inside `TemplatePicker`'s portalled popover.
 *
 * **Below 600px of its own container the chips fold into a select.** The chips' own container, not
 * the viewport and not the row, because the popover has no row: a container query measures the
 * nearest `@container` ancestor, and this component brings its own. On a library row the container
 * takes the row's slack (it is the spacer), so 600 is the width left after the filter and the create
 * verb. The number is a first cut, to be re-measured in the app when the first sheet mounts the
 * chips (plan §10: the rules are the decision, the numbers are not).
 */
export function PartitionChips<V extends string>({
  options,
  value,
  onChange,
  allLabel = 'All',
  allCount,
  label,
  className,
}: {
  options: readonly PartitionOption<V>[]
  /** The partition shown, or `'ALL'`. */
  value: V | 'ALL'
  onChange: (next: V | 'ALL') => void
  allLabel?: string
  /** The whole library's count, beside *All*. */
  allCount?: number
  /** What the chips partition by — the select's accessible name. */
  label: string
  className?: string
}) {
  const all: PartitionOption<V | 'ALL'> = { value: 'ALL', label: allLabel, count: allCount }
  const items: PartitionOption<V | 'ALL'>[] = [all, ...options]
  return (
    <div className={cn('@container min-w-0 flex-1', className)}>
      <nav
        aria-label={label}
        className="hidden items-center gap-0.5 rounded-lg border bg-card p-0.5 @[600px]:inline-flex"
      >
        {items.map((item) => {
          const active = item.value === value
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(item.value)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold',
                active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count != null && (
                <span className="font-mono text-[10px] font-normal tabular-nums text-muted-foreground">
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <div className="@[600px]:hidden">
        <Select value={value} onValueChange={(next) => onChange(next as V | 'ALL')}>
          <SelectTrigger size="sm" aria-label={label} className="h-8 w-auto min-w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
                {item.count != null ? ` · ${item.count}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
