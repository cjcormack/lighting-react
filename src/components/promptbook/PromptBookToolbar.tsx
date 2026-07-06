import { Lock, LockOpen, TriangleAlert, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface PromptBookToolbarProps {
  bookName: string
  locked: boolean
  canEdit: boolean
  onToggleLock: () => void
  canUndo: boolean
  onUndo: () => void
  activeLabel: string | null
  warningCount: number
  onToggleWarnings: () => void
  /** Idle re-lock countdown (seconds); null unless the countdown is running. */
  relockCountdown: number | null
  onStayUnlocked: () => void
}

/**
 * Header bar over the script pane. The lock state is deliberately unmistakable:
 * locked is the app's quiet default chrome; unlocked shifts the whole bar amber
 * with a pulsing EDITING badge (thinking you're locked when you're not can
 * corrupt the prompt-book mid-show).
 */
export function PromptBookToolbar({
  bookName,
  locked,
  canEdit,
  onToggleLock,
  canUndo,
  onUndo,
  activeLabel,
  warningCount,
  onToggleWarnings,
  relockCountdown,
  onStayUnlocked,
}: PromptBookToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b px-4 py-2 shrink-0 transition-colors',
        locked ? 'bg-background' : 'bg-amber-400/15 border-amber-500/50',
      )}
    >
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground shrink-0">
        Prompt book
      </span>
      <span className="text-sm font-medium truncate">{bookName}</span>

      {activeLabel && (
        <span className="ml-2 rounded border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-xs font-bold text-amber-500 whitespace-nowrap">
          ▶ {activeLabel}
        </span>
      )}

      <span className="flex-1" />

      {relockCountdown != null && (
        <span className="flex items-center gap-2 rounded-md border border-amber-500 bg-amber-400/20 px-2 py-1 text-xs font-medium text-amber-600 whitespace-nowrap">
          Re-locking in {relockCountdown}s
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onStayUnlocked}>
            Stay unlocked
          </Button>
        </span>
      )}

      {warningCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onToggleWarnings} className="text-red-500 hover:text-red-400">
              <TriangleAlert className="size-4" />
              {warningCount}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Desync warnings — advisory only</TooltipContent>
        </Tooltip>
      )}

      {!locked && canUndo && (
        <Button variant="outline" size="sm" onClick={onUndo}>
          <Undo2 className="size-3.5" />
          Undo move
        </Button>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={locked ? 'outline' : 'default'}
            size="sm"
            onClick={onToggleLock}
            disabled={!canEdit}
            aria-label={locked ? 'Unlock for editing' : 'Lock the prompt book'}
            className={cn(
              !locked &&
                'bg-amber-500 text-amber-950 hover:bg-amber-400 font-bold animate-pulse [animation-duration:2.5s]',
            )}
          >
            {locked ? (
              <>
                <Lock className="size-3.5" /> Locked
              </>
            ) : (
              <>
                <LockOpen className="size-3.5" /> EDITING — tap to lock
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {locked ? 'Unlock to edit anchors & annotations (L)' : 'Lock the prompt book (L)'}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
