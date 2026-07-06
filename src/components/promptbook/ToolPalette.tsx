import { MousePointer2, StickyNote, Strikethrough, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type PromptBookTool = 'move' | 'note' | 'strikethrough' | 'freetext'

const TOOLS: { id: PromptBookTool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'move', label: 'Select / move anchors', icon: MousePointer2 },
  { id: 'note', label: 'Note — drag a region, then type', icon: StickyNote },
  { id: 'strikethrough', label: 'Strikethrough — mark a cut section', icon: Strikethrough },
  { id: 'freetext', label: 'Freetext on the script', icon: Type },
]

/**
 * Editing tool palette — only rendered while unlocked. Its presence is itself
 * part of the "you are editing" signal.
 */
export function ToolPalette({
  tool,
  onSelectTool,
}: {
  tool: PromptBookTool
  onSelectTool: (tool: PromptBookTool) => void
}) {
  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-lg border border-amber-500/40 bg-background/95 p-1 shadow-lg">
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSelectTool(id)}
              aria-label={label}
              className={cn(
                'size-8',
                tool === id && 'bg-amber-400/20 text-amber-500 hover:bg-amber-400/25 hover:text-amber-500',
              )}
            >
              <Icon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
