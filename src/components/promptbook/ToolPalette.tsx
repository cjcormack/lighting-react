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
 * while unlocked. Its amber wash matches the app's "you are editing" signal.
 * Cue anchors are placed from the cue list (click a cue → click the script), so
 * this bar covers only the free annotations.
 */
export function ToolPalette({
  tool,
  onSelectTool,
}: {
  tool: PromptBookTool
  onSelectTool: (tool: PromptBookTool) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-amber-500/40 bg-amber-400/10 px-4 py-1.5">
      <span className="mr-1 text-[10px] font-bold tracking-widest text-amber-600/80 uppercase">Annotate</span>
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
                : 'bg-amber-400/20 text-amber-600 hover:bg-amber-400/25 hover:text-amber-600'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </Button>
      ))}
      <span className="flex-1" />
      <span className="hidden text-[11px] text-muted-foreground md:inline">
        Pick a tool, then drag a region on the script. Place cue anchors from the cue list.
      </span>
    </div>
  )
}
