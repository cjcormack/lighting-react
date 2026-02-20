import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Plus,
  Layers,
  Clapperboard,
  ListFilter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CueStack } from '@/api/cueStacksApi'

export type CueStackView = 'all' | 'standalone' | number

interface CueStackPanelContentProps {
  stacks: CueStack[]
  selectedView: CueStackView
  onSelectView: (view: CueStackView) => void
  activeStackIds: Set<number>
  standaloneCueCount: number
  totalCueCount: number
  onCreateStack: () => void
}

/** Shared content rendered inside both desktop sidebar and mobile sheet */
function PanelContent({
  stacks,
  selectedView,
  onSelectView,
  activeStackIds,
  standaloneCueCount,
  totalCueCount,
  onCreateStack,
}: CueStackPanelContentProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {/* Filter options */}
        <div className="space-y-0.5 p-2">
          <button
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors',
              selectedView === 'all'
                ? 'bg-accent text-accent-foreground font-medium'
                : 'hover:bg-accent/50 text-muted-foreground',
            )}
            onClick={() => onSelectView('all')}
          >
            <Clapperboard className="size-4 shrink-0" />
            <span className="flex-1 text-left">All Cues</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {totalCueCount}
            </Badge>
          </button>
          <button
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors',
              selectedView === 'standalone'
                ? 'bg-accent text-accent-foreground font-medium'
                : 'hover:bg-accent/50 text-muted-foreground',
            )}
            onClick={() => onSelectView('standalone')}
          >
            <Clapperboard className="size-4 shrink-0" />
            <span className="flex-1 text-left">Standalone</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {standaloneCueCount}
            </Badge>
          </button>
        </div>

        {/* Stacks */}
        {stacks.length > 0 && (
          <div className="px-2 pb-2">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2.5 py-1.5">
              Stacks
            </div>
            <div className="space-y-0.5">
              {stacks.map((stack) => {
                const isActive = activeStackIds.has(stack.id)
                const isSelected = selectedView === stack.id
                return (
                  <button
                    key={stack.id}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors',
                      isSelected
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'hover:bg-accent/50',
                      isActive && !isSelected && 'text-primary',
                    )}
                    onClick={() => onSelectView(stack.id)}
                  >
                    <Layers className="size-4 shrink-0" />
                    <span className="flex-1 text-left truncate">{stack.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isActive && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          active
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {stack.cues.length}
                      </Badge>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Create stack button */}
      <div className="border-t p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={onCreateStack}
        >
          <Plus className="size-3.5" />
          New Stack
        </Button>
      </div>
    </div>
  )
}

/** Desktop fixed sidebar */
export function CueStackSidebar(props: CueStackPanelContentProps) {
  return (
    <div className="w-56 lg:w-72 shrink-0 border-r flex flex-col h-full overflow-hidden">
      <PanelContent {...props} />
    </div>
  )
}

/** Mobile sheet drawer trigger + content */
export function CueStackMobileSheet({
  open,
  onOpenChange,
  selectedViewLabel,
  ...props
}: CueStackPanelContentProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedViewLabel: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0">
          <ListFilter className="size-3.5" />
          {selectedViewLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh]">
        <SheetHeader>
          <SheetTitle>Cue Stacks</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden -mx-6">
          <PanelContent
            {...props}
            onSelectView={(view) => {
              props.onSelectView(view)
              onOpenChange(false)
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
