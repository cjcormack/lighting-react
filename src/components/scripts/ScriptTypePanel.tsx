import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ListFilter } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScriptType } from '@/store/scripts'
import { ALL_SCRIPT_TYPES, SCRIPT_TYPE_LABELS, SCRIPT_TYPE_ICONS } from './scriptUtils'

export type ScriptTypeFilter = 'all' | ScriptType

interface ScriptTypePanelProps {
  selectedFilter: ScriptTypeFilter
  onSelectFilter: (filter: ScriptTypeFilter) => void
  typeCounts: Record<string, number>
  totalCount: number
}

function PanelContent({
  selectedFilter,
  onSelectFilter,
  typeCounts,
  totalCount,
}: ScriptTypePanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-0.5 p-2">
          {/* All scripts */}
          <button
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors',
              selectedFilter === 'all'
                ? 'bg-accent text-accent-foreground font-medium'
                : 'hover:bg-accent/50 text-muted-foreground',
            )}
            onClick={() => onSelectFilter('all')}
          >
            <span className="flex-1 text-left">All Scripts</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {totalCount}
            </Badge>
          </button>

          {/* Per-type filters (only types with scripts) */}
          {ALL_SCRIPT_TYPES.filter((t) => (typeCounts[t] ?? 0) > 0).map(
            (scriptType) => {
              const Icon = SCRIPT_TYPE_ICONS[scriptType]
              return (
                <button
                  key={scriptType}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors',
                    selectedFilter === scriptType
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'hover:bg-accent/50 text-muted-foreground',
                  )}
                  onClick={() => onSelectFilter(scriptType)}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1 text-left">
                    {SCRIPT_TYPE_LABELS[scriptType]}
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {typeCounts[scriptType]}
                  </Badge>
                </button>
              )
            },
          )}
        </div>
      </div>
    </div>
  )
}

export function ScriptTypeSidebar(props: ScriptTypePanelProps) {
  return (
    <div className="w-56 lg:w-72 shrink-0 border-r flex flex-col h-full overflow-hidden">
      <PanelContent {...props} />
    </div>
  )
}

export function ScriptTypeMobileSheet({
  open,
  onOpenChange,
  selectedFilterLabel,
  ...props
}: ScriptTypePanelProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedFilterLabel: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs shrink-0"
        >
          <ListFilter className="size-3.5" />
          {selectedFilterLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh]">
        <SheetHeader>
          <SheetTitle>Script Types</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <PanelContent
            {...props}
            onSelectFilter={(filter) => {
              props.onSelectFilter(filter)
              onOpenChange(false)
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
