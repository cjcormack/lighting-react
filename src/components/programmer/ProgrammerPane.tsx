import { ChevronDown, ChevronRight, SlidersVertical } from 'lucide-react'
import { usePersistentState } from '../../hooks/usePersistentState'
import { useProgrammerSummaryQuery } from '../../store/programmer'
import { ProgrammerSheet } from './ProgrammerSheet'

const OPEN_KEY = 'program.programmerPane'

/**
 * The programmer sheet embedded in the Program view, so busking a look and shaping the cue
 * it belongs to happen on one screen — the flow Include → edit → Update is built around
 * (Sessions 3 onward).
 *
 * Collapsed by default and persisted: Program is primarily a cue-authoring surface, and the
 * sheet is tall enough that always-open would push the cue list off-screen.
 */
export function ProgrammerPane() {
  const [open, setOpen] = usePersistentState<boolean>(OPEN_KEY, false)
  const { data: summary } = useProgrammerSummaryQuery()

  const entryCount = summary?.entryCount ?? 0
  const blind = summary?.blind ?? false

  return (
    <div className="border-b">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/30"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <SlidersVertical className="size-3.5" />
        Programmer
        {/* Surfaced on the collapsed header too — the whole point of the indicator is that
            you never have to open something to learn the programmer is holding values. */}
        {entryCount > 0 && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] tabular-nums text-primary">
            {entryCount}
          </span>
        )}
        {blind && (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
            Blind
          </span>
        )}
      </button>
      {open && (
        <div className="max-h-[45vh] overflow-auto px-4 pb-3">
          <ProgrammerSheet />
        </div>
      )}
    </div>
  )
}
