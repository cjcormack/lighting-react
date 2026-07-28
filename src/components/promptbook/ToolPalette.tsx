import { MousePointer2, StickyNote, Strikethrough, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type PromptBookTool = 'move' | 'note' | 'strikethrough' | 'freetext'

const TOOLS: { id: PromptBookTool; label: string; icon: typeof MousePointer2; danger?: boolean }[] = [
  { id: 'move', label: 'Select', icon: MousePointer2 },
  { id: 'note', label: 'Add note', icon: StickyNote },
  { id: 'strikethrough', label: 'Mark cut', icon: Strikethrough, danger: true },
  { id: 'freetext', label: 'Text', icon: Type },
]

/**
 * Edit-mode annotation bar — a horizontal row under the toolbar, rendered only
 * while unlocked. Cue anchors are placed from the cue list (click a cue → click the
 * script), so this bar covers only the free annotations.
 *
 * `warn` carries the app's "you are editing" signal: amber while the show is RUNNING,
 * where being unlocked is a hazard. Editing a stopped show is the ordinary case and
 * gets ordinary chrome.
 */
export function ToolPalette({
  tool,
  warn,
  placingLabel,
  onSelectTool,
}: {
  tool: PromptBookTool
  /** Unlocked mid-show — wash the bar amber. */
  warn: boolean
  /** When a cue is armed for (re-)anchoring, its label ("Q12") — shows a targeted prompt. */
  placingLabel?: string | null
  onSelectTool: (tool: PromptBookTool) => void
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1.5 border-b px-4 py-1.5',
        warn && 'border-amber-500/40 bg-amber-400/10',
      )}
    >
      <span
        className={cn(
          'mr-1 text-[10px] font-bold tracking-widest uppercase',
          warn ? 'text-amber-600/80' : 'text-muted-foreground',
        )}
      >
        Annotate
      </span>
      {TOOLS.map(({ id, label, icon: Icon, danger }) => (
        <Button
          key={id}
          variant="ghost"
          size="sm"
          onClick={() => onSelectTool(id)}
          className={cn(
            'h-7 gap-1.5 px-2 text-xs',
            tool === id
              ? danger
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/20 hover:text-red-400'
                : warn
                  ? 'bg-amber-400/20 text-amber-600 hover:bg-amber-400/25 hover:text-amber-600'
                  : 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </Button>
      ))}
      <span className="flex-1" />
      {placingLabel ? (
        <span className="text-[11px] font-semibold text-amber-600">
          Select the script text to anchor {placingLabel}…
        </span>
      ) : (
        <span className="hidden text-[11px] text-muted-foreground md:inline">
          Select script text to highlight, cut, or note it — or arm a cue in the list, then select its line.
          On scanned pages, pick a tool and drag a box.
        </span>
      )}
    </div>
  )
}
