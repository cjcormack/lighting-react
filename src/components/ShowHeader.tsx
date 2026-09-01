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
import { UNLOCKED_WARNING_CLASS } from '@/lib/lockChrome'
import { Breadcrumbs } from './Breadcrumbs'
import { SaveStatusIndicator } from './SaveStatusIndicator'
import { ViewSwitcher, type ShowView } from './ViewSwitcher'

const PAGE_LABEL: Record<ShowView, string> = {
  programmer: 'Programmer',
  show: 'Show',
  'prompt-book': 'Prompt Book',
  busk: 'Busk',
}

interface ShowHeaderProps {
  /** Drives BOTH the breadcrumb's current-page label and the switcher's active pill. */
  view: ShowView
  projectId: number
  projectName: string
  /**
   * Called when the current-page segment is clicked — Show uses it to leave a drilled stack for the
   * stack list.
   *
   * There used to be an `extra` prop for breadcrumb drill segments, which only Show passed and only
   * to append the drilled stack's name. It was dropped so the live views read identically:
   * `Projects > Project > <View>` everywhere. `Breadcrumbs` kept `extra` for the busk view, which
   * listed the selected targets there and opened the target picker from them; the target band
   * carries both jobs now, so the prop is gone from `Breadcrumbs` too.
   */
  onCurrentPageClick?: () => void
  isShowActive: boolean
  /** Only consulted when the show is stopped — gates the Start button. */
  canStart: boolean
  onStart: () => void
  /** Awaited on confirm; the dialog closes on resolve and stays open on throw. */
  onStop: () => Promise<void>
  /**
   * View-specific buttons, rendered to the LEFT of the switcher so an appearing one never shifts
   * the common controls between views.
   *
   * Held open through two sessions for exactly this: the merged Show view puts its edit-lock toggle
   * and re-lock countdown here (`ShowLockControl`). The lock belongs beside the view switcher rather
   * than in the page body because it changes what the whole view will accept.
   */
  actions?: ReactNode
  /**
   * The show is running and the operator has unlocked it.
   *
   * Washes the header amber, matching what the Prompt Book's toolbar used to do on its own. The
   * signal is for the *unlocked* state, not the locked one: locked is the quiet default, and
   * believing you are locked when you are not is how a show gets edited by accident. With the show
   * stopped there is no lock to be wrong about, so no wash.
   */
  unlockedWarning?: boolean
}

/**
 * Shared header for the four live-show views (Programmer · Show · Prompt Book · Busk): breadcrumbs
 * on the left, then any view-specific actions, the view switcher, a single Start/Stop
 * button, and an always-visible status dot. The switcher, Start/Stop button, and dot are
 * right-anchored so they hold the same position across views regardless of which view
 * contributes actions. Owns the stop-confirmation dialog so every view gets the same guard.
 */
export function ShowHeader({
  view,
  projectId,
  projectName,
  onCurrentPageClick,
  isShowActive,
  canStart,
  onStart,
  onStop,
  actions,
  unlockedWarning = false,
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
    // The transparent border is always present so colouring it cannot shift the layout by a pixel
    // when the lock flips.
    <div
      className={cn(
        '@container flex items-center gap-3 border-b border-transparent p-4 transition-colors',
        unlockedWarning && UNLOCKED_WARNING_CLASS,
      )}
    >
      <div className="flex-1 min-w-0">
        <Breadcrumbs
          projectName={projectName}
          currentPage={PAGE_LABEL[view]}
          collapsedLabel={PAGE_LABEL[view]}
          onCurrentPageClick={onCurrentPageClick}
        />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Ahead of the view-specific actions: everything to its right is fixed-position, so the
            pill appearing and clearing can't shift the Start/Stop button under the cursor. */}
        <SaveStatusIndicator />
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
                <span className="hidden @[420px]:inline">Stop</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Stop show</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={onStart} disabled={!canStart} aria-label="Start show">
                <Play className="size-3.5" />
                <span className="hidden @[420px]:inline">Start</span>
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
