import { useState, type ReactNode } from 'react'
import { Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Breadcrumbs } from './Breadcrumbs'
import { ViewSwitcher, type ShowView } from './ViewSwitcher'

const PAGE_LABEL: Record<ShowView, string> = {
  program: 'Program',
  run: 'Run',
  'prompt-book': 'Prompt Book',
}

interface ShowHeaderProps {
  /** Drives BOTH the breadcrumb's current-page label and the switcher's active pill. */
  view: ShowView
  projectId: number
  projectName: string
  /** Breadcrumb drill segments (e.g. Program's drilled-into stack name). */
  extra?: string[]
  onCurrentPageClick?: () => void
  isShowActive: boolean
  /** Only consulted when the show is stopped — gates the Start button. */
  canStart: boolean
  onStart: () => void
  /** Awaited on confirm; the dialog closes on resolve and stays open on throw. */
  onStop: () => Promise<void>
  /** View-specific buttons (e.g. Run's "Edit Cue"). Rendered to the LEFT of the switcher
   *  so it never shifts the common controls' positions between views. */
  actions?: ReactNode
}

/**
 * Shared header for the three live-show views (Program · Run · Prompt Book): breadcrumbs
 * on the left, then any view-specific actions, the view switcher, a single Start/Stop
 * button, and an always-visible status dot. The switcher, Start/Stop button, and dot are
 * right-anchored so they hold the same position across views regardless of which view
 * contributes actions. Owns the stop-confirmation dialog so every view gets the same guard.
 */
export function ShowHeader({
  view,
  projectId,
  projectName,
  extra,
  onCurrentPageClick,
  isShowActive,
  canStart,
  onStart,
  onStop,
  actions,
}: ShowHeaderProps) {
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
  const [stopping, setStopping] = useState(false)

  const handleConfirmStop = async () => {
    setStopping(true)
    try {
      await onStop()
      setStopConfirmOpen(false)
    } catch {
      // Keep the dialog open so the operator can retry.
    } finally {
      setStopping(false)
    }
  }

  return (
    <div className="@container flex items-center p-4 gap-3">
      <div className="flex-1 min-w-0">
        <Breadcrumbs
          projectName={projectName}
          currentPage={PAGE_LABEL[view]}
          collapsedLabel={PAGE_LABEL[view]}
          extra={extra}
          onCurrentPageClick={onCurrentPageClick}
        />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actions}
        <ViewSwitcher current={view} projectId={projectId} />
        {isShowActive ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setStopConfirmOpen(true)}
                aria-label="Stop show"
              >
                <Square className="size-3.5" />
                <span className="hidden min-[420px]:inline">Stop</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Stop show</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={onStart} disabled={!canStart} aria-label="Start show">
                <Play className="size-3.5" />
                <span className="hidden min-[420px]:inline">Start</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Start show</TooltipContent>
          </Tooltip>
        )}
        <span
          className={cn(
            'size-3 shrink-0 rounded-full ml-1',
            isShowActive ? 'bg-green-500 shadow-[0_0_6px_#22c55e]' : 'bg-muted-foreground/40',
          )}
          aria-label={isShowActive ? 'Show is running' : 'Show is stopped'}
          title={isShowActive ? 'Show is running' : 'Show is stopped'}
        />
      </div>

      <Dialog
        open={stopConfirmOpen}
        onOpenChange={(open) => {
          if (!stopping) setStopConfirmOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop the show?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            This will deactivate the show and clear the active cue. You can start it again from any
            view at any time.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopConfirmOpen(false)} disabled={stopping}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmStop} disabled={stopping}>
              {stopping ? 'Stopping…' : 'Stop Show'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
