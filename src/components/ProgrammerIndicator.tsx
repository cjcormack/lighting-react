import { EyeOff, SlidersHorizontal } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useProgrammerSummaryQuery } from '../store/programmer'
import { useCurrentProjectQuery } from '../store/projects'

/**
 * "The programmer holds data" indicator — the console convention that stops an operator
 * wondering why the rig ignores their cues. Self-contained (it reads its own state) so it
 * can be dropped into any chrome without threading props.
 *
 * Silent when there is nothing to say: no entries and not blind. Blind alone is worth
 * shouting about, because a blind programmer looks *exactly* like a working one until you
 * notice the stage never changed.
 */
export function ProgrammerIndicator({ className }: { className?: string }) {
  const { data: summary } = useProgrammerSummaryQuery()
  const { data: currentProject } = useCurrentProjectQuery()
  const location = useLocation()

  const entryCount = summary?.entryCount ?? 0
  const blind = summary?.blind ?? false
  if (entryCount === 0 && !blind) return null

  // The programmer is its own page again, so the link goes there. The "am I already there?" test
  // stays segment-aware rather than a bare `startsWith`, which is a trap in both directions: while
  // this pointed at `/program`, the sibling `/projects/1/programmer` DID start with it — and would
  // have read as "already there" on the one page that needed the link least, and as "not there" the
  // other way round. Same idiom as `mostSpecificActiveId`; a subroute still counts as being here.
  const programmerPath = currentProject ? `/projects/${currentProject.id}/programmer` : null
  const onProgrammer =
    programmerPath != null &&
    (location.pathname === programmerPath || location.pathname.startsWith(`${programmerPath}/`))

  const body = (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium tabular-nums',
        blind
          ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300'
          : 'border-primary/50 bg-primary/10 text-primary',
        className,
      )}
    >
      {blind ? <EyeOff className="size-3.5" /> : <SlidersHorizontal className="size-3.5" />}
      {/* The eye-off icon already says "blind"; spelling it out as well is what tips the
          app header onto a third row at phone widths. Keep the count, drop the word. */}
      {blind && <span className="hidden @[760px]:inline">Blind</span>}
      {blind && entryCount > 0 && <span className="hidden @[760px]:inline">·</span>}
      {entryCount > 0 && <span>{entryCount}</span>}
    </span>
  )

  const tip = [
    entryCount > 0
      ? `Programmer holds ${entryCount} value${entryCount === 1 ? '' : 's'}`
      : 'Programmer is empty',
    blind ? 'Blind — the programmer is gated out of the stage output' : null,
    // Only offer the trip if we aren't already there.
    programmerPath && !onProgrammer ? 'Go to the programmer to clear or edit' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* `shrink-0` on the OUTER element: `className` lands on the inner body span, so without
            it the ShowBar can squeeze this to nothing while the badge inside keeps its width. */}
        {programmerPath && !onProgrammer ? (
          <Link to={programmerPath} aria-label={tip} className="flex shrink-0 items-center">
            {body}
          </Link>
        ) : (
          <div aria-label={tip} className="flex shrink-0 items-center">
            {body}
          </div>
        )}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}
