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

  // Program hosts the programmer now, so the link goes there — and the "am I already there?" test
  // can no longer be `startsWith`. `/projects/1/programmer` starts with `/projects/1/program`, so a
  // stale link or an in-flight legacy redirect would suppress the link on the one page that needs
  // it. This is the segment-aware idiom `ProjectSwitcher.mostSpecificActiveId` uses; a drilled stack
  // (`/program/stacks/5`) still counts as "already there", because the pane is on that page too.
  const programmerPath = currentProject ? `/projects/${currentProject.id}/program` : null
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
        {programmerPath && !onProgrammer ? (
          <Link to={programmerPath} aria-label={tip}>
            {body}
          </Link>
        ) : (
          <div aria-label={tip}>{body}</div>
        )}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}
