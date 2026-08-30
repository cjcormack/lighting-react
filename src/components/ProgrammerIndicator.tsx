import { EyeOff, SlidersHorizontal } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { pathHasSegment } from '@/lib/navMatch'
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
 *
 * — unless something beside it already says so. `blindShownSeparately` is for exactly one host: the
 * `ShowBar`, which since session 2b carries its own amber **BLIND** tile a couple of elements away.
 * Two amber badges saying the same word is worse than one, and the tile is both louder and
 * actionable. The app-header mount passes nothing, because there is no tile there and blind must
 * still be visible from `/fixtures`.
 */
export function ProgrammerIndicator({
  className,
  blindShownSeparately = false,
}: {
  className?: string
  /** A dedicated Blind control sits next to this one, so don't report blind here as well. */
  blindShownSeparately?: boolean
}) {
  const { data: summary } = useProgrammerSummaryQuery()
  const { data: currentProject } = useCurrentProjectQuery()
  const location = useLocation()

  const entryCount = summary?.entryCount ?? 0
  const blind = summary?.blind ?? false
  /** Whether *this* badge is the one drawing the blind state. */
  const reportBlind = blind && !blindShownSeparately
  // With blind reported elsewhere, an empty programmer leaves nothing at all to say.
  if (entryCount === 0 && !reportBlind) return null

  // The programmer is its own page again, so the link goes there. The "am I already there?" test
  // is segment-aware rather than a bare `startsWith`, which is a trap in both directions: while
  // this pointed at `/program`, the sibling `/projects/1/programmer` DID start with it — and would
  // have read as "already there" on the one page that needed the link least, and as "not there" the
  // other way round. It used to say so by hand; it now shares `pathHasSegment` with
  // `mostSpecificActiveId`, which is the third site to have wanted exactly this. A subroute still
  // counts as being here.
  const programmerPath = currentProject ? `/projects/${currentProject.id}/programmer` : null
  const onProgrammer = programmerPath != null && pathHasSegment(location.pathname, programmerPath)

  const body = (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium tabular-nums',
        reportBlind
          ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300'
          : 'border-primary/50 bg-primary/10 text-primary',
        className,
      )}
    >
      {reportBlind ? <EyeOff className="size-3.5" /> : <SlidersHorizontal className="size-3.5" />}
      {/* The eye-off icon already says "blind"; spelling it out as well is what tips the
          app header onto a third row at phone widths. Keep the count, drop the word. */}
      {reportBlind && <span className="hidden @[760px]:inline">Blind</span>}
      {reportBlind && entryCount > 0 && <span className="hidden @[760px]:inline">·</span>}
      {entryCount > 0 && <span>{entryCount}</span>}
    </span>
  )

  const tip = [
    entryCount > 0
      ? `Programmer holds ${entryCount} value${entryCount === 1 ? '' : 's'}`
      : 'Programmer is empty',
    // Kept even where the badge itself stays quiet: "5 values, and none of them reaching the
    // stage" is the useful sentence, and a tooltip costs no width beside the tile.
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
