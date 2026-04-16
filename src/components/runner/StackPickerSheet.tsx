import { RotateCcw } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { ShowEntryDto } from '@/api/showApi'
import type { CueStack } from '@/api/cueStacksApi'

interface StackPickerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: ShowEntryDto[]
  activeEntryId: number | null
  stackMap: Map<number, CueStack>
  onSwitchToEntry: (entry: ShowEntryDto) => void
}

export function StackPickerSheet({
  open,
  onOpenChange,
  entries,
  activeEntryId,
  stackMap,
  onSwitchToEntry,
}: StackPickerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[70dvh] p-0 gap-0"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Stacks</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto">
          {entries.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              This show has no stacks yet.
            </div>
          ) : (
            entries.map((entry) => {
              if (entry.entryType === 'MARKER') {
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2.5 px-4 py-2 border-b"
                  >
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      {entry.label}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )
              }
              const entryStack =
                entry.cueStackId != null ? stackMap.get(entry.cueStackId) : undefined
              const isActive = entry.id === activeEntryId
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    onSwitchToEntry(entry)
                    onOpenChange(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 h-12 px-4 border-b text-left transition-colors hover:bg-muted/40',
                    isActive &&
                      'bg-primary/10 border-l-[3px] border-l-primary',
                  )}
                >
                  <span
                    className={cn(
                      'flex-1 text-sm font-medium truncate',
                      isActive && 'text-primary',
                    )}
                  >
                    {entry.cueStackName}
                  </span>
                  {entryStack?.loop && (
                    <RotateCcw className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  {entryStack?.activeCueId != null && !isActive && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-green-500 shrink-0">
                      Live
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
